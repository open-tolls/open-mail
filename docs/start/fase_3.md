# Fase 3 — UI Shell & Layout System

**Duracao estimada:** 3 semanas
**Dependencia:** Fase 0 concluida (Fase 1-2 podem rodar em paralelo)
**Objetivo:** Construir o shell da aplicacao — layout principal, navegacao, sidebar, toolbar e sistema de temas. Ao final, a app abre com uma estrutura visual completa (sem dados reais ainda).

---

## Contexto

No Mailspring, o layout e gerenciado por um sistema custom de "Sheets" (`app/src/sheet.tsx`, `sheet-container.tsx`, `sheet-toolbar.tsx`) com um `WorkspaceStore` que controla modos (list/split). A sidebar e um plugin (`account-sidebar/`), e a toolbar e montada dinamicamente via `ComponentRegistry`.

No Open Mail, simplificamos para **React Router v7** para navegacao e **componentes compostos** para layout, eliminando a complexidade do sistema de sheets/workspace do Mailspring.

---

## Referencia Visual

O layout segue o padrao classico de cliente de email (3 paineis):

```
┌──────────────────────────────────────────────────────────┐
│  Toolbar (search, actions, sync status)                   │
├────────────┬────────────────────┬────────────────────────┤
│            │                    │                         │
│  Sidebar   │  Thread List       │  Message View           │
│            │  (lista de emails) │  (leitura do email)     │
│  - Inbox   │                    │                         │
│  - Sent    │  ┌──────────────┐  │  From: alice@...        │
│  - Drafts  │  │ Thread item  │  │  Subject: Hello         │
│  - Trash   │  │ Thread item  │  │                         │
│  - Folders │  │ Thread item  │  │  Body content...        │
│  - Labels  │  │ Thread item  │  │                         │
│            │  └──────────────┘  │                         │
│  Accounts  │                    │  [Reply] [Forward]      │
│            │                    │                         │
├────────────┴────────────────────┴────────────────────────┤
│  Status Bar (connection status, unread count)             │
└──────────────────────────────────────────────────────────┘
```

---

## Entregaveis

### 3.1 — Design System & Tokens

**O que implementar:**

Criar a base do design system com CSS variables (TailwindCSS v4):

```css
/* src/styles/globals.css */
@import "tailwindcss";

@theme {
  /* Cores semanticas */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f8f9fa;
  --color-bg-tertiary: #f0f1f3;
  --color-bg-sidebar: #f5f5f5;
  --color-bg-hover: #e8eaed;
  --color-bg-selected: #d3e3fd;
  --color-bg-accent: #1a73e8;

  --color-text-primary: #1f2937;
  --color-text-secondary: #6b7280;
  --color-text-tertiary: #9ca3af;
  --color-text-inverse: #ffffff;
  --color-text-accent: #1a73e8;
  --color-text-danger: #dc2626;
  --color-text-success: #16a34a;

  --color-border-default: #e5e7eb;
  --color-border-strong: #d1d5db;

  /* Espacamentos */
  --spacing-sidebar-width: 220px;
  --spacing-thread-list-width: 380px;
  --spacing-toolbar-height: 48px;
  --spacing-status-bar-height: 24px;

  /* Tipografia */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Sombras */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);

  /* Transicoes */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;

  /* Bordas */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  @theme {
    --color-bg-primary: #1a1a1a;
    --color-bg-secondary: #242424;
    --color-bg-tertiary: #2d2d2d;
    --color-bg-sidebar: #1e1e1e;
    --color-bg-hover: #333333;
    --color-bg-selected: #1a3a5c;
    --color-bg-accent: #4da6ff;

    --color-text-primary: #e5e7eb;
    --color-text-secondary: #9ca3af;
    --color-text-tertiary: #6b7280;
    --color-text-inverse: #1a1a1a;
    --color-text-accent: #4da6ff;

    --color-border-default: #333333;
    --color-border-strong: #444444;
  }
}
```

**Componentes UI base (shadcn-inspired):**

```
src/components/ui/
├── Button.tsx
├── IconButton.tsx
├── Input.tsx
├── Badge.tsx
├── Avatar.tsx
├── Tooltip.tsx
├── Dropdown.tsx
├── ContextMenu.tsx
├── ScrollArea.tsx
├── Separator.tsx
├── Skeleton.tsx
├── Switch.tsx
├── Kbd.tsx
└── Spinner.tsx
```

Cada componente:
- Tipado com TypeScript (props interface)
- Estilizado com TailwindCSS
- Suporta `className` prop para customizacao
- Acessivel (ARIA attributes, keyboard navigation)
- Compacto (sem over-engineering)

**Criterio de aceite:**
- [x] Tokens de cor, tipografia, espacamento definidos
- [x] Dark mode funciona via tema `system`/preferencia do SO
- [x] 14 componentes UI base implementados
- [x] Componentes sao acessiveis (ARIA)
- [x] Storybook-like: componentes renderizam isolados em rota `/dev`

---

### 3.2 — Layout Principal (Shell)

**Referencia Mailspring:** `app/src/sheet-container.tsx`, `app/src/sheet.tsx`

**O que implementar:**

```tsx
// src/components/layout/AppShell.tsx
export function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-bg-primary text-text-primary">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ResizablePanel>
          <ThreadListPanel />
          <MessageViewPanel />
        </ResizablePanel>
      </div>
      <StatusBar />
    </div>
  );
}
```

**Componentes de layout:**

```
src/components/layout/
├── AppShell.tsx           # Layout raiz
├── Sidebar.tsx            # Painel lateral esquerdo
├── Toolbar.tsx            # Barra superior
├── StatusBar.tsx          # Barra inferior
├── ResizablePanel.tsx     # Paineis redimensionaveis
├── ThreadListPanel.tsx    # Container do thread list (placeholder)
└── MessageViewPanel.tsx   # Container do message view (placeholder)
```

**ResizablePanel:**
- Arrastar divisor entre paineis
- Persistir tamanhos no localStorage
- Min/max width constraints
- Colapsar sidebar com toggle button

**Comportamento responsivo:**
- **Wide (>1200px):** 3 paineis lado a lado
- **Medium (800-1200px):** Sidebar colapsada, 2 paineis
- **Narrow (<800px):** Navegacao stacked (mobile-like)

**Criterio de aceite:**
- [x] Layout 3 paineis renderiza corretamente
- [x] Paineis redimensionaveis com drag
- [x] Sidebar colapsavel
- [x] Responsivo em 3 breakpoints
- [x] Tamanhos persistidos entre sessoes

---

### 3.3 — Sidebar

**Referencia Mailspring:** `app/internal_packages/account-sidebar/` (13 arquivos)

**O que implementar:**

```tsx
// src/components/layout/Sidebar.tsx
export function Sidebar() {
  const accounts = useAccountStore((s) => s.accounts);
  const folders = useFolderStore((s) => s.folders);
  const selectedFolder = useFolderStore((s) => s.selectedFolderId);

  return (
    <aside className="w-[var(--spacing-sidebar-width)] border-r border-border-default bg-bg-sidebar flex flex-col">
      {/* Compose button */}
      <div className="p-3">
        <ComposeButton />
      </div>

      {/* Account sections */}
      {accounts.map(account => (
        <AccountSection key={account.id} account={account}>
          {/* System folders */}
          <FolderList
            folders={folders.filter(f => f.accountId === account.id && f.role)}
            selectedId={selectedFolder}
          />

          {/* Custom folders */}
          <FolderGroup title="Folders">
            <FolderList
              folders={folders.filter(f => f.accountId === account.id && !f.role)}
              selectedId={selectedFolder}
            />
          </FolderGroup>

          {/* Labels (Gmail) */}
          <LabelGroup accountId={account.id} />
        </AccountSection>
      ))}

      {/* Bottom: account switcher / settings */}
      <div className="mt-auto border-t border-border-default p-2">
        <AccountSwitcher />
      </div>
    </aside>
  );
}
```

**Sub-componentes:**

| Componente         | Funcao                                      |
|--------------------|---------------------------------------------|
| `ComposeButton`    | Botao "New Email" prominente                |
| `AccountSection`   | Grupo colapsavel por conta                  |
| `FolderItem`       | Item de folder com icone, nome, badge count |
| `FolderList`       | Lista de folders                            |
| `FolderGroup`      | Grupo colapsavel (Folders, Labels)          |
| `LabelGroup`       | Labels com cor (Gmail-specific)             |
| `AccountSwitcher`  | Seletor de conta + link para settings       |

**Icones por role de folder (Lucide):**

| Role      | Icone Lucide      |
|-----------|-------------------|
| Inbox     | `Inbox`           |
| Sent      | `Send`            |
| Drafts    | `FileEdit`        |
| Trash     | `Trash2`          |
| Spam      | `ShieldAlert`     |
| Archive   | `Archive`         |
| Starred   | `Star`            |
| Important | `AlertCircle`     |
| Custom    | `Folder`          |

**Interacoes:**
- Click em folder → seleciona e carrega threads
- Right-click → context menu (rename, delete folder)
- Drag & drop de threads para folders (futuro, Fase 4)
- Badge com contagem de unread
- Folder em negrito se tem unread

**Criterio de aceite:**
- [x] Folders do sistema com icones corretos
- [x] Badge de unread count
- [x] Folders custom listados
- [x] Labels com cor (Gmail)
- [x] Selecao visual do folder ativo
- [x] Colapso/expansao de grupos
- [x] Botao de compose prominente

---

### 3.4 — Toolbar

**Referencia Mailspring:** `app/src/sheet-toolbar.tsx` (12KB)

**O que implementar:**

```tsx
// src/components/layout/Toolbar.tsx
export function Toolbar() {
  return (
    <header className="h-[var(--spacing-toolbar-height)] flex items-center border-b border-border-default px-4 gap-2 bg-bg-primary">
      {/* Left: navigation / breadcrumb */}
      <div className="flex items-center gap-2">
        <SidebarToggle />
        <Breadcrumb />
      </div>

      {/* Center: search */}
      <div className="flex-1 max-w-xl mx-auto">
        <SearchBar />
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        <SyncStatusIndicator />
        <LayoutToggle />
        <SettingsButton />
      </div>
    </header>
  );
}
```

**Sub-componentes:**

| Componente             | Funcao                                           |
|------------------------|--------------------------------------------------|
| `SidebarToggle`        | Colapsar/expandir sidebar                        |
| `Breadcrumb`           | Account > Folder (navegacao)                     |
| `SearchBar`            | Campo de busca com autocomplete                  |
| `SyncStatusIndicator`  | Icone de status de sync (spinning, check, error) |
| `LayoutToggle`         | Alternar entre modos list/split                  |
| `SettingsButton`       | Abrir preferences                                |

**SearchBar (placeholder nesta fase):**
- Input com icone de busca
- Placeholder: "Search emails..."
- Atalho: `Cmd+K` / `Ctrl+K` abre foco
- Funcionalidade real de busca implementada na Fase 4

**Criterio de aceite:**
- [x] Toolbar renderiza com todos os elementos
- [x] Sidebar toggle funciona
- [x] Search bar recebe foco com atalho
- [x] Sync status mostra estado visual
- [x] Layout toggle alterna modos

---

### 3.5 — Status Bar

**O que implementar:**

```tsx
// src/components/layout/StatusBar.tsx
export function StatusBar() {
  const syncStatus = useSyncStore((s) => s.status);
  const unreadCount = useFolderStore((s) => s.totalUnreadCount);

  return (
    <footer className="h-[var(--spacing-status-bar-height)] flex items-center justify-between border-t border-border-default px-4 text-xs text-text-secondary bg-bg-secondary">
      <span>{unreadCount} unread</span>
      <SyncStatusText status={syncStatus} />
    </footer>
  );
}
```

**Criterio de aceite:**
- [x] Exibe contagem total de unread
- [x] Exibe status de sync por conta
- [x] Atualiza em tempo real via Tauri events

---

### 3.6 — Zustand Stores (State Management)

**Referencia Mailspring:** `app/src/flux/stores/` (36 arquivos, Reflux + RxJS)

**O que implementar:**

```
src/stores/
├── useAccountStore.ts     # Contas configuradas
├── useFolderStore.ts      # Folders e labels
├── useThreadStore.ts      # Threads da view atual
├── useMessageStore.ts     # Messages do thread selecionado
├── useDraftStore.ts       # Drafts em edicao
├── useUIStore.ts          # Estado de UI (sidebar, layout mode, selections)
├── useSyncStore.ts        # Status de sync por conta
└── useSearchStore.ts      # Estado de busca
```

**Exemplo de store:**

```typescript
// src/stores/useAccountStore.ts
import { create } from 'zustand';
import { api } from '@lib/tauri-bridge';
import { listen } from '@tauri-apps/api/event';
import type { Account } from '@lib/types';

interface AccountState {
  accounts: Account[];
  selectedAccountId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchAccounts: () => Promise<void>;
  selectAccount: (id: string) => void;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  selectedAccountId: null,
  isLoading: false,
  error: null,

  fetchAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const accounts = await api.accounts.list();
      set({ accounts, isLoading: false });
      if (!get().selectedAccountId && accounts.length > 0) {
        set({ selectedAccountId: accounts[0].id });
      }
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  selectAccount: (id) => set({ selectedAccountId: id }),
}));

// Listener para eventos do backend
listen('account:changed', () => {
  useAccountStore.getState().fetchAccounts();
});
```

```typescript
// src/stores/useUIStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type LayoutMode = 'split' | 'list';

interface UIState {
  sidebarCollapsed: boolean;
  layoutMode: LayoutMode;
  sidebarWidth: number;
  threadListWidth: number;

  toggleSidebar: () => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setSidebarWidth: (width: number) => void;
  setThreadListWidth: (width: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      layoutMode: 'split',
      sidebarWidth: 220,
      threadListWidth: 380,

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setLayoutMode: (mode) => set({ layoutMode: mode }),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setThreadListWidth: (width) => set({ threadListWidth: width }),
    }),
    { name: 'open-mail-ui' }
  )
);
```

**Padrao para Tauri events:**

```typescript
// src/hooks/useTauriEvent.ts
import { useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    let unlisten: UnlistenFn;
    listen<T>(event, (e) => handler(e.payload)).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [event, handler]);
}
```

**Criterio de aceite:**
- [x] 8 stores Zustand implementados
- [x] Stores persistidos onde necessario (UI state)
- [x] Tauri events integrados (reatividade do backend)
- [x] Hook `useTauriEvent` reutilizavel
- [x] Sem re-renders desnecessarios (selectors)

> Status: a Fase 3 agora possui stores por dominio (`account`, `folder`, `thread`, `message`, `draft`, `sync`, `search`) mais `useUIStore`. A ligacao completa com dados reais deve acompanhar as fases seguintes.

---

### 3.7 — Keyboard Shortcuts

**Referencia Mailspring:** `app/src/key-commands-region.tsx`, `app/keymaps/`

**O que implementar:**

```typescript
// src/hooks/useKeyboardShortcuts.ts
const SHORTCUTS = {
  'mod+n': 'compose:new',
  'mod+shift+n': 'compose:new-window',
  'mod+k': 'search:focus',
  'mod+1': 'nav:inbox',
  'mod+2': 'nav:sent',
  'mod+3': 'nav:drafts',
  'mod+,': 'preferences:open',
  'j': 'thread:next',
  'k': 'thread:prev',
  'e': 'thread:archive',
  '#': 'thread:trash',
  's': 'thread:star',
  'r': 'thread:reply',
  'a': 'thread:reply-all',
  'f': 'thread:forward',
  'mod+enter': 'compose:send',
  'escape': 'ui:back',
  'mod+z': 'action:undo',
  'mod+shift+z': 'action:redo',
} as const;
```

**Criterio de aceite:**
- [x] Atalhos navegacionais funcionam (j/k, Cmd+1/2/3)
- [x] Atalhos de acao funcionam (e, #, s, r, f)
- [x] Cmd+K foca searchbar
- [x] Cmd+N abre composer
- [x] Atalhos sao customizaveis (config persistida)

---

### 3.8 — Theme System

**Referencia Mailspring:** `app/src/theme-manager.ts`, `app/internal_packages/theme-picker/`, 6 temas built-in

**O que implementar:**

Temas via CSS custom properties (nao LESS como Mailspring):

```typescript
// src/lib/themes.ts
export interface Theme {
  id: string;
  name: string;
  description: string;
  variables: Record<string, string>;
}

export const builtInThemes: Theme[] = [
  {
    id: 'light',
    name: 'Light',
    description: 'Clean light theme',
    variables: {
      '--color-bg-primary': '#ffffff',
      '--color-bg-sidebar': '#f5f5f5',
      // ... todos os tokens
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Easy on the eyes',
    variables: {
      '--color-bg-primary': '#1a1a1a',
      '--color-bg-sidebar': '#1e1e1e',
      // ...
    },
  },
  {
    id: 'auto',
    name: 'System',
    description: 'Follow system preference',
    variables: {}, // usa prefers-color-scheme
  },
];
```

**Aplicacao de tema:**

```typescript
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme.id === 'auto') {
    // Remove overrides, deixa CSS media query agir
    Object.keys(builtInThemes[0].variables).forEach(key => {
      root.style.removeProperty(key);
    });
  } else {
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }
}
```

**Temas iniciais:**
1. **Light** — tema claro padrao
2. **Dark** — tema escuro
3. **System** — segue preferencia do OS

Mais temas podem ser adicionados como arquivos JSON no futuro (plugin system).

**Criterio de aceite:**
- [x] 3 temas built-in funcionam
- [x] Troca de tema sem reload
- [x] Tema persistido entre sessoes
- [x] Tema "System" segue OS automaticamente

---

### 3.9 — Navegacao (React Router)

**O que implementar:**

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router';
import { AppShell } from '@components/layout/AppShell';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/inbox" />} />
          <Route path="/:folderId" element={<MailView />} />
          <Route path="/:folderId/:threadId" element={<MailView />} />
          <Route path="/search" element={<SearchView />} />
          <Route path="/compose" element={<ComposeView />} />
          <Route path="/preferences/*" element={<PreferencesView />} />
        </Route>
        <Route path="/onboarding/*" element={<OnboardingView />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**Criterio de aceite:**
- [x] Navegacao por URL funciona (folder, thread, search)
- [x] Back/forward do Tauri funcionam
- [x] Deep links funcionam (abrir email especifico)
- [x] Onboarding em rota separada (sem shell)

---

## Testes desta Fase

| Tipo        | Escopo                                    | Ferramenta      |
|-------------|-------------------------------------------|-----------------|
| Unit        | Componentes UI base (render, props)        | Vitest + RTL    |
| Unit        | Zustand stores (actions, state)            | Vitest          |
| Unit        | Theme application                          | Vitest          |
| Visual      | Layout responsivo (3 breakpoints)          | Manual/Playwright|
| Acessibilidade | ARIA attributes, keyboard nav           | axe-core        |

---

## Checklist Final da Fase 3

- [x] Design tokens definidos (cores, tipografia, espacamento)
- [x] 14 componentes UI base implementados
- [x] Dark mode funcional
- [x] Layout 3 paineis com resize
- [x] Sidebar com folders, labels, accounts
- [x] Toolbar com search, sync status, toggles
- [x] Status bar com unread count
- [x] 8 Zustand stores configurados
- [x] Tauri event integration funcional
- [x] Keyboard shortcuts mapeados
- [x] 3 temas built-in
- [x] React Router navegacao configurada
- [x] Testes passando
- [ ] CI green

---

**Fase anterior:** [Fase 2 — Sync Engine](./fase_2.md)
**Proxima fase:** [Fase 4 — Thread List & Message View](./fase_4.md)
