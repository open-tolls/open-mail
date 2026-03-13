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
  hasAttachments: boolean;
  messageCount: number;
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

export type ContactRecord = {
  id: string;
  account_id: string;
  name: string | null;
  email: string;
  is_me: boolean;
  created_at: string;
  updated_at: string;
};

export type AttachmentRecord = {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size: number;
  content_id: string | null;
  is_inline: boolean;
  local_path: string | null;
};

export type MessageRecord = {
  id: string;
  account_id: string;
  thread_id: string;
  from: ContactRecord[];
  to: ContactRecord[];
  cc: ContactRecord[];
  bcc: ContactRecord[];
  reply_to: ContactRecord[];
  subject: string;
  snippet: string;
  body: string;
  plain_text: string | null;
  message_id_header: string;
  in_reply_to: string | null;
  references: string[];
  folder_id: string;
  label_ids: string[];
  is_unread: boolean;
  is_starred: boolean;
  is_draft: boolean;
  date: string;
  attachments: AttachmentRecord[];
  headers: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export type MailboxReadModel = {
  accountId: string;
  activeFolder: string;
  syncState: SyncState;
  folders: FolderRecord[];
  threads: ThreadSummary[];
  allThreads: ThreadRecord[];
};

export type MailboxOverview = {
  accountId: string;
  activeFolderId: string;
  folders: FolderRecord[];
  threads: ThreadSummary[];
  syncState: SyncState;
};
