import { useQuery } from '@tanstack/react-query';
import type { SyncStatusDetail } from '@lib/contracts';
import { api, tauriRuntime } from '@lib/tauri-bridge';

const fallbackSyncStatus: SyncStatusDetail = {
  state: { kind: 'running' },
  phase: 'syncing-folders',
  folders: [
    {
      path: 'INBOX',
      displayName: 'Demo Inbox',
      unreadCount: 2,
      totalCount: 12,
      envelopesDiscovered: 1,
      messagesApplied: 1
    },
    {
      path: 'Archive',
      displayName: 'Archive',
      unreadCount: 0,
      totalCount: 4,
      envelopesDiscovered: 0,
      messagesApplied: 0
    }
  ],
  foldersSynced: 2,
  messagesObserved: 3,
  lastSyncStartedAt: '2026-03-13T10:00:00Z',
  lastSyncFinishedAt: '2026-03-13T10:00:25Z',
  lastError: null
};

export const useSyncStatusDetail = (accountId: string | null) =>
  useQuery({
    queryKey: ['sync-status-detail', accountId],
    enabled: accountId !== null,
    queryFn: async () => {
      if (!accountId) {
        return null;
      }

      if (!tauriRuntime.isAvailable()) {
        return fallbackSyncStatus;
      }

      const statuses = await api.sync.statusDetail();
      return statuses[accountId] ?? null;
    }
  });
