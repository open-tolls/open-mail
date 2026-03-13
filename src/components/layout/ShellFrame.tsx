import {
  BellDot,
  Command,
  PencilLine,
  Search,
  Sparkles,
  Archive,
  Inbox,
  Send,
  Star,
  Trash2
} from 'lucide-react';
import { StatusBadge } from '@components/ui/StatusBadge';
import type { FolderRecord, ThreadSummary } from '@lib/contracts';

type ShellFrameProps = {
  backendStatus: string;
  folders: FolderRecord[];
  threads: ThreadSummary[];
};

const folderIconMap = {
  inbox: Inbox,
  starred: Star,
  sent: Send,
  archive: Archive,
  trash: Trash2
} as const;

const formatThreadTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Agora';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

export const ShellFrame = ({ backendStatus, folders, threads }: ShellFrameProps) => {
  return (
    <div className="shell-root">
      <div className="shell-backdrop" aria-hidden="true" />
      <aside className="sidebar-panel">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="eyebrow">Tauri v2 + React</p>
            <h1>Open Mail</h1>
          </div>
        </div>

        <button className="compose-button" type="button">
          <PencilLine size={16} />
          New message
        </button>

        <nav className="folder-nav" aria-label="Mailbox folders">
          {folders.map((folder) => {
            const Icon = folder.role ? folderIconMap[folder.role as keyof typeof folderIconMap] ?? BellDot : BellDot;
            return (
              <button
                className={folder.role === 'inbox' ? 'folder-link folder-link-active' : 'folder-link'}
                key={folder.id}
                type="button"
              >
                <span className="folder-link-main">
                  <Icon size={16} />
                  {folder.name}
                </span>
                <span className="folder-count">{folder.unread_count}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <StatusBadge label="Foundation" tone="accent" />
          <p>Arquitetura inicial pronta para evoluir as próximas fases do roadmap.</p>
        </div>
      </aside>

      <main className="content-panel">
        <header className="topbar">
          <label className="search-shell" aria-label="Search">
            <Search size={16} />
            <input placeholder="Search threads, people, commands" />
            <span className="shortcut-pill">
              <Command size={12} />
              K
            </span>
          </label>

          <div className="status-row">
            <StatusBadge label={backendStatus} tone="success" />
          </div>
        </header>

        <section className="hero-card">
          <div>
            <p className="eyebrow">Luxury minimal shell</p>
            <h2>Hello Open Mail</h2>
            <p className="hero-copy">
              O projeto já nasce com Tauri v2, React 19, TypeScript estrito, IPC funcional e um shell
              visual pronto para receber sync engine, banco e composer.
            </p>
          </div>

          <div className="hero-metrics" aria-label="Project health">
            <article>
              <span>IPC</span>
              <strong>health_check</strong>
            </article>
            <article>
              <span>State</span>
              <strong>Zustand-ready</strong>
            </article>
            <article>
              <span>UI</span>
              <strong>Tailwind v4 tokens</strong>
            </article>
          </div>
        </section>

        <section className="workspace-grid">
          <div className="thread-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Prototype inbox</p>
                <h3>Message stream</h3>
              </div>
              <StatusBadge label="24 unread" tone="neutral" />
            </div>

            <div className="thread-list">
              {threads.map((thread) => (
                <article className="thread-card" key={thread.id}>
                  <div className="thread-card-row">
                    <h4>{thread.participants[0] ?? 'Open Mail'}</h4>
                    <span>{formatThreadTime(thread.lastMessageAt)}</span>
                  </div>
                  <p className="thread-subject">{thread.subject}</p>
                  <p className="thread-preview">{thread.snippet}</p>
                  {thread.isUnread ? <span className="thread-dot" aria-label="Unread thread" /> : null}
                </article>
              ))}
            </div>
          </div>

          <aside className="insight-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Roadmap focus</p>
                <h3>Next implementation tracks</h3>
              </div>
            </div>

            <ul className="insight-list">
              <li>Persistir domain models em Rust com erros tipados e testes.</li>
              <li>Adicionar SQLite e migrations para account, thread e message.</li>
              <li>Conectar shell com commands reais e eventos reativos do backend.</li>
            </ul>
          </aside>
        </section>
      </main>
    </div>
  );
};
