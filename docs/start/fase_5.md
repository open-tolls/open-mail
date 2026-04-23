# Fase 5 — Composer & Rich Text Editor

**Duracao estimada:** 3 semanas
**Dependencia:** Fase 2 (SMTP send), Fase 3 (UI shell), Fase 4 (message view para reply context)
**Objetivo:** Implementar o compositor de emails com editor rich text (TipTap), suporte a attachments, assinaturas, templates e envio via SMTP. Ao final, o usuario consegue compor, responder, encaminhar e enviar emails.

---

## Contexto

No Mailspring, o composer e o maior plugin interno (`internal_packages/composer/` — 18 arquivos) e usa o editor **Slate** (fork customizado, abandonado). A assinatura e um plugin separado (`composer-signature/`), assim como templates (`composer-templates/`) e grammar check (`composer-grammar-check/`).

No Open Mail, substituimos Slate por **TipTap v2** (baseado em ProseMirror, ativamente mantido). Todas as funcionalidades do composer ficam em um unico modulo coeso.

---

## Stack do Composer

| Tecnologia     | Proposito                          | Substitui no Mailspring        |
|----------------|------------------------------------|---------------------------------|
| TipTap v2      | Rich text editor                   | Slate (fork abandonado)         |
| @tiptap/starter-kit | Extensoes basicas (bold, italic, lists) | Slate plugins          |
| @tiptap/extension-link | Links                        | Custom Slate plugin             |
| @tiptap/extension-image | Inline images               | Custom Slate plugin             |
| @tiptap/extension-placeholder | Placeholder text      | Custom Slate plugin             |
| @tiptap/extension-mention | @mentions para contatos    | ParticipantsTextField           |
| lettre (Rust)  | Envio SMTP                         | Mailcore2 (C++)                 |

---

## Entregaveis

### 5.1 — Composer Layout

**Referencia Mailspring:** `app/internal_packages/composer/lib/composer-view.tsx`

**O que implementar:**

```
src/components/composer/
├── Composer.tsx               # Container principal
├── ComposerHeader.tsx         # From, To, Cc, Bcc, Subject
├── ComposerEditor.tsx         # TipTap editor (body)
├── ComposerToolbar.tsx        # Formatting toolbar
├── ComposerFooter.tsx         # Attachments + Send button
├── ComposerAttachments.tsx    # Lista de anexos adicionados
├── ComposerSignature.tsx      # Assinatura
├── ParticipantField.tsx       # Campo de destinatario com autocomplete
├── ParticipantChip.tsx        # Chip de contato (nome + email)
└── ComposerPopout.tsx         # Composer em janela separada (futuro)
```

**Layout do Composer:**

```
┌──────────────────────────────────────────────────────────┐
│ From: [leco@example.com ▾]                         [✕]  │
│ To:   [Alice Wonderland ✕] [Bob Smith ✕] [          ]   │
│ Cc:   [                                             ]   │
│ Subject: [Re: Project update                        ]   │
├──────────────────────────────────────────────────────────┤
│ [B] [I] [U] [S] │ [H1][H2] │ [•][1.] │ [🔗][📷] │ [<>] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Hi Alice,                                                │
│                                                          │
│ Thanks for the update. I have a few questions:           │
│                                                          │
│ 1. When is the deadline?                                 │
│ 2. Who is responsible for the design?                    │
│                                                          │
│ Best,                                                    │
│ Leco                                                     │
│                                                          │
│ ─── Signature ───                                        │
│ Leco Silva | Staff Engineer                              │
│ leco@example.com                                         │
│                                                          │
│ ─── Quoted Text (collapsed) ───                          │
│ [Show original message ▾]                                │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ 📎 report.pdf (2.3 MB) [✕]                              │
│                                                          │
│ [Attach file]              [Discard]    [Send ▾] [Send]  │
└──────────────────────────────────────────────────────────┘
```

**Modos de abertura:**
1. **New email** — composer vazio (Cmd+N)
2. **Reply** — pre-preenche To, Subject (Re:), quoted text
3. **Reply All** — pre-preenche To + Cc, Subject (Re:), quoted text
4. **Forward** — pre-preenche Subject (Fwd:), body com mensagem original, attachments
5. **Draft** — restaura rascunho salvo

**Criterio de aceite:**
- [ ] Layout completo renderiza
- [ ] Todos os 5 modos de abertura funcionam
- [ ] From selector (quando ha multiplas contas)
- [ ] Cc/Bcc toggleaveis (ocultos por padrao, mostrar com botao)
- [ ] Fechar composer pede confirmacao se ha conteudo

> Status: primeiro corte do composer integrado ao shell. O formulario improvisado da sidebar foi substituido por `src/components/composer/` com painel dedicado, `From`, `To`, `Cc/Bcc` toggleaveis, `Subject`, body em textarea, footer de envio e confirmacao ao fechar quando o draft foi alterado. Os modos `reply`, `reply all`, `forward`, selector real de contas e editor rich text ficam para os proximos cortes.

---

### 5.2 — Participant Fields (To, Cc, Bcc)

**Referencia Mailspring:** `app/src/components/participants-text-field.tsx` (8.7KB), `app/src/components/tokenizing-text-field.tsx` (30KB)

**O que implementar:**

```tsx
// src/components/composer/ParticipantField.tsx
export function ParticipantField({ label, value, onChange }: Props) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Contact[]>([]);

  // Buscar contatos conforme digita
  useEffect(() => {
    if (inputValue.length >= 2) {
      api.contacts.search(inputValue, 10).then(setSuggestions);
    } else {
      setSuggestions([]);
    }
  }, [inputValue]);

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border-default">
      <span className="text-sm text-text-secondary w-8">{label}:</span>
      <div className="flex flex-wrap items-center gap-1 flex-1">
        {value.map(contact => (
          <ParticipantChip
            key={contact.email}
            contact={contact}
            onRemove={() => onChange(value.filter(c => c.email !== contact.email))}
          />
        ))}
        <input
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? 'Add recipients...' : ''}
        />
      </div>
      {suggestions.length > 0 && (
        <SuggestionsDropdown
          suggestions={suggestions}
          onSelect={handleSelectContact}
        />
      )}
    </div>
  );
}
```

**ParticipantChip:**

```
┌───────────────────────┐
│ Alice Wonderland  [✕] │
└───────────────────────┘
```

- Mostra nome (ou email se sem nome)
- Tooltip com email completo
- Cor vermelha se email invalido
- Remove com click no X ou Backspace

**Comportamento de input:**
- Autocomplete de contatos ao digitar (minimo 2 caracteres)
- Enter ou Tab seleciona sugestao
- Virgula ou ponto-e-virgula cria chip com texto digitado
- Paste de multiplos emails (separados por virgula/newline) cria multiplos chips
- Validacao de email (regex basica)
- Backspace remove ultimo chip quando input vazio

**Criterio de aceite:**
- [ ] Autocomplete de contatos funciona
- [ ] Chips renderizam corretamente
- [ ] Paste de multiplos emails funciona
- [ ] Validacao visual de email invalido
- [ ] Keyboard navigation (Tab, Enter, Backspace, Escape)
- [ ] Cc/Bcc toggleaveis

> Status: `ParticipantField` e `ParticipantChip` agora suportam chips, sugestoes locais a partir dos participantes conhecidos do mailbox, selecao com Enter/Tab, paste de multiplos emails, remocao com Backspace e destaque visual para destinatarios invalidos. A busca remota em contatos reais via backend ainda fica para um corte posterior.

---

### 5.3 — TipTap Editor (Rich Text)

**Referencia Mailspring:** `app/src/components/composer-editor/` (21 arquivos, Slate-based)

**O que implementar:**

```tsx
// src/components/composer/ComposerEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';

export function ComposerEditor({ initialContent, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener' },
      }),
      Image,
      Placeholder.configure({
        placeholder: 'Write your message...',
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Color,
      TextStyle,
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
      },
    },
  });

  return (
    <div className="flex-1 overflow-auto">
      <ComposerToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
```

**ComposerToolbar:**

```tsx
// src/components/composer/ComposerToolbar.tsx
export function ComposerToolbar({ editor }: { editor: Editor }) {
  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border-default">
      {/* Text formatting */}
      <ToolbarButton
        icon={Bold}
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        tooltip="Bold (Cmd+B)"
      />
      <ToolbarButton
        icon={Italic}
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        tooltip="Italic (Cmd+I)"
      />
      <ToolbarButton
        icon={UnderlineIcon}
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        tooltip="Underline (Cmd+U)"
      />
      <ToolbarButton
        icon={Strikethrough}
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        tooltip="Strikethrough"
      />

      <ToolbarSeparator />

      {/* Headings */}
      <ToolbarButton
        icon={Heading1}
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        icon={Heading2}
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />

      <ToolbarSeparator />

      {/* Lists */}
      <ToolbarButton
        icon={List}
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        tooltip="Bullet list"
      />
      <ToolbarButton
        icon={ListOrdered}
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        tooltip="Numbered list"
      />

      <ToolbarSeparator />

      {/* Insert */}
      <ToolbarButton
        icon={LinkIcon}
        onClick={() => openLinkDialog(editor)}
        tooltip="Insert link (Cmd+K)"
      />
      <ToolbarButton
        icon={ImageIcon}
        onClick={() => openImageDialog(editor)}
        tooltip="Insert image"
      />
      <ToolbarButton
        icon={Code}
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        tooltip="Code block"
      />

      <ToolbarSeparator />

      {/* Alignment */}
      <ToolbarButton
        icon={AlignLeft}
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      />
      <ToolbarButton
        icon={AlignCenter}
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      />
      <ToolbarButton
        icon={AlignRight}
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      />
    </div>
  );
}
```

**Atalhos do editor:**
| Atalho       | Acao              |
|--------------|-------------------|
| Cmd+B        | Bold              |
| Cmd+I        | Italic            |
| Cmd+U        | Underline         |
| Cmd+Shift+S  | Strikethrough     |
| Cmd+K        | Insert link       |
| Cmd+Shift+7  | Numbered list     |
| Cmd+Shift+8  | Bullet list       |
| Cmd+Shift+E  | Code block        |
| Tab          | Indent list item  |
| Shift+Tab    | Outdent list item |

**Criterio de aceite:**
- [ ] Formatacao basica (bold, italic, underline, strike)
- [ ] Headings (H1, H2, H3)
- [ ] Listas (bullet, numbered, nested)
- [ ] Links (inserir, editar, remover)
- [ ] Imagens inline (paste, drag & drop, dialog)
- [ ] Code blocks
- [ ] Alinhamento de texto
- [ ] Toolbar reflete estado ativo
- [ ] Atalhos de teclado funcionam
- [ ] Paste de HTML preserva formatacao
- [ ] Paste de imagem do clipboard funciona

> Status: `ComposerEditor` agora usa TipTap com `StarterKit`, `Link` e `Placeholder`, mais toolbar basica para bold, italic, listas, quote e links. O body do composer ja sai como HTML para o outbox e o `plainBody` e derivado no app. Underline, headings extras, imagens inline, atalhos dedicados e refinamentos de paste ficam para os proximos cortes.

---

### 5.4 — Attachments no Composer

**O que implementar:**

```tsx
// src/components/composer/ComposerAttachments.tsx
export function ComposerAttachments({ attachments, onRemove, onAdd }: Props) {
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    files.forEach(file => onAdd(file));
  };

  return (
    <div
      className="px-4 py-2 border-t border-border-default"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {attachments.map(att => (
        <div key={att.id} className="flex items-center gap-2 py-1">
          <FileIcon contentType={att.contentType} />
          <span className="text-sm">{att.filename}</span>
          <span className="text-xs text-text-secondary">{formatSize(att.size)}</span>
          <IconButton icon={X} size="sm" onClick={() => onRemove(att.id)} />
        </div>
      ))}
      <button
        className="text-sm text-text-accent hover:underline mt-1"
        onClick={() => openFileDialog()}
      >
        Attach file...
      </button>
    </div>
  );
}
```

**Funcionalidades:**
- Adicionar via botao (Tauri file dialog)
- Adicionar via drag & drop
- Adicionar via paste (imagens do clipboard)
- Remover com click no X
- Exibir tamanho e icone por tipo
- Limite de tamanho total configuravel (padrao: 25MB)
- Warning visual se proximo do limite

**Tauri command:**

```rust
#[tauri::command]
pub async fn pick_files() -> Result<Vec<FilePath>, String> {
    // Usa tauri dialog para selecionar arquivos
}
```

**Criterio de aceite:**
- [ ] Adicionar arquivos via dialog
- [ ] Drag & drop funciona
- [ ] Paste de imagem funciona
- [ ] Remover attachment
- [ ] Limite de tamanho com warning
- [ ] Icones por tipo MIME

> Status: o composer agora aceita anexos locais com input de arquivos e drag and drop, exibe nome/tamanho na lista e permite remover antes do envio. O `App` ja converte `File` para `MimeAttachment` ao enfileirar a mensagem. Paste de imagem, limite total e icones por MIME ficam para os proximos cortes.

---

### 5.5 — Assinatura

**Referencia Mailspring:** `app/internal_packages/composer-signature/` (16 arquivos)

**O que implementar:**

```typescript
// src/stores/useSignatureStore.ts
interface Signature {
  id: string;
  title: string;
  body: string;  // HTML
  accountId: string | null;  // null = global
}

interface SignatureState {
  signatures: Signature[];
  defaultSignatureId: string | null;
  
  create: (sig: Omit<Signature, 'id'>) => void;
  update: (id: string, sig: Partial<Signature>) => void;
  delete: (id: string) => void;
  setDefault: (id: string | null) => void;
  getForAccount: (accountId: string) => Signature | null;
}
```

**Funcionalidades:**
- Editor de assinatura (TipTap reutilizado, simplificado)
- Multiplas assinaturas por conta
- Assinatura padrao por conta
- Assinatura inserida automaticamente em novos emails
- Assinatura nao inserida em replies (configuravel)

**Criterio de aceite:**
- [ ] Criar/editar/deletar assinaturas
- [ ] Assinatura padrao por conta
- [ ] Inserida automaticamente em novos emails
- [ ] Editavel dentro do composer
- [ ] Persistida no backend

---

### 5.6 — Draft Auto-Save

**Referencia Mailspring:** DraftStore no Mailspring salva drafts automaticamente

**O que implementar:**

```typescript
// src/hooks/useDraftAutoSave.ts
export function useDraftAutoSave(draftId: string, draftData: DraftData) {
  const saveRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    const serialized = JSON.stringify(draftData);
    if (serialized === lastSavedRef.current) return;

    // Debounce: salvar apos 2s de inatividade
    clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      await api.drafts.save(draftId, draftData);
      lastSavedRef.current = serialized;
    }, 2000);

    return () => clearTimeout(saveRef.current);
  }, [draftData]);
}
```

**Tauri commands:**

```rust
#[tauri::command]
pub async fn save_draft(state: State<'_, AppState>, draft: DraftData) -> Result<String, DomainError>;

#[tauri::command]
pub async fn delete_draft(state: State<'_, AppState>, draft_id: String) -> Result<(), DomainError>;

#[tauri::command]
pub async fn list_drafts(state: State<'_, AppState>, account_id: String) -> Result<Vec<Message>, DomainError>;
```

**Fluxo:**
1. Usuario compoe email
2. Apos 2s de inatividade, draft salvo no SQLite local
3. Draft sync para IMAP Drafts folder em background
4. Ao enviar, draft deletado (local + IMAP)
5. Ao descartar, draft deletado com confirmacao

**Criterio de aceite:**
- [ ] Auto-save apos 2s de inatividade
- [ ] Draft listado na sidebar (Drafts folder)
- [ ] Reabrir draft restaura todo o estado
- [ ] Draft deletado apos envio
- [ ] Draft sync para IMAP (background)

---

### 5.7 — Send Flow

**O que implementar:**

```typescript
// src/components/composer/ComposerFooter.tsx
export function ComposerFooter({ draftId, draftData, onSent, onDiscard }: Props) {
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    // Validacoes
    if (draftData.to.length === 0) {
      toast.error('Please add at least one recipient');
      return;
    }
    if (!draftData.subject) {
      const confirmed = await confirm('Send without subject?');
      if (!confirmed) return;
    }

    setIsSending(true);
    try {
      await api.drafts.send(draftId);
      onSent();
      toast.success('Email sent!');
    } catch (err) {
      toast.error(`Failed to send: ${err}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-border-default">
      <button onClick={onDiscard} className="text-sm text-text-secondary hover:text-text-danger">
        Discard
      </button>
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={handleSend} disabled={isSending}>
          {isSending ? <Spinner size="sm" /> : 'Send'}
        </Button>
      </div>
    </div>
  );
}
```

**Tauri command (backend):**

```rust
#[tauri::command]
pub async fn send_draft(
    state: State<'_, AppState>,
    draft_id: String,
) -> Result<(), DomainError> {
    // 1. Buscar draft do banco
    let draft = state.message_repo.find_by_id(&draft_id).await?
        .ok_or(DomainError::NotFound { entity_type: "Draft".into(), id: draft_id.clone() })?;

    // 2. Buscar credenciais
    let account = state.account_repo.find_by_id(&draft.account_id).await?
        .ok_or(DomainError::NotFound { entity_type: "Account".into(), id: draft.account_id.clone() })?;
    let creds = CredentialStore::get(&account.id)?
        .ok_or(DomainError::Auth("No credentials found".into()))?;

    // 3. Buscar attachments
    let attachments = state.attachment_repo.find_by_message(&draft_id).await?;

    // 4. Construir MIME message
    let mime = MimeBuilder::build(&draft, &attachments, &account)?;

    // 5. Enviar via SMTP
    SmtpClient::send(&account.connection_settings, &creds, &mime).await?;

    // 6. Salvar em Sent folder (local)
    let mut sent_message = draft.clone();
    sent_message.is_draft = false;
    sent_message.folder_id = state.folder_repo
        .find_by_role(&account.id, FolderRole::Sent).await?
        .map(|f| f.id)
        .unwrap_or_default();
    state.message_repo.save(&sent_message).await?;

    // 7. Deletar draft
    state.message_repo.delete(&draft_id).await?;

    // 8. Append em Sent folder IMAP (background)
    state.task_queue.enqueue(MailTask::AppendToSent {
        account_id: account.id,
        message_bytes: mime.as_bytes().to_vec(),
    }).await;

    // 9. Emitir eventos
    state.app.emit("draft:sent", &draft_id)?;
    state.app.emit("db:messages-changed", &[&sent_message.id])?;

    Ok(())
}
```

**Validacoes pre-envio:**
- Pelo menos 1 destinatario
- Subject presente (warning se vazio)
- Attachments mencionados no body mas nao anexados (warning)
- Tamanho total < limite do servidor
- Conta com credenciais validas

**Criterio de aceite:**
- [ ] Envio funciona (SMTP)
- [ ] Validacoes pre-envio
- [ ] Loading state durante envio
- [ ] Mensagem movida para Sent apos envio
- [ ] Draft deletado apos envio
- [ ] Toast de sucesso/erro
- [ ] Cmd+Enter envia

> Status: o fluxo atual do composer agora bloqueia envio sem destinatarios, pede confirmacao para assunto vazio e expõe botao de discard no footer. O envio ainda segue via fila local existente; SMTP direto, toast dedicado, `Cmd+Enter` e transicoes completas de draft/sent entram nos proximos cortes.

---

### 5.8 — Reply / Reply All / Forward

**O que implementar:**

```typescript
// src/lib/compose-utils.ts
export function prepareReply(message: Message, replyAll: boolean): DraftData {
  return {
    accountId: message.accountId,
    to: replyAll
      ? [...message.from, ...message.to.filter(c => !c.isMe)]
      : message.from,
    cc: replyAll ? message.cc.filter(c => !c.isMe) : [],
    bcc: [],
    subject: message.subject.startsWith('Re:')
      ? message.subject
      : `Re: ${message.subject}`,
    body: '',
    quotedText: buildQuotedText(message),
    inReplyTo: message.messageIdHeader,
    references: [...message.references, message.messageIdHeader],
    threadId: message.threadId,
    attachments: [],
  };
}

export function prepareForward(message: Message): DraftData {
  return {
    accountId: message.accountId,
    to: [],
    cc: [],
    bcc: [],
    subject: message.subject.startsWith('Fwd:')
      ? message.subject
      : `Fwd: ${message.subject}`,
    body: buildForwardedBody(message),
    quotedText: '',
    inReplyTo: null,
    references: [],
    threadId: null, // forward cria novo thread
    attachments: message.attachments, // incluir attachments originais
  };
}

function buildQuotedText(message: Message): string {
  const date = formatDate(message.date);
  const from = formatContact(message.from[0]);
  return `
    <div class="gmail_quote">
      <div>On ${date}, ${from} wrote:</div>
      <blockquote style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex;">
        ${message.body}
      </blockquote>
    </div>
  `;
}
```

**Criterio de aceite:**
- [ ] Reply pre-preenche corretamente (To, Subject, quoted text)
- [ ] Reply All inclui todos os participantes (exceto "me")
- [ ] Forward inclui body original e attachments
- [ ] Headers corretos (In-Reply-To, References)
- [ ] Thread continuity (reply fica no mesmo thread)

---

## Dependencias Frontend Adicionais

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm
npm install @tiptap/extension-link @tiptap/extension-image
npm install @tiptap/extension-placeholder @tiptap/extension-underline
npm install @tiptap/extension-text-align @tiptap/extension-color
npm install @tiptap/extension-text-style
```

---

## Testes desta Fase

| Tipo        | Escopo                                          | Ferramenta      |
|-------------|------------------------------------------------|-----------------|
| Unit        | prepareReply, prepareForward (headers, body)    | Vitest          |
| Unit        | ParticipantField (autocomplete, chips, paste)   | Vitest + RTL    |
| Unit        | Draft auto-save (debounce, serialization)       | Vitest          |
| Unit        | Pre-send validation                             | Vitest          |
| Integracao  | TipTap editor (formatting, paste, shortcuts)    | Vitest + RTL    |
| Integracao  | Send flow (mock SMTP)                           | Vitest          |
| E2E         | Compose new email → send                        | Playwright      |
| E2E         | Reply to email → send                           | Playwright      |

---

## Checklist Final da Fase 5

- [ ] Composer layout completo (header, editor, footer)
- [ ] ParticipantField com autocomplete e chips
- [ ] TipTap editor com formatting completo
- [ ] Toolbar de formatacao funcional
- [ ] Attachments (dialog, drag & drop, paste)
- [ ] Assinaturas (criar, editar, auto-insert)
- [ ] Draft auto-save (debounce 2s)
- [ ] Send flow (validacao, SMTP, Sent folder)
- [ ] Reply / Reply All / Forward
- [ ] Quoted text colapsavel
- [ ] Keyboard shortcuts (Cmd+Enter, Cmd+B/I/U)
- [ ] Testes passando
- [ ] CI green

---

**Fase anterior:** [Fase 4 — Thread List & Message View](./fase_4.md)
**Proxima fase:** [Fase 6 — Account Management & Onboarding](./fase_6.md)
