import { useQuery } from '@tanstack/react-query';
import type { ThreadRecord, ThreadSummary } from '@lib/contracts';
import { api, tauriRuntime } from '@lib/tauri-bridge';

const toThreadSummary = (threads: ThreadRecord[]): ThreadSummary[] =>
  threads.map((thread) => ({
    id: thread.id,
    subject: thread.subject,
    snippet: thread.snippet,
    participants: thread.participant_ids,
    isUnread: thread.is_unread,
    isStarred: thread.is_starred,
    hasAttachments: thread.has_attachments,
    messageCount: thread.message_count,
    lastMessageAt: thread.last_message_at
  }));

export const useFolderThreads = (
  accountId: string | null,
  folderId: string | null,
  fallbackThreads: ThreadRecord[]
) =>
  useQuery({
    queryKey: ['folder-threads', accountId, folderId],
    enabled: accountId !== null && folderId !== null,
    queryFn: async () => {
      if (!accountId || !folderId) {
        return [];
      }

      if (!tauriRuntime.isAvailable()) {
        return toThreadSummary(
          fallbackThreads.filter((thread) => thread.folder_ids.includes(folderId))
        );
      }

      return api.mailbox.listThreads(accountId, folderId);
    }
  });
