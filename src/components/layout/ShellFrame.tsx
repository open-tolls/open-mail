import {
  BellDot,
  Command,
  Inbox,
  PencilLine,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react';
import { StatusBadge } from '@components/ui/StatusBadge';

const folders = [
  { label: 'Inbox', count: 24, icon: Inbox, active: true },
  { label: 'Starred', count: 8, icon: Star },
  { label: 'Sent', count: 412, icon: Send },
  { label: 'Archive', count: 1280, icon: BellDot },
  { label: 'Trash', count: 3, icon: Trash2 }
];

const threads = [
  {
    sender: 'Atlas Design',
    subject: 'Premium motion system approved',
    preview: 'Vamos fechar a base visual do composer e da thread list hoje.',
    time: '09:24',
    unread: true
  },
  {
    sender: 'Infra Sync',
    subject: 'Rust health-check online',
    preview: 'IPC inicial respondeu sem erro e o shell já consegue refletir o estado.',
    time: '08:52',
    unread: false
  },
  {
    sender: 'Product',
    subject: 'Roadmap fase 0 consolidado',
    preview: 'CI, lint, testes canário e estrutura Tauri alinhados com o plano.',
    time: 'Ontem',
    unread: false
  }
];

type ShellFrameProps = {
  backendStatus: string;
};

export const ShellFrame = ({ backendStatus }: ShellFrameProps) => {
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
            const Icon = folder.icon;
            return (
              <button
                className={folder.active ? 'folder-link folder-link-active' : 'folder-link'}
                key={folder.label}
                type="button"
              >
                <span className="folder-link-main">
                  <Icon size={16} />
                  {folder.label}
                </span>
                <span className="folder-count">{folder.count}</span>
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
                <article className="thread-card" key={`${thread.sender}-${thread.subject}`}>
                  <div className="thread-card-row">
                    <h4>{thread.sender}</h4>
                    <span>{thread.time}</span>
                  </div>
                  <p className="thread-subject">{thread.subject}</p>
                  <p className="thread-preview">{thread.preview}</p>
                  {thread.unread ? <span className="thread-dot" aria-label="Unread thread" /> : null}
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

