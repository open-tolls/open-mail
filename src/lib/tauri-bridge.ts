import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type {
  AccountRecordResponse,
  AddAccountRequest,
  BuildOAuthAuthorizationUrlRequest,
  ConnectionSettings,
  CompleteOAuthAccountRequest,
  EnqueueOutboxMessageRequest,
  MailboxOverview,
  MessageRecord,
  OAuthAuthorizationRequest,
  OutboxMessage,
  OutboxSendReport,
  SignatureRecord,
  SignatureSettings,
  SyncStatusDetail,
  TestMailConnectionRequest,
  ThreadSummary
} from '@lib/contracts';

const isTauriRuntimeAvailable = () =>
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

const invokeOrThrow = async <T>(command: string, args?: Record<string, unknown>) => {
  if (!isTauriRuntimeAvailable()) {
    throw new Error('Tauri runtime unavailable');
  }

  return invoke<T>(command, args);
};

export const api = {
  accounts: {
    list: () => invokeOrThrow<AccountRecordResponse[]>('list_accounts'),
    add: (request: AddAccountRequest) => invokeOrThrow<AccountRecordResponse>('add_account', { request })
  },
  mailbox: {
    overview: () => invokeOrThrow<MailboxOverview>('mailbox_overview'),
    listThreads: (accountId: string, folderId: string, offset = 0, limit = 25) =>
      invokeOrThrow<ThreadSummary[]>('list_threads', { accountId, folderId, offset, limit }),
    searchThreads: (accountId: string, query: string) =>
      invokeOrThrow<ThreadSummary[]>('search_threads', { accountId, query })
  },
  sync: {
    statusDetail: () => invokeOrThrow<Record<string, SyncStatusDetail>>('get_sync_status_detail'),
    start: (accountId: string) => invokeOrThrow<void>('start_sync', { accountId })
  },
  messages: {
    listByThread: (threadId: string) =>
      invokeOrThrow<MessageRecord[]>('list_messages', { threadId }),
    get: (messageId: string) =>
      invokeOrThrow<MessageRecord | null>('get_message', { messageId }),
    markRead: (messageIds: string[]) =>
      invokeOrThrow<string[]>('mark_messages_read', { messageIds }),
    markUnread: (messageIds: string[]) =>
      invokeOrThrow<string[]>('mark_messages_unread', { messageIds })
  },
  attachments: {
    download: (localPath: string, savePath: string) =>
      invokeOrThrow<void>('download_attachment', { localPath, savePath })
  },
  outbox: {
    enqueue: (request: EnqueueOutboxMessageRequest) =>
      invokeOrThrow<OutboxMessage>('enqueue_outbox_message', { request }),
    flush: (accountId: string) =>
      invokeOrThrow<OutboxSendReport>('flush_outbox', { accountId })
  },
  credentials: {
    saveAccountPassword: (accountId: string, username: string, password: string) =>
      invokeOrThrow<void>('save_account_credentials', {
        request: {
          accountId,
          username,
          password
        }
      })
  },
  signatures: {
    list: () => invokeOrThrow<SignatureSettings>('list_signatures'),
    save: (request: Omit<SignatureRecord, 'createdAt' | 'updatedAt'>) =>
      invokeOrThrow<SignatureRecord>('save_signature', { request }),
    delete: (id: string) => invokeOrThrow<void>('delete_signature', { id }),
    setDefault: (signatureId: string | null, accountId?: string | null) =>
      invokeOrThrow<void>('set_default_signature', {
        request: {
          signatureId,
          accountId: accountId ?? null
        }
      })
  },
  auth: {
    buildOAuthAuthorizationUrl: (request: BuildOAuthAuthorizationUrlRequest) =>
      invokeOrThrow<OAuthAuthorizationRequest>('build_oauth_authorization_url', { request }),
    completeOAuthAccount: (request: CompleteOAuthAccountRequest) =>
      invokeOrThrow<AccountRecordResponse>('complete_oauth_account', { request })
  },
  onboarding: {
    autodiscoverSettings: (email: string) =>
      invokeOrThrow<ConnectionSettings | null>('autodiscover_settings', { email }),
    testImapConnection: (request: TestMailConnectionRequest) =>
      invokeOrThrow<void>('test_imap_connection', { request }),
    testSmtpConnection: (request: TestMailConnectionRequest) =>
      invokeOrThrow<void>('test_smtp_connection', { request })
  },
  drafts: {
    list: (accountId: string) => invokeOrThrow<MessageRecord[]>('list_drafts', { accountId }),
    save: (request: {
      id: string;
      accountId: string;
      to: string[];
      cc: string[];
      bcc: string[];
      subject: string;
      body: string;
      inReplyTo: string | null;
      references: string[];
    }) => invokeOrThrow<string>('save_draft', { request }),
    delete: (accountId: string, draftId: string) =>
      invokeOrThrow<void>('delete_draft', { accountId, draftId })
  },
  system: {
    openExternalUrl: (url: string) => invokeOrThrow<void>('open_external_url', { url }),
    toAssetUrl: (filePath: string) => (isTauriRuntimeAvailable() ? convertFileSrc(filePath) : filePath)
  }
};

export const tauriRuntime = {
  isAvailable: isTauriRuntimeAvailable
};
