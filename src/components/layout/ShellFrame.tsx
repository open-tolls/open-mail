import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from 'react';
import {
  BellDot,
  Command,
  GripVertical,
  PencilLine,
  Search,
  Sparkles,
  AlertCircle,
  Archive,
  FileEdit,
  Folder,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Settings,
  ShieldAlert,
  Star,
  Trash2,
  Paperclip,
  Reply
} from 'lucide-react';
import { StatusBadge } from '@components/ui/StatusBadge';
import { useKeyboardShortcuts } from '@hooks/useKeyboardShortcuts';
import type { FolderRecord, MessageRecord, SyncStatusDetail, ThreadSummary } from '@lib/contracts';
import { useUIStore } from '@stores/useUIStore';

type ShellFrameProps = {
  backendStatus: string;
  folders: FolderRecord[];
  threads: ThreadSummary[];
  activeFolderId: string | null;
  searchQuery: string;
  isSearchActive: boolean;
  selectedThreadId: string | null;
  selectedThread: ThreadSummary | null;
  messages: MessageRecord[];
  selectedMessageId: string | null;
  selectedMessage: MessageRecord | null;
  syncStatusDetail: SyncStatusDetail | null;
  outboxStatus: string;
  isOutboxBusy: boolean;
  isMessagesLoading: boolean;
  onSelectFolder: (folderId: string) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectThread: (threadId: string) => void;
  onSelectMessage: (messageId: string) => void;
  onSendDraft: (draft: { to: string; subject: string; body: string }) => Promise<void>;
  onFlushOutbox: () => Promise<void>;
};

const folderIconMap = {
  important: AlertCircle,
  inbox: Inbox,
  starred: Star,
  drafts: FileEdit,
  sent: Send,
  spam: ShieldAlert,
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

const formatMessageDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Agora';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const getPrimaryAuthor = (message: MessageRecord) =>
  message.from[0]?.name ?? message.from[0]?.email ?? 'Open Mail';

export const ShellFrame = ({
  backendStatus,
  folders,
  threads,
  activeFolderId,
  searchQuery,
  isSearchActive,
  selectedThreadId,
  selectedThread,
  messages,
  selectedMessageId,
  selectedMessage,
  syncStatusDetail,
  outboxStatus,
  isOutboxBusy,
  isMessagesLoading,
  onSelectFolder,
  onSearchQueryChange,
  onSelectThread,
  onSelectMessage,
  onSendDraft,
  onFlushOutbox
}: ShellFrameProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isResizingThreadPanel, setIsResizingThreadPanel] = useState(false);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const layoutMode = useUIStore((state) => state.layoutMode);
  const themeId = useUIStore((state) => state.themeId);
  const threadPanelWidth = useUIStore((state) => state.threadPanelWidth);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const toggleLayoutMode = useUIStore((state) => state.toggleLayoutMode);
  const cycleTheme = useUIStore((state) => state.cycleTheme);
  const setThreadPanelWidth = useUIStore((state) => state.setThreadPanelWidth);
  const [draftTo, setDraftTo] = useState('team@example.com');
  const [draftSubject, setDraftSubject] = useState('Desktop alpha update');
  const [draftBody, setDraftBody] = useState('Open Mail phase 2 is ready for the next review.');
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;
  const selectedMessageParticipants = selectedMessage?.to.map((contact) => contact.email).join(', ') ?? '';
  const threadPanelTitle = isSearchActive ? `Search results for "${searchQuery.trim()}"` : activeFolder?.name ?? 'Message stream';
  const threadPanelCountLabel = isSearchActive ? `${threads.length} matches` : `${threads.length} threads`;
  const syncPhaseLabel = syncStatusDetail?.phase ? syncStatusDetail.phase.replaceAll('-', ' ') : 'sync idle';
  const syncFoldersLabel = syncStatusDetail ? `${syncStatusDetail.foldersSynced} folders` : '0 folders';
  const syncMessagesLabel = syncStatusDetail
    ? `${syncStatusDetail.messagesObserved} observed, ${syncStatusDetail.messagesDeleted} removed`
    : '0 observed';
  const totalUnreadCount = folders.reduce((total, folder) => total + folder.unread_count, 0);
  const syncStatusLabel = syncStatusDetail?.phase
    ? `Sync ${syncStatusDetail.phase.replaceAll('-', ' ')}`
    : backendStatus;
  const accountId = folders[0]?.account_id ?? 'acc_demo';
  const systemFolders = folders.filter((folder) => folder.role);
  const customFolders = folders.filter((folder) => !folder.role);
  const selectedThreadIndex = threads.findIndex((thread) => thread.id === selectedThreadId);
  const submitDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSendDraft({
      to: draftTo,
      subject: draftSubject,
      body: draftBody
    });
    setIsComposerOpen(false);
  };
  const selectThreadByOffset = (offset: number) => {
    if (!threads.length) {
      return;
    }

    const currentIndex = selectedThreadIndex >= 0 ? selectedThreadIndex : 0;
    const nextIndex = Math.min(threads.length - 1, Math.max(0, currentIndex + offset));
    onSelectThread(threads[nextIndex].id);
  };
  const selectSystemFolder = (role: string) => {
    const folder = folders.find((candidate) => candidate.role === role);
    if (folder) {
      onSelectFolder(folder.id);
    }
  };
  const workspaceStyle = {
    '--thread-panel-width': `${threadPanelWidth}%`
  } as CSSProperties;

  useKeyboardShortcuts({
    'mod+k': () => searchInputRef.current?.focus(),
    'mod+n': () => {
      setSidebarCollapsed(false);
      setIsComposerOpen(true);
    },
    'mod+shift+n': () => {
      setSidebarCollapsed(false);
      setIsComposerOpen(true);
    },
    'mod+1': () => selectSystemFolder('inbox'),
    'mod+2': () => selectSystemFolder('sent'),
    'mod+3': () => selectSystemFolder('drafts'),
    j: () => selectThreadByOffset(1),
    k: () => selectThreadByOffset(-1),
    escape: () => {
      setIsComposerOpen(false);
      searchInputRef.current?.blur();
    }
  });

  useEffect(() => {
    if (!isResizingThreadPanel) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
      setThreadPanelWidth(nextWidth);
    };
    const stopResize = () => setIsResizingThreadPanel(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
    };
  }, [isResizingThreadPanel, setThreadPanelWidth]);

  return (
    <div className={isSidebarCollapsed ? 'shell-root shell-root-sidebar-collapsed' : 'shell-root'}>
      <div className="shell-backdrop" aria-hidden="true" />
      <aside className="sidebar-panel">
        <div className="sidebar-header">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Sparkles size={18} />
            </div>
            {!isSidebarCollapsed ? (
              <div>
                <p className="eyebrow">Tauri v2 + React</p>
                <h1>Open Mail</h1>
              </div>
            ) : null}
          </div>

          <button
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={isSidebarCollapsed}
            className="sidebar-toggle"
            onClick={() => {
              toggleSidebar();
              setIsComposerOpen(false);
            }}
            type="button"
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <button
          aria-label={isComposerOpen ? 'Close composer' : 'New message'}
          className="compose-button"
          onClick={() => setIsComposerOpen((current) => !current)}
          type="button"
        >
          <PencilLine size={16} />
          {!isSidebarCollapsed ? <span>{isComposerOpen ? 'Close composer' : 'New message'}</span> : null}
        </button>

        {isComposerOpen && !isSidebarCollapsed ? (
          <form className="composer-card" onSubmit={submitDraft}>
            <label>
              <span>To</span>
              <input
                onChange={(event) => setDraftTo(event.target.value)}
                placeholder="team@example.com"
                required
                type="email"
                value={draftTo}
              />
            </label>
            <label>
              <span>Subject</span>
              <input
                onChange={(event) => setDraftSubject(event.target.value)}
                placeholder="What is this about?"
                required
                value={draftSubject}
              />
            </label>
            <label>
              <span>Message</span>
              <textarea
                onChange={(event) => setDraftBody(event.target.value)}
                placeholder="Write the update..."
                required
                rows={5}
                value={draftBody}
              />
            </label>
            <div className="composer-actions">
              <button className="composer-secondary" disabled={isOutboxBusy} onClick={onFlushOutbox} type="button">
                Flush outbox
              </button>
              <button className="composer-primary" disabled={isOutboxBusy} type="submit">
                {isOutboxBusy ? 'Working...' : 'Queue'}
              </button>
            </div>
            <p className="composer-status" role="status">
              {outboxStatus}
            </p>
          </form>
        ) : !isSidebarCollapsed ? (
          <div className="outbox-mini-card">
            <span>Outbox</span>
            <strong>{outboxStatus}</strong>
            <button disabled={isOutboxBusy} onClick={onFlushOutbox} type="button">
              {isOutboxBusy ? 'Sending...' : 'Flush queue'}
            </button>
          </div>
        ) : null}

        <nav className={isSidebarCollapsed ? 'folder-nav folder-nav-rail' : 'folder-nav'} aria-label="Mailbox folders">
          <div className="folder-group">
            {!isSidebarCollapsed ? <p className="folder-group-title">System folders</p> : null}
            {systemFolders.map((folder) => {
              const Icon = folder.role
                ? folderIconMap[folder.role as keyof typeof folderIconMap] ?? BellDot
                : Folder;
              return (
                <button
                  aria-label={isSidebarCollapsed ? folder.name : undefined}
                  className={folder.id === activeFolderId ? 'folder-link folder-link-active' : 'folder-link'}
                  key={folder.id}
                  onClick={() => onSelectFolder(folder.id)}
                  type="button"
                >
                  <span className="folder-link-main">
                    <Icon size={16} />
                    {!isSidebarCollapsed ? <span className="folder-link-label">{folder.name}</span> : null}
                  </span>
                  {!isSidebarCollapsed ? (
                    <span className="folder-count">{folder.unread_count}</span>
                  ) : folder.unread_count ? (
                    <span className="folder-rail-dot" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {!isSidebarCollapsed ? (
            <details className="folder-group" open>
              <summary className="folder-group-title">Custom folders</summary>
              {customFolders.length ? (
                customFolders.map((folder) => (
                  <button
                    className={folder.id === activeFolderId ? 'folder-link folder-link-active' : 'folder-link'}
                    key={folder.id}
                    onClick={() => onSelectFolder(folder.id)}
                    type="button"
                  >
                    <span className="folder-link-main">
                      <Folder size={16} />
                      <span className="folder-link-label">{folder.name}</span>
                    </span>
                    <span className="folder-count">{folder.unread_count}</span>
                  </button>
                ))
              ) : (
                <p className="folder-empty-note">No custom folders yet</p>
              )}
            </details>
          ) : null}
        </nav>

        {!isSidebarCollapsed ? (
          <div className="account-switcher">
            <div>
              <span>Active account</span>
              <strong>{accountId}</strong>
            </div>
            <button aria-label="Open account settings" type="button">
              <Settings size={15} />
            </button>
          </div>
        ) : null}
      </aside>

      <main className="content-panel">
        <header className="topbar">
          <label className="search-shell" aria-label="Search">
            <Search size={16} />
            <input
              ref={searchInputRef}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search threads, people, commands"
              value={searchQuery}
            />
            <span className="shortcut-pill">
              <Command size={12} />
              K
            </span>
          </label>

          <div className="status-row">
            <button
              aria-label={`Switch theme (${themeId})`}
              className="theme-toggle"
              onClick={cycleTheme}
              type="button"
            >
              {themeId}
            </button>
            <button
              aria-label={layoutMode === 'split' ? 'Switch to list layout' : 'Switch to split layout'}
              aria-pressed={layoutMode === 'list'}
              className="layout-toggle"
              onClick={toggleLayoutMode}
              type="button"
            >
              {layoutMode === 'split' ? 'Split' : 'List'}
            </button>
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
              <span>Sync phase</span>
              <strong>{syncPhaseLabel}</strong>
            </article>
            <article>
              <span>Folders</span>
              <strong>{syncFoldersLabel}</strong>
            </article>
            <article>
              <span>Messages</span>
              <strong>{syncMessagesLabel}</strong>
            </article>
          </div>
        </section>

        <section
          className={[
            'workspace-grid',
            layoutMode === 'list' ? 'workspace-grid-list' : '',
            isResizingThreadPanel ? 'workspace-grid-resizing' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          ref={workspaceRef}
          style={workspaceStyle}
        >
          <div className="thread-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Prototype inbox</p>
                <h3>{threadPanelTitle}</h3>
              </div>
              <StatusBadge label={threadPanelCountLabel} tone="neutral" />
            </div>

            {!threads.length ? (
              <div className="thread-empty-state">
                <p className="thread-empty-title">
                  {isSearchActive ? 'No results found' : `${activeFolder?.name ?? 'Folder'} is clear`}
                </p>
                <p className="thread-empty-copy">
                  {isSearchActive
                    ? 'Tente outro termo para localizar conversas por assunto, snippet ou participante.'
                    : 'Nenhuma thread encontrada nesta pasta no momento. Quando houver atividade, ela aparece aqui.'}
                </p>
              </div>
            ) : null}

            <div className="thread-list">
              {threads.map((thread) => (
                <button
                  className={thread.id === selectedThreadId ? 'thread-card thread-card-active' : 'thread-card'}
                  key={thread.id}
                  onClick={() => onSelectThread(thread.id)}
                  type="button"
                >
                  <div className="thread-card-row">
                    <h4>{thread.participants[0] ?? 'Open Mail'}</h4>
                    <span>{formatThreadTime(thread.lastMessageAt)}</span>
                  </div>
                  <p className="thread-subject">{thread.subject}</p>
                  <p className="thread-preview">{thread.snippet}</p>
                  {thread.isUnread ? <span className="thread-dot" aria-label="Unread thread" /> : null}
                </button>
              ))}
            </div>
          </div>

          <button
            aria-label="Resize thread and reader panels"
            aria-orientation="vertical"
            className="panel-resizer"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setIsResizingThreadPanel(true);
            }}
            role="separator"
            type="button"
          >
            <GripVertical size={16} />
          </button>

          <aside className="insight-panel reader-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Thread reader</p>
                <h3>{selectedThread?.subject ?? 'Select a conversation'}</h3>
              </div>
              {selectedThread ? <StatusBadge label={`${messages.length} messages`} tone="neutral" /> : null}
            </div>

            {isMessagesLoading ? (
              <p className="reader-empty">Carregando a thread selecionada...</p>
            ) : null}

            {!isMessagesLoading && !selectedThread ? (
              <p className="reader-empty">Selecione uma thread para ver o histórico completo da conversa.</p>
            ) : null}

            {!isMessagesLoading && selectedThread ? (
              <div className="message-stack">
                {messages.map((message) => (
                  <button
                    className={
                      message.id === selectedMessageId ? 'message-card message-card-active' : 'message-card'
                    }
                    key={message.id}
                    onClick={() => onSelectMessage(message.id)}
                    type="button"
                  >
                    <div className="message-meta">
                      <div>
                        <p className="message-author">{getPrimaryAuthor(message)}</p>
                        <p className="message-address">{message.from[0]?.email ?? 'unknown@openmail.dev'}</p>
                      </div>

                      <div className="message-actions">
                        <span>{formatMessageDate(message.date)}</span>
                        <span aria-label="Reply to message" className="message-action" role="presentation">
                          <Reply size={14} />
                        </span>
                      </div>
                    </div>

                    <p className="message-snippet">{message.plain_text ?? message.snippet}</p>

                    {message.attachments.length ? (
                      <div className="attachment-strip">
                        {message.attachments.map((attachment) => (
                          <span className="attachment-chip" key={attachment.id}>
                            <Paperclip size={12} />
                            {attachment.filename}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))}

                {selectedMessage ? (
                  <section className="message-detail-card">
                    <div className="message-detail-row">
                      <span className="message-detail-label">Subject</span>
                      <strong>{selectedMessage.subject}</strong>
                    </div>

                    <div className="message-detail-row">
                      <span className="message-detail-label">From</span>
                      <span>{selectedMessage.from[0]?.email ?? 'unknown@openmail.dev'}</span>
                    </div>

                    {selectedMessageParticipants ? (
                      <div className="message-detail-row">
                        <span className="message-detail-label">To</span>
                        <span>{selectedMessageParticipants}</span>
                      </div>
                    ) : null}

                    <div className="message-detail-row">
                      <span className="message-detail-label">Message-ID</span>
                      <span>{selectedMessage.message_id_header}</span>
                    </div>

                    {Object.keys(selectedMessage.headers).length ? (
                      <div className="message-header-grid">
                        {Object.entries(selectedMessage.headers).map(([key, value]) => (
                          <div className="message-header-chip" key={key}>
                            <span>{key}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </div>
            ) : null}
          </aside>
        </section>

        <footer className="status-bar" aria-label="Mailbox status">
          <span>{totalUnreadCount} unread</span>
          <span>{activeFolder?.name ?? 'No folder selected'}</span>
          <span>{layoutMode === 'split' ? 'Split layout' : 'List layout'}</span>
          <span>{syncStatusLabel}</span>
        </footer>
      </main>
    </div>
  );
};
