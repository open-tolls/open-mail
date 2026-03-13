export type SyncState =
  | { kind: 'not-started' }
  | { kind: 'running' }
  | { kind: 'sleeping' }
  | { kind: 'error'; message: string };

export type DomainEvent =
  | { type: 'threads-changed'; accountId: string; threadIds: string[] }
  | { type: 'messages-changed'; accountId: string; messageIds: string[] }
  | { type: 'folders-changed'; accountId: string }
  | { type: 'labels-changed'; accountId: string }
  | { type: 'contacts-changed'; accountId: string }
  | { type: 'sync-status-changed'; accountId: string; state: SyncState }
  | { type: 'account-added'; accountId: string }
  | { type: 'account-removed'; accountId: string };

export type ThreadSummary = {
  id: string;
  subject: string;
  snippet: string;
  participants: string[];
  isUnread: boolean;
  isStarred: boolean;
  lastMessageAt: string;
};

export type FolderRecord = {
  id: string;
  account_id: string;
  name: string;
  path: string;
  role: string | null;
  unread_count: number;
  total_count: number;
  created_at: string;
  updated_at: string;
};

export type ThreadRecord = {
  id: string;
  account_id: string;
  subject: string;
  snippet: string;
  message_count: number;
  participant_ids: string[];
  folder_ids: string[];
  label_ids: string[];
  has_attachments: boolean;
  is_unread: boolean;
  is_starred: boolean;
  last_message_at: string;
  last_message_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MailboxReadModel = {
  activeFolder: string;
  syncState: SyncState;
  folders: FolderRecord[];
  threads: ThreadSummary[];
};

export type MailboxOverview = {
  account_id: string;
  folders: FolderRecord[];
  threads: ThreadRecord[];
  sync_state: SyncState;
};

