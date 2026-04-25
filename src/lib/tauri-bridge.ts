import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type {
  BuildOAuthAuthorizationUrlRequest,
  EnqueueOutboxMessageRequest,
  MailboxOverview,
  MessageRecord,
  OAuthAuthorizationRequest,
  OutboxMessage,
  OutboxSendReport,
  SignatureRecord,
  SignatureSettings,
  SyncStatusDetail,
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
  mailbox: {
    overview: () => invokeOrThrow<MailboxOverview>('mailbox_overview'),
    listThreads: (accountId: string, folderId: string, offset = 0, limit = 25) =>
      invokeOrThrow<ThreadSummary[]>('list_threads', { accountId, folderId, offset, limit }),
    searchThreads: (accountId: string, query: string) =>
      invokeOrThrow<ThreadSummary[]>('search_threads', { accountId, query })
  },
  sync: {
    statusDetail: () => invokeOrThrow<Record<string, SyncStatusDetail>>('get_sync_status_detail')
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
      invokeOrThrow<OAuthAuthorizationRequest>('build_oauth_authorization_url', { request })
  },
  system: {
    openExternalUrl: (url: string) => invokeOrThrow<void>('open_external_url', { url }),
    toAssetUrl: (filePath: string) => (isTauriRuntimeAvailable() ? convertFileSrc(filePath) : filePath)
  }
};

export const tauriRuntime = {
  isAvailable: isTauriRuntimeAvailable
};
