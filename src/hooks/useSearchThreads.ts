import { useQuery } from '@tanstack/react-query';
import type { ThreadRecord, ThreadSummary } from '@lib/contracts';
import { matchesParsedSearchQuery, parseSearchQuery } from '@lib/search-query';
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

export const useSearchThreads = (
  accountId: string | null,
  query: string,
  fallbackThreads: ThreadRecord[]
) =>
  useQuery({
    queryKey: ['search-threads', accountId, query],
    enabled: accountId !== null && query.trim().length > 0,
    queryFn: async () => {
      if (!accountId) {
        return [];
      }

      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return [];
      }

      if (!tauriRuntime.isAvailable()) {
        const parsedQuery = parseSearchQuery(trimmedQuery);
        return toThreadSummary(fallbackThreads.filter((thread) => matchesParsedSearchQuery(thread, parsedQuery)));
      }

      return api.mailbox.searchThreads(accountId, trimmedQuery);
    }
  });
