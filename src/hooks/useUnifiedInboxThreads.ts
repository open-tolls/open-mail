import { useQuery } from '@tanstack/react-query';
import type { ThreadRecord, ThreadSummary } from '@lib/contracts';
import { toThreadSummary } from '@lib/thread-summary';
import { api, tauriRuntime } from '@lib/tauri-bridge';
import type { AccountRecord } from '@stores/useAccountStore';

type UseUnifiedInboxThreadsOptions = {
  accounts: AccountRecord[];
  fallbackThreads: ThreadRecord[];
  enabled?: boolean;
};

const sortThreadsByNewest = (threads: ThreadSummary[]) =>
  [...threads].sort(
    (first, second) => new Date(second.lastMessageAt).getTime() - new Date(first.lastMessageAt).getTime()
  );

const dedupeThreads = (threads: ThreadSummary[]) =>
  threads.filter((thread, index, allThreads) => allThreads.findIndex((candidate) => candidate.id === thread.id) === index);

const isInboxFolderId = (folderId: string) => folderId.toLowerCase().includes('inbox');

export const useUnifiedInboxThreads = ({
  accounts,
  fallbackThreads,
  enabled = true
}: UseUnifiedInboxThreadsOptions) =>
  useQuery({
    queryKey: ['unified-inbox-threads', accounts.map((account) => account.id).sort().join('|')],
    enabled: enabled && accounts.length > 1,
    queryFn: async () => {
      if (!tauriRuntime.isAvailable()) {
        const accountIds = new Set(accounts.map((account) => account.id));
        return sortThreadsByNewest(
          toThreadSummary(
            fallbackThreads.filter(
              (thread) =>
                accountIds.has(thread.account_id) &&
                thread.folder_ids.some((folderId) => isInboxFolderId(folderId))
            )
          )
        );
      }

      const folderLists = await Promise.all(accounts.map((account) => api.mailbox.listFolders(account.id)));
      const inboxTargets = folderLists.flatMap((folders, index) => {
        const inboxFolder = folders.find((folder) => folder.role === 'inbox');

        if (!inboxFolder) {
          return [];
        }

        return [{ accountId: accounts[index].id, folderId: inboxFolder.id }];
      });

      const inboxPages = await Promise.all(
        inboxTargets.map(({ accountId, folderId }) => api.mailbox.listThreads(accountId, folderId, 0, 25))
      );

      return sortThreadsByNewest(dedupeThreads(inboxPages.flat()));
    }
  });
