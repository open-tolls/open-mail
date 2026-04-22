import { create } from 'zustand';
import type { ThreadRecord, ThreadSummary } from '@lib/contracts';
import { api, tauriRuntime } from '@lib/tauri-bridge';
import { getThreadPageFromRecords } from '@lib/thread-summary';

const pageSize = 50;

const getFolderKey = (accountId: string, folderId: string) => `${accountId}:${folderId}`;

type FetchThreadOptions = {
  force?: boolean;
};

export type StoreThreadAction = 'archive' | 'trash' | 'toggle-read' | 'star';

type ThreadState = {
  activeFolderKey: string | null;
  hasMore: boolean;
  hasMoreByFolderKey: Record<string, boolean>;
  isLoading: boolean;
  offset: number;
  offsetByFolderKey: Record<string, number>;
  pageSize: number;
  threadRecords: ThreadRecord[];
  threads: ThreadSummary[];
  threadsByFolderKey: Record<string, ThreadSummary[]>;
  threadSummaries: ThreadSummary[];
  selectedThreadId: string | null;
  applyThreadAction: (action: StoreThreadAction, threadIds: string[]) => void;
  fetchMore: (accountId: string, folderId: string, fallbackThreads?: ThreadRecord[]) => Promise<void>;
  fetchThreads: (
    accountId: string,
    folderId: string,
    fallbackThreads?: ThreadRecord[],
    options?: FetchThreadOptions
  ) => Promise<void>;
  removeThread: (threadId: string) => void;
  setThreadRecords: (threads: ThreadRecord[]) => void;
  setThreadSummaries: (threads: ThreadSummary[]) => void;
  selectThread: (threadId: string | null) => void;
  toggleStarred: (threadId: string) => void;
  updateThread: (threadId: string, partial: Partial<ThreadSummary>) => void;
};

export const useThreadStore = create<ThreadState>((set, get) => ({
  activeFolderKey: null,
  hasMore: false,
  hasMoreByFolderKey: {},
  isLoading: false,
  offset: 0,
  offsetByFolderKey: {},
  pageSize,
  threadRecords: [],
  threads: [],
  threadsByFolderKey: {},
  threadSummaries: [],
  selectedThreadId: null,
  applyThreadAction: (action, threadIds) =>
    set((state) => {
      const selectedThreadIds = new Set(threadIds);
      const selectedSummaries = state.threadSummaries.filter((thread) => selectedThreadIds.has(thread.id));
      const shouldMarkUnread =
        action === 'toggle-read' && selectedSummaries.length > 0 && selectedSummaries.every((thread) => !thread.isUnread);

      const updateSummary = (thread: ThreadSummary) => {
        if (!selectedThreadIds.has(thread.id)) {
          return thread;
        }

        if (action === 'star') {
          return { ...thread, isStarred: !thread.isStarred };
        }

        if (action === 'toggle-read') {
          return { ...thread, isUnread: shouldMarkUnread };
        }

        return thread;
      };
      const updateRecord = (thread: ThreadRecord) => {
        if (!selectedThreadIds.has(thread.id)) {
          return thread;
        }

        if (action === 'star') {
          return { ...thread, is_starred: !thread.is_starred };
        }

        if (action === 'toggle-read') {
          return { ...thread, is_unread: shouldMarkUnread };
        }

        return thread;
      };

      if (action === 'archive' || action === 'trash') {
        const keepThread = (thread: ThreadSummary | ThreadRecord) => !selectedThreadIds.has(thread.id);
        const nextThreads = state.threads.filter(keepThread);

        return {
          selectedThreadId: selectedThreadIds.has(state.selectedThreadId ?? '')
            ? nextThreads[0]?.id ?? null
            : state.selectedThreadId,
          threads: nextThreads,
          threadRecords: state.threadRecords.filter(keepThread),
          threadSummaries: state.threadSummaries.filter(keepThread),
          threadsByFolderKey: Object.fromEntries(
            Object.entries(state.threadsByFolderKey).map(([folderKey, threads]) => [
              folderKey,
              threads.filter(keepThread)
            ])
          )
        };
      }

      return {
        threads: state.threads.map(updateSummary),
        threadRecords: state.threadRecords.map(updateRecord),
        threadSummaries: state.threadSummaries.map(updateSummary),
        threadsByFolderKey: Object.fromEntries(
          Object.entries(state.threadsByFolderKey).map(([folderKey, threads]) => [
            folderKey,
            threads.map(updateSummary)
          ])
        )
      };
    }),
  fetchThreads: async (accountId, folderId, fallbackThreads = [], options = {}) => {
    const folderKey = getFolderKey(accountId, folderId);
    const cachedThreads = get().threadsByFolderKey[folderKey];

    if (cachedThreads && !options.force) {
      set({
        activeFolderKey: folderKey,
        hasMore: get().hasMoreByFolderKey[folderKey] ?? false,
        offset: get().offsetByFolderKey[folderKey] ?? cachedThreads.length,
        threads: cachedThreads,
        threadSummaries: cachedThreads,
        selectedThreadId: cachedThreads[0]?.id ?? null
      });
      return;
    }

    set({ activeFolderKey: folderKey, isLoading: true });

    try {
      const firstPage = tauriRuntime.isAvailable()
        ? await api.mailbox.listThreads(accountId, folderId, 0, pageSize)
        : getThreadPageFromRecords(fallbackThreads, folderId, 0, pageSize);
      const fallbackTotal = fallbackThreads.filter((thread) => thread.folder_ids.includes(folderId)).length;
      const hasMore = tauriRuntime.isAvailable() ? firstPage.length === pageSize : firstPage.length < fallbackTotal;

      set((state) => ({
        activeFolderKey: folderKey,
        hasMore,
        hasMoreByFolderKey: { ...state.hasMoreByFolderKey, [folderKey]: hasMore },
        isLoading: false,
        offset: firstPage.length,
        offsetByFolderKey: { ...state.offsetByFolderKey, [folderKey]: firstPage.length },
        selectedThreadId: firstPage[0]?.id ?? null,
        threads: firstPage,
        threadsByFolderKey: { ...state.threadsByFolderKey, [folderKey]: firstPage },
        threadSummaries: firstPage
      }));
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  fetchMore: async (accountId, folderId, fallbackThreads = []) => {
    const folderKey = getFolderKey(accountId, folderId);
    const currentThreads = get().threadsByFolderKey[folderKey] ?? [];
    const offset = get().offsetByFolderKey[folderKey] ?? currentThreads.length;

    if (!(get().hasMoreByFolderKey[folderKey] ?? get().hasMore)) {
      return;
    }

    set({ activeFolderKey: folderKey, isLoading: true });

    try {
      const nextPage = tauriRuntime.isAvailable()
        ? await api.mailbox.listThreads(accountId, folderId, offset, pageSize)
        : getThreadPageFromRecords(fallbackThreads, folderId, offset, pageSize);
      const mergedThreads = [...currentThreads, ...nextPage.filter((thread) => !currentThreads.some((current) => current.id === thread.id))];
      const fallbackTotal = fallbackThreads.filter((thread) => thread.folder_ids.includes(folderId)).length;
      const hasMore = tauriRuntime.isAvailable() ? nextPage.length === pageSize : mergedThreads.length < fallbackTotal;

      set((state) => ({
        hasMore,
        hasMoreByFolderKey: { ...state.hasMoreByFolderKey, [folderKey]: hasMore },
        isLoading: false,
        offset: mergedThreads.length,
        offsetByFolderKey: { ...state.offsetByFolderKey, [folderKey]: mergedThreads.length },
        threads: mergedThreads,
        threadsByFolderKey: { ...state.threadsByFolderKey, [folderKey]: mergedThreads },
        threadSummaries: mergedThreads
      }));
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  setThreadRecords: (threadRecords) => set({ threadRecords }),
  setThreadSummaries: (threadSummaries) =>
    set((state) => ({
      threads: threadSummaries,
      threadSummaries,
      selectedThreadId:
        state.selectedThreadId && threadSummaries.some((thread) => thread.id === state.selectedThreadId)
          ? state.selectedThreadId
          : threadSummaries[0]?.id ?? null
    })),
  selectThread: (selectedThreadId) => set({ selectedThreadId }),
  updateThread: (threadId, partial) =>
    set((state) => {
      const updateSummary = (thread: ThreadSummary) => (thread.id === threadId ? { ...thread, ...partial } : thread);

      return {
        threads: state.threads.map(updateSummary),
        threadSummaries: state.threadSummaries.map(updateSummary),
        threadsByFolderKey: Object.fromEntries(
          Object.entries(state.threadsByFolderKey).map(([folderKey, threads]) => [
            folderKey,
            threads.map(updateSummary)
          ])
        )
      };
    }),
  removeThread: (threadId) =>
    set((state) => ({
      selectedThreadId: state.selectedThreadId === threadId ? state.threads.find((thread) => thread.id !== threadId)?.id ?? null : state.selectedThreadId,
      threads: state.threads.filter((thread) => thread.id !== threadId),
      threadRecords: state.threadRecords.filter((thread) => thread.id !== threadId),
      threadSummaries: state.threadSummaries.filter((thread) => thread.id !== threadId),
      threadsByFolderKey: Object.fromEntries(
        Object.entries(state.threadsByFolderKey).map(([folderKey, threads]) => [
          folderKey,
          threads.filter((thread) => thread.id !== threadId)
        ])
      )
    })),
  toggleStarred: (threadId) =>
    set((state) => ({
      threads: state.threads.map((thread) => (thread.id === threadId ? { ...thread, isStarred: !thread.isStarred } : thread)),
      threadRecords: state.threadRecords.map((thread) =>
        thread.id === threadId ? { ...thread, is_starred: !thread.is_starred } : thread
      ),
      threadSummaries: state.threadSummaries.map((thread) =>
        thread.id === threadId ? { ...thread, isStarred: !thread.isStarred } : thread
      ),
      threadsByFolderKey: Object.fromEntries(
        Object.entries(state.threadsByFolderKey).map(([folderKey, threads]) => [
          folderKey,
          threads.map((thread) => (thread.id === threadId ? { ...thread, isStarred: !thread.isStarred } : thread))
        ])
      )
    }))
}));
