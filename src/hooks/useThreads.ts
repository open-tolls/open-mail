import { useCallback, useEffect } from 'react';
import { useTauriEvent } from '@hooks/useTauriEvent';
import type { DomainEvent, ThreadRecord } from '@lib/contracts';
import { tauriRuntime } from '@lib/tauri-bridge';
import { useThreadStore } from '@stores/useThreadStore';

type UseThreadsOptions = {
  accountId: string | null;
  folderId: string | null;
  fallbackThreads?: ThreadRecord[];
};

export const useThreads = ({ accountId, folderId, fallbackThreads = [] }: UseThreadsOptions) => {
  const threads = useThreadStore((state) => state.threads);
  const isLoading = useThreadStore((state) => state.isLoading);
  const hasMore = useThreadStore((state) => state.hasMore);
  const fetchThreads = useThreadStore((state) => state.fetchThreads);
  const fetchMore = useThreadStore((state) => state.fetchMore);

  useEffect(() => {
    if (!accountId || !folderId) {
      return;
    }

    void fetchThreads(accountId, folderId, fallbackThreads, { force: !tauriRuntime.isAvailable() });
  }, [accountId, fallbackThreads, fetchThreads, folderId]);

  const refreshThreads = useCallback(() => {
    if (!accountId || !folderId) {
      return;
    }

    void fetchThreads(accountId, folderId, fallbackThreads, { force: true });
  }, [accountId, fallbackThreads, fetchThreads, folderId]);

  useTauriEvent<DomainEvent>(
    'domain:event',
    (domainEvent) => {
      if (domainEvent.type === 'threads-changed' && domainEvent.accountId === accountId) {
        refreshThreads();
      }
    },
    { enabled: Boolean(accountId && folderId) }
  );

  return {
    threads,
    isLoading,
    hasMore,
    refreshThreads,
    loadMore: () => {
      if (!accountId || !folderId) {
        return Promise.resolve();
      }

      return fetchMore(accountId, folderId, fallbackThreads);
    }
  };
};
