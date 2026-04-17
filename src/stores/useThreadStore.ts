import { create } from 'zustand';
import type { ThreadRecord, ThreadSummary } from '@lib/contracts';

type ThreadState = {
  threadRecords: ThreadRecord[];
  threadSummaries: ThreadSummary[];
  selectedThreadId: string | null;
  setThreadRecords: (threads: ThreadRecord[]) => void;
  setThreadSummaries: (threads: ThreadSummary[]) => void;
  selectThread: (threadId: string | null) => void;
  toggleStarred: (threadId: string) => void;
};

export const useThreadStore = create<ThreadState>((set) => ({
  threadRecords: [],
  threadSummaries: [],
  selectedThreadId: null,
  setThreadRecords: (threadRecords) => set({ threadRecords }),
  setThreadSummaries: (threadSummaries) =>
    set((state) => ({
      threadSummaries,
      selectedThreadId:
        state.selectedThreadId && threadSummaries.some((thread) => thread.id === state.selectedThreadId)
          ? state.selectedThreadId
          : threadSummaries[0]?.id ?? null
    })),
  selectThread: (selectedThreadId) => set({ selectedThreadId }),
  toggleStarred: (threadId) =>
    set((state) => ({
      threadSummaries: state.threadSummaries.map((thread) =>
        thread.id === threadId ? { ...thread, isStarred: !thread.isStarred } : thread
      ),
      threadRecords: state.threadRecords.map((thread) =>
        thread.id === threadId ? { ...thread, is_starred: !thread.is_starred } : thread
      )
    }))
}));
