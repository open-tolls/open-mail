# Fase 4 — Thread List & Message View

**Duracao estimada:** 3 semanas
**Dependencia:** Fase 1 (models), Fase 2 (sync), Fase 3 (UI shell)
**Objetivo:** Implementar as duas views centrais do cliente de email — a lista de threads (inbox, sent, etc.) e a visualizacao de mensagens. Ao final, o usuario consegue navegar por folders, ver threads e ler emails.

---

## Contexto

No Mailspring, a thread list e o plugin `thread-list/` (26 arquivos) que usa `MultiselectList`, `ListTabular`, `ObservableListDataSource` e `QuerySubscription` para exibir threads com virtualizacao e selecao. A message list e o plugin `message-list/` (26 arquivos) com rendering de HTML em iframe isolado.

No Open Mail, substituimos por componentes React modernos com virtualizacao via `@tanstack/react-virtual`, dados carregados via Tauri commands e reatividade via Tauri events + Zustand.

---

## Entregaveis

### 4.1 — Thread List (Virtualized)

**Referencia Mailspring:** `app/internal_packages/thread-list/` — `thread-list.tsx`, `thread-list-item.tsx`

**O que implementar:**

```
src/components/thread-list/
├── ThreadList.tsx           # Container com virtualizacao
├── ThreadListItem.tsx       # Item individual de thread
├── ThreadListToolbar.tsx    # Toolbar contextual (selecao)
├── ThreadListEmpty.tsx      # Estado vazio
├── ThreadListLoading.tsx    # Skeleton loading
└── ThreadListFilters.tsx    # Filtros (unread, starred, has attachment)
```

**ThreadList.tsx:**

```tsx
export function ThreadList() {
  const { threads, isLoading, hasMore, loadMore } = useThreads();
  const selectedThreadId = useUIStore((s) => s.selectedThreadId);
  const selectThread = useUIStore((s) => s.selectThread);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
  });

  // Infinite scroll
  useEffect(() => {
    const lastItem = virtualizer.getVirtualItems().at(-1);
    if (lastItem && lastItem.index >= threads.length - 5 && hasMore) {
      loadMore();
    }
  }, [virtualizer.getVirtualItems()]);

  return (
    <div ref={parentRef} className="flex-1 overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <ThreadListItem
            key={threads[virtualRow.index].id}
            thread={threads[virtualRow.index]}
            isSelected={threads[virtualRow.index].id === selectedThreadId}
            onSelect={() => selectThread(threads[virtualRow.index].id)}
            style={{
              position: 'absolute',
              top: virtualRow.start,
              height: virtualRow.size,
              width: '100%',
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

**ThreadListItem.tsx:**

Cada item mostra:
- **Avatar** do remetente (iniciais ou foto)
- **Nome** do remetente (ou "Me" se enviado)
- **Subject** (bold se unread)
- **Snippet** (preview do body, truncado)
- **Data/hora** (relativa: "2m ago", "Yesterday", "Mar 12")
- **Badge de unread** (bolinha azul)
- **Icone de star** (se starred)
- **Icone de attachment** (se tem anexos)
- **Label badges** (se tem labels)

```
┌──────────────────────────────────────────┐
│ [AV] Alice Wonderland         2:30 PM  ★ │
│      Re: Project update          📎     │
│      Hey team, just wanted to share...   │
│      ┌─────┐ ┌──────┐                   │
│      │Work │ │Urgent│                    │
│      └─────┘ └──────┘                   │
└──────────────────────────────────────────┘
```

**Interacoes:**
- Click → seleciona thread e mostra mensagens
- Double-click → abre em nova janela (futuro)
- Right-click → context menu (reply, forward, archive, trash, star, labels)
- Shift+click → selecao multipla
- Cmd+click → toggle selecao
- Swipe left → archive (mobile-like, futuro)
- Swipe right → trash (mobile-like, futuro)
- Hover → quick actions (archive, trash, mark read/unread, snooze)

**Quick actions on hover:**

```
┌──────────────────────────────────────────┐
│ [AV] Alice Wonderland   [📥][🗑️][📧][⏰] │
│      Re: Project update                  │
└──────────────────────────────────────────┘
```

| Icone | Acao           | Atalho |
|-------|----------------|--------|
| 📥    | Archive        | `e`    |
| 🗑️    | Trash          | `#`    |
| 📧    | Mark read/unread| `u`   |
| ⏰    | Snooze         | `b`    |

**Criterio de aceite:**
- [x] Lista virtualizada renderiza 10.000+ threads sem lag
- [x] Infinite scroll carrega mais threads ao rolar
- [x] Item exibe todas as informacoes (sender, subject, snippet, date, flags)
- [x] Selecao simples e multipla funciona
- [x] Quick actions on hover funcionam
- [x] Context menu funciona
- [x] Navegacao j/k funciona
- [x] Estado vazio e loading exibidos corretamente
- [x] Unread threads em bold

> Status: thread list implementada em `src/components/thread-list/` com windowing local, filtros, toolbar contextual, scroll infinito, context menu e testes de 10.000 threads.

---

### 4.2 — useThreads Hook (Data Fetching)

**O que implementar:**

```typescript
// src/hooks/useThreads.ts
export function useThreads() {
  const accountId = useAccountStore((s) => s.selectedAccountId);
  const folderId = useFolderStore((s) => s.selectedFolderId);
  const threads = useThreadStore((s) => s.threads);
  const fetchThreads = useThreadStore((s) => s.fetchThreads);
  const fetchMore = useThreadStore((s) => s.fetchMore);
  const isLoading = useThreadStore((s) => s.isLoading);

  // Fetch inicial quando folder muda
  useEffect(() => {
    if (accountId && folderId) {
      fetchThreads(accountId, folderId);
    }
  }, [accountId, folderId]);

  // Escutar mudancas do backend
  useTauriEvent<string[]>('db:threads-changed', (threadIds) => {
    // Re-fetch threads que mudaram
    fetchThreads(accountId!, folderId!);
  });

  return {
    threads,
    isLoading,
    hasMore: useThreadStore((s) => s.hasMore),
    loadMore: () => fetchMore(accountId!, folderId!),
  };
}
```

**ThreadStore:**

```typescript
// src/stores/useThreadStore.ts
interface ThreadState {
  threads: Thread[];
  isLoading: boolean;
  hasMore: boolean;
  offset: number;
  pageSize: number;

  fetchThreads: (accountId: string, folderId: string) => Promise<void>;
  fetchMore: (accountId: string, folderId: string) => Promise<void>;
  updateThread: (threadId: string, partial: Partial<Thread>) => void;
  removeThread: (threadId: string) => void;
}
```

**Criterio de aceite:**
- [x] Threads carregam ao selecionar folder
- [x] Paginacao funciona (50 threads por pagina)
- [x] Re-fetch automatico quando backend emite evento
- [x] Loading state enquanto busca
- [x] Cache de threads por folder (evitar re-fetch ao voltar)

> Status: `useThreads` e `useThreadStore` agora suportam pagina de 50 threads, cache por `accountId:folderId`, `loadMore` e refresh por `domain:event`. A shell ainda usa o hook legado ate o proximo corte de integracao.

---

### 4.3 — Message View

**Referencia Mailspring:** `app/internal_packages/message-list/` — `message-list.tsx`, `message-item.tsx`, `message-item-body.tsx`

**O que implementar:**

```
src/components/message-list/
├── MessageList.tsx           # Container de mensagens do thread
├── MessageItem.tsx           # Uma mensagem individual
├── MessageHeader.tsx         # Header (from, to, cc, date)
├── MessageBody.tsx           # Body renderizado (HTML sanitizado)
├── MessageActions.tsx        # Botoes de acao (reply, forward, etc.)
├── MessageAttachments.tsx    # Lista de anexos
├── MessageCollapsed.tsx      # Mensagem colapsada (so header)
└── MessageQuoteToggle.tsx    # Toggle de quoted text
```

**MessageList.tsx:**

```tsx
export function MessageList() {
  const threadId = useUIStore((s) => s.selectedThreadId);
  const { messages, isLoading } = useMessages(threadId);

  if (!threadId) return <EmptyMessageView />;
  if (isLoading) return <MessageListSkeleton />;

  return (
    <div className="flex-1 overflow-auto p-4">
      {/* Thread subject */}
      <h1 className="text-xl font-semibold mb-4">{messages[0]?.subject}</h1>

      {/* Messages */}
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isLast={index === messages.length - 1}
          defaultExpanded={index === messages.length - 1}
        />
      ))}

      {/* Reply area */}
      <QuickReplyArea threadId={threadId} />
    </div>
  );
}
```

**MessageItem.tsx:**

```tsx
export function MessageItem({ message, isLast, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!expanded) {
    return <MessageCollapsed message={message} onClick={() => setExpanded(true)} />;
  }

  return (
    <article className="border border-border-default rounded-lg mb-3 bg-bg-primary">
      <MessageHeader message={message} onCollapse={() => setExpanded(false)} />
      <MessageBody html={message.body} />
      {message.attachments.length > 0 && (
        <MessageAttachments attachments={message.attachments} />
      )}
      <MessageActions message={message} />
    </article>
  );
}
```

**MessageCollapsed:**

```
┌──────────────────────────────────────────────────┐
│ [AV] Alice Wonderland  •  Hey team, just wan...  │  2:30 PM
└──────────────────────────────────────────────────┘
```

**MessageExpanded:**

```
┌──────────────────────────────────────────────────────┐
│ [AV] Alice Wonderland <alice@example.com>   2:30 PM  │
│ To: bob@example.com, carol@example.com       [▾]     │
│──────────────────────────────────────────────────────│
│                                                       │
│ Hey team,                                             │
│                                                       │
│ Just wanted to share the latest update on the         │
│ project. We've made great progress this week.         │
│                                                       │
│ [Show quoted text ▾]                                  │
│                                                       │
│ ┌─────────────────────────────────┐                   │
│ │ 📎 report.pdf (2.3 MB)  [⬇️]   │                   │
│ │ 📎 screenshot.png (450 KB) [⬇️] │                   │
│ └─────────────────────────────────┘                   │
│                                                       │
│ [↩️ Reply] [↩️ Reply All] [➡️ Forward] [⋮ More]       │
└──────────────────────────────────────────────────────┘
```

**Criterio de aceite:**
- [x] Mensagens do thread exibidas em ordem cronologica
- [x] Ultima mensagem expandida por padrao, anteriores colapsadas
- [x] Click em mensagem colapsada expande
- [x] Header mostra from, to, cc com expand
- [x] Body renderiza HTML sanitizado
- [x] Quoted text colapsavel
- [x] Attachments listados com download
- [x] Acoes (reply, reply all, forward, more)
- [ ] Mark as read automatico ao visualizar

> Status: message view inicial implementada em `src/components/message-list/` com ordem cronologica, expand/collapse, body sanitizado, quoted text colapsavel, anexos listados e acoes basicas. Mark-as-read automatico fica para um corte posterior.

---

### 4.4 — HTML Message Rendering (Seguro)

**Referencia Mailspring:** `app/src/components/evented-iframe.tsx` (14KB) — renderiza em iframe isolado

**O que implementar:**

Renderizar HTML de emails de forma segura, sem iframe (usando shadow DOM ou sanitizacao rigorosa):

```typescript
// src/components/message-list/MessageBody.tsx
import DOMPurify from 'dompurify';

export function MessageBody({ html }: { html: string }) {
  const sanitized = useMemo(() => sanitizeEmailHtml(html), [html]);

  return (
    <div className="message-body px-4 pb-4">
      <div
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    </div>
  );
}

function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'div', 'span', 'a', 'b', 'strong', 'i', 'em', 'u',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
      'img', 'hr', 'sub', 'sup', 'font', 'center',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'style',
      'width', 'height', 'align', 'valign', 'bgcolor',
      'color', 'face', 'size', 'border', 'cellpadding', 'cellspacing',
      'colspan', 'rowspan',
    ],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover'],
    ADD_ATTR: ['target'], // links abrem em browser externo
  });
}
```

**Tratamento especial:**
- Links externos → abrir no browser do sistema (via Tauri `shell.open`)
- Imagens remotas → bloquear por padrao, botao "Load images"
- CID images (inline) → resolver para blob URLs a partir dos attachments
- Tracking pixels → remover (imagens 1x1)
- CSS inline → permitir com restricoes (sem position: fixed, etc.)

**Criterio de aceite:**
- [x] HTML renderizado sem XSS vulnerabilities
- [x] Links abrem no browser externo
- [x] Imagens remotas bloqueadas por padrao
- [x] Botao "Load images" funciona
- [x] Inline images (CID) renderizadas
- [x] Tracking pixels removidos
- [x] Emails em plain text formatados corretamente
- [ ] Tabelas de layout renderizadas corretamente

> Status: sanitizacao conservadora remove tags perigosas, handlers inline e URLs `javascript:`. Links HTTP/HTTPS/mailto sao interceptados para abertura externa, imagens remotas ficam bloqueadas ate "Load remote images", pixels 1x1 sao removidos, imagens `cid:` sao resolvidas por attachments inline com `content_id` + `local_path`, e plain text vira HTML escapado com paragrafos, quebras de linha e links seguros. Tabelas de layout ficam para o proximo corte de rendering seguro.

---

### 4.5 — Attachments

**Referencia Mailspring:** `app/internal_packages/attachments/`

**O que implementar:**

```
src/components/attachments/
├── AttachmentList.tsx         # Lista de anexos
├── AttachmentItem.tsx         # Item individual
├── AttachmentPreview.tsx      # Preview (imagens, PDF)
└── AttachmentDownload.tsx     # Logica de download
```

**AttachmentItem:**

```
┌───────────────────────────────────────┐
│ 📄 report.pdf                2.3 MB   │
│      [Preview]  [Download]  [Save As] │
└───────────────────────────────────────┘
```

**Funcionalidades:**
- Icone por tipo MIME (PDF, imagem, documento, planilha, etc.)
- Tamanho formatado (KB, MB)
- Preview inline para imagens e PDFs
- Download para disco (via Tauri dialog `save`)
- Quick look (preview nativo do OS via Tauri)

**Tauri commands:**

```rust
#[tauri::command]
pub async fn download_attachment(
    state: State<'_, AppState>,
    attachment_id: String,
    save_path: String,
) -> Result<(), DomainError>;

#[tauri::command]
pub async fn get_attachment_data(
    state: State<'_, AppState>,
    attachment_id: String,
) -> Result<Vec<u8>, DomainError>;
```

**Criterio de aceite:**
- [ ] Anexos listados com icone, nome e tamanho
- [ ] Download funciona (dialog de salvar)
- [ ] Preview de imagens inline
- [ ] Preview de PDF (via iframe ou lib)
- [ ] Drag & drop de anexo para desktop (futuro)

---

### 4.6 — Thread Actions

**O que implementar:**

Toolbar contextual quando thread esta selecionado:

```tsx
// src/components/thread-list/ThreadListToolbar.tsx
export function ThreadListToolbar() {
  const selectedIds = useUIStore((s) => s.selectedThreadIds);
  if (selectedIds.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-bg-secondary border-b border-border-default">
      <IconButton icon={Archive} tooltip="Archive (e)" onClick={() => archiveThreads(selectedIds)} />
      <IconButton icon={Trash2} tooltip="Trash (#)" onClick={() => trashThreads(selectedIds)} />
      <IconButton icon={Mail} tooltip="Mark as unread (u)" onClick={() => markUnread(selectedIds)} />
      <IconButton icon={Star} tooltip="Star (s)" onClick={() => starThreads(selectedIds)} />
      <Separator orientation="vertical" />
      <IconButton icon={FolderInput} tooltip="Move to..." onClick={() => openMoveDialog(selectedIds)} />
      <IconButton icon={Tag} tooltip="Label..." onClick={() => openLabelDialog(selectedIds)} />
      <Separator orientation="vertical" />
      <span className="text-xs text-text-secondary">{selectedIds.length} selected</span>
    </div>
  );
}
```

**Move to Folder Dialog:**
- Lista todos os folders da conta
- Busca/filtro inline
- Atalho `v`

**Label Dialog:**
- Checkboxes para labels existentes
- Campo para criar novo label
- Atalho `l`

**Criterio de aceite:**
- [ ] Toolbar aparece ao selecionar thread(s)
- [ ] Archive, trash, star, mark read/unread funcionam
- [ ] Move to folder dialog funciona
- [ ] Label dialog funciona
- [ ] Atalhos de teclado funcionam
- [ ] Optimistic update (UI atualiza antes do IMAP)
- [ ] Undo funciona (snackbar com "Undo" button)

---

### 4.7 — Search

**Referencia Mailspring:** `app/internal_packages/thread-search/` (11 arquivos)

**O que implementar:**

```
src/components/search/
├── SearchBar.tsx              # Input principal na toolbar
├── SearchSuggestions.tsx       # Autocomplete dropdown
├── SearchResults.tsx           # Resultado da busca (reutiliza ThreadList)
└── SearchFilters.tsx           # Filtros avancados (from, to, date, has:attachment)
```

**SearchBar:**
- `Cmd+K` foca
- Autocomplete: contatos, folders, filtros
- Sintaxe de busca: `from:alice subject:report has:attachment after:2024-01-01`
- Busca full-text (via FTS5 no backend)

**Filtros suportados:**

| Filtro           | Exemplo                         | SQL                              |
|------------------|---------------------------------|----------------------------------|
| `from:`          | `from:alice@example.com`        | `WHERE from_json LIKE '%alice%'` |
| `to:`            | `to:bob@example.com`            | `WHERE to_json LIKE '%bob%'`     |
| `subject:`       | `subject:meeting`               | `WHERE subject LIKE '%meeting%'` |
| `has:attachment`  | `has:attachment`                | `WHERE has_attachments = 1`      |
| `is:unread`      | `is:unread`                     | `WHERE is_unread = 1`            |
| `is:starred`     | `is:starred`                    | `WHERE is_starred = 1`           |
| `after:`         | `after:2024-01-01`              | `WHERE date > '2024-01-01'`      |
| `before:`        | `before:2024-06-01`             | `WHERE date < '2024-06-01'`      |
| `in:`            | `in:inbox`                      | `WHERE folder = 'inbox'`         |
| texto livre      | `project update`                | FTS5 MATCH                       |

**Tauri command:**

```rust
#[tauri::command]
pub async fn search_messages(
    state: State<'_, AppState>,
    account_id: String,
    query: String,
    offset: u32,
    limit: u32,
) -> Result<SearchResult, DomainError> {
    let parsed = parse_search_query(&query);
    state.search_service.search(&account_id, &parsed, offset, limit).await
}
```

**Criterio de aceite:**
- [ ] Busca full-text funciona
- [ ] Filtros estruturados funcionam (from, to, subject, etc.)
- [ ] Autocomplete de contatos
- [ ] Resultados exibidos como thread list
- [ ] Performance: busca em <500ms para 100k mensagens
- [ ] Cmd+K abre busca

---

### 4.8 — Undo/Redo

**Referencia Mailspring:** `app/internal_packages/undo-redo/`

**O que implementar:**

```typescript
// src/stores/useUndoStore.ts
interface UndoAction {
  id: string;
  description: string;
  undo: () => Promise<void>;
  timestamp: number;
}

interface UndoState {
  actions: UndoAction[];
  currentToast: UndoAction | null;

  push: (action: UndoAction) => void;
  undo: () => Promise<void>;
  dismiss: () => void;
}
```

**UX:**
- Ao executar uma acao (archive, trash, move, star), exibe toast:
  ```
  ┌─────────────────────────────────┐
  │ Conversation archived    [Undo] │
  └─────────────────────────────────┘
  ```
- Toast desaparece apos 5 segundos
- `Cmd+Z` executa undo

**Criterio de aceite:**
- [ ] Toast de undo aparece apos acoes destrutivas
- [ ] Click em "Undo" reverte a acao
- [ ] Cmd+Z funciona
- [ ] Toast auto-dismiss apos 5s

---

## Dependencias Frontend Adicionais

```bash
npm install @tanstack/react-virtual dompurify
npm install -D @types/dompurify
```

---

## Testes desta Fase

| Tipo        | Escopo                                         | Ferramenta      |
|-------------|------------------------------------------------|-----------------|
| Unit        | ThreadListItem render (props, flags, date)      | Vitest + RTL    |
| Unit        | HTML sanitization                               | Vitest          |
| Unit        | Search query parser                             | Vitest          |
| Unit        | Date formatting (relative dates)                | Vitest          |
| Integracao  | useThreads hook (mock Tauri invoke)             | Vitest          |
| Integracao  | Thread actions (archive, trash, star)           | Vitest          |
| E2E         | Navegar inbox → selecionar thread → ler email   | Playwright      |
| E2E         | Buscar email → ver resultado                    | Playwright      |

---

## Checklist Final da Fase 4

- [x] Thread list virtualizada e performatica
- [x] Thread list item com todas as informacoes visuais
- [x] Infinite scroll funcional
- [x] Selecao simples e multipla
- [x] Quick actions on hover
- [x] Context menu
- [x] Message view com expand/collapse
- [x] HTML rendering seguro (sanitizado)
- [x] Imagens remotas bloqueadas por padrao
- [x] Links externos e Load remote images seguros
- [x] Inline images CID resolvidas
- [x] Plain text formatado com escape seguro
- [ ] Attachments com download e preview
- [ ] Thread actions (archive, trash, star, move, label)
- [ ] Busca full-text + filtros estruturados
- [ ] Undo/redo funcional
- [ ] Keyboard shortcuts (j/k, e, #, s, r, f)
- [ ] Mark as read ao visualizar
- [x] Testes passando
- [ ] CI green

---

**Fase anterior:** [Fase 3 — UI Shell & Layout System](./fase_3.md)
**Proxima fase:** [Fase 5 — Composer & Rich Text Editor](./fase_5.md)
