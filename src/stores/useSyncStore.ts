import { create } from 'zustand';
import type { SyncState, SyncStatusDetail } from '@lib/contracts';

type SyncStateByAccount = Record<string, SyncStatusDetail>;

type SyncStoreState = {
  syncByAccountId: SyncStateByAccount;
  lastEventState: SyncState;
  setSyncStatus: (accountId: string, status: SyncStatusDetail) => void;
  setLastEventState: (state: SyncState) => void;
  clearSyncStatus: (accountId: string) => void;
};

export const useSyncStore = create<SyncStoreState>((set) => ({
  syncByAccountId: {},
  lastEventState: { kind: 'not-started' },
  setSyncStatus: (accountId, status) =>
    set((state) => ({
      syncByAccountId: {
        ...state.syncByAccountId,
        [accountId]: status
      },
      lastEventState: status.state
    })),
  setLastEventState: (lastEventState) => set({ lastEventState }),
  clearSyncStatus: (accountId) =>
    set((state) => {
      const syncByAccountId = { ...state.syncByAccountId };
      delete syncByAccountId[accountId];

      return { syncByAccountId };
    })
}));
