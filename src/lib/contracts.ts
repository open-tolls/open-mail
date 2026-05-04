export type SyncState =
  | { kind: 'not-started' }
  | { kind: 'running' }
  | { kind: 'sleeping' }
  | { kind: 'error'; message: string };

export type SyncPhase = 'connecting' | 'discovering-folders' | 'syncing-folders' | 'idling';
export type NotificationScope = 'inbox' | 'all';

export type AccountProvider = 'Gmail' | 'Outlook' | 'Yahoo' | 'Imap' | 'Exchange';

export type SecurityType = 'Ssl' | 'StartTls' | 'None';

export type ConnectionSettings = {
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityType;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityType;
};

export type ConnectionCredentials = {
  username: string;
  password: string;
};

export type TestMailConnectionRequest = {
  settings: ConnectionSettings;
  credentials: ConnectionCredentials;
};

export type AccountRecordResponse = {
  id: string;
  name: string;
  emailAddress: string;
  provider: AccountProvider;
  connectionSettings: ConnectionSettings;
  syncState: SyncState;
  createdAt: string;
  updatedAt: string;
};

export type AddAccountRequest = {
  name: string;
  email: string;
  provider: AccountProvider;
  settings: ConnectionSettings;
  credentials: ConnectionCredentials;
};

export type CompleteOAuthAccountRequest = {
  provider: AccountProvider;
  clientId: string;
  redirectUri: string;
  authorizationCode: string;
  codeVerifier: string;
  email: string;
  name: string;
};

export type BuildOAuthAuthorizationUrlRequest = {
  provider: AccountProvider;
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
};

export type OAuthAuthorizationRequest = {
  provider: AccountProvider;
  authorizationUrl: string;
  state: string;
  scopes: string[];
  redirectUri: string;
};

export type SyncFolderState = {
  path: string;
  displayName: string;
  unreadCount: number;
  totalCount: number;
  envelopesDiscovered: number;
  messagesApplied: number;
};

export type SyncStatusDetail = {
  state: SyncState;
  phase: SyncPhase | null;
  folders: SyncFolderState[];
  foldersSynced: number;
  messagesObserved: number;
  messagesFlagged: number;
  messagesDeleted: number;
  lastSyncStartedAt: string | null;
  lastSyncFinishedAt: string | null;
  lastError: string | null;
};

export type DomainEvent =
  | { type: 'application-started' }
  | { type: 'threads-changed'; accountId: string; threadIds: string[] }
  | { type: 'snooze-woke'; accountId: string; threadId: string }
  | {
      type: 'scheduled-send-processed';
      accountId: string;
      scheduledSendId: string;
      subject: string;
      success: boolean;
      errorMessage: string | null;
    }
  | { type: 'messages-changed'; accountId: string; messageIds: string[] }
  | { type: 'folders-changed'; accountId: string }
  | { type: 'labels-changed'; accountId: string }
  | { type: 'contacts-changed'; accountId: string }
  | { type: 'sync-status-changed'; accountId: string; state: SyncState }
  | { type: 'account-added'; accountId: string }
  | { type: 'account-removed'; accountId: string };

export type AppShellEvent = { type: 'compose-new' };

export type MailAddress = {
  name: string | null;
  email: string;
};

export type MimeAttachment = {
  filename: string;
  contentType: string;
  data: number[];
  isInline: boolean;
  contentId: string | null;
};

export type MimeMessage = {
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress | null;
  subject: string;
  htmlBody: string;
  plainBody: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: MimeAttachment[];
};

export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'failed';

export type OutboxMessage = {
  id: string;
  accountId: string;
  mimeMessage: MimeMessage;
  status: OutboxStatus;
  retryCount: number;
  lastError: string | null;
  queuedAt: string;
  updatedAt: string;
};

export type EnqueueOutboxMessageRequest = {
  accountId: string;
} & MimeMessage;

export type OutboxSendReport = {
  accountId: string;
  attempted: number;
  sent: number;
  failed: number;
};

export type SnoozeThreadRequest = {
  threadId: string;
  until: string;
};

export type ScheduledSendStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';

export type ScheduleSendRequest = {
  accountId: string;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress | null;
  subject: string;
  htmlBody: string;
  plainBody: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: MimeAttachment[];
  sendAt: string;
};

export type ScheduledSendRecord = {
  id: string;
  accountId: string;
  mimeMessage: MimeMessage;
  sendAt: string;
  status: ScheduledSendStatus;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SignatureRecord = {
  id: string;
  title: string;
  body: string;
  accountId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SignatureSettings = {
  signatures: SignatureRecord[];
  defaultSignatureId: string | null;
  defaultSignatureIdsByAccountId: Record<string, string | null>;
};

export type AppConfig = {
  language: string;
  defaultAccountId: string | null;
  markAsReadOnOpen: boolean;
  showSnippets: boolean;
  autoLoadImages: boolean;
  includeSignatureInReplies: boolean;
  requestReadReceipts: boolean;
  undoSendDelaySeconds: number;
  launchAtLogin: boolean;
  checkForUpdates: boolean;
  minimizeToTray: boolean;
  theme: string;
  fontSize: number;
  layoutMode: string;
  density: string;
  threadPanelWidth: number;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationScope: NotificationScope;
  quietHoursStart: string;
  quietHoursEnd: string;
  developerToolsEnabled: boolean;
  logLevel: string;
};

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
