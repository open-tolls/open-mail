import {
  AlertCircle,
  Archive,
  BellDot,
  FileEdit,
  Folder,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react';
import type { FolderRecord } from '@lib/contracts';

type MailSidebarProps = {
  activeFolderId: string | null;
  folders: FolderRecord[];
  isCollapsed: boolean;
  isComposerOpen: boolean;
  isOutboxBusy: boolean;
  outboxStatus: string;
  onFlushOutbox: () => Promise<void>;
  onSelectFolder: (folderId: string) => void;
  onToggleComposer: () => void;
  onToggleSidebar: () => void;
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

const labelPreviews = [
  { id: 'lbl_design', name: 'design-review', color: '#84d8c7' },
  { id: 'lbl_release', name: 'desktop-alpha', color: '#f6b66f' },
  { id: 'lbl_infra', name: 'tauri-health', color: '#9eb7ff' }
];

export const MailSidebar = ({
  activeFolderId,
  folders,
  isCollapsed,
  isComposerOpen,
  isOutboxBusy,
  outboxStatus,
  onFlushOutbox,
  onSelectFolder,
  onToggleComposer,
  onToggleSidebar
}: MailSidebarProps) => {
  const accountId = folders[0]?.account_id ?? 'acc_demo';
  const systemFolders = folders.filter((folder) => folder.role);
  const customFolders = folders.filter((folder) => !folder.role);

  return (
    <aside className="sidebar-panel">
      <div className="sidebar-header">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          {!isCollapsed ? (
            <div>
              <p className="eyebrow">Tauri v2 + React</p>
              <h1>Open Mail</h1>
            </div>
          ) : null}
        </div>

        <button
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={isCollapsed}
          className="sidebar-toggle"
          onClick={onToggleSidebar}
          type="button"
        >
          {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <button
        aria-label={isComposerOpen ? 'Close composer' : 'New message'}
        className="compose-button"
        onClick={onToggleComposer}
        type="button"
      >
        <PencilLine size={16} />
        {!isCollapsed ? <span>{isComposerOpen ? 'Close composer' : 'New message'}</span> : null}
      </button>

      {!isCollapsed ? (
        <div className="outbox-mini-card">
          <span>{isComposerOpen ? 'Composer' : 'Outbox'}</span>
          <strong>{isComposerOpen ? 'Composer open in workspace' : outboxStatus}</strong>
          <button disabled={isOutboxBusy} onClick={onFlushOutbox} type="button">
            {isOutboxBusy ? 'Sending...' : 'Flush queue'}
          </button>
        </div>
      ) : null}

      <nav className={isCollapsed ? 'folder-nav folder-nav-rail' : 'folder-nav'} aria-label="Mailbox folders">
        <div className="folder-group">
          {!isCollapsed ? <p className="folder-group-title">System folders</p> : null}
          {systemFolders.map((folder) => {
            const Icon = folder.role ? folderIconMap[folder.role as keyof typeof folderIconMap] ?? BellDot : Folder;
            const count = folder.role === 'drafts' ? folder.total_count : folder.unread_count;
            return (
              <button
                aria-label={isCollapsed ? folder.name : undefined}
                className={folder.id === activeFolderId ? 'folder-link folder-link-active' : 'folder-link'}
                key={folder.id}
                onClick={() => onSelectFolder(folder.id)}
                type="button"
              >
                <span className="folder-link-main">
                  <Icon size={16} />
                  {!isCollapsed ? <span className="folder-link-label">{folder.name}</span> : null}
                </span>
                {!isCollapsed ? (
                  <span className="folder-count">{count}</span>
                ) : count ? (
                  <span className="folder-rail-dot" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>

        {!isCollapsed ? (
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

        {!isCollapsed ? (
          <details className="folder-group" open>
            <summary className="folder-group-title">Labels</summary>
            {labelPreviews.map((label) => (
              <button aria-label={`Label ${label.name}`} className="label-link" key={label.id} type="button">
                <span className="label-color" style={{ backgroundColor: label.color }} />
                <span>{label.name}</span>
              </button>
            ))}
          </details>
        ) : null}
      </nav>

      {!isCollapsed ? (
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
  );
};
