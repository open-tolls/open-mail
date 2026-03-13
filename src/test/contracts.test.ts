import { describe, expect, it } from 'vitest';
import type { DomainEvent, MailboxReadModel, SyncStatusDetail } from '@lib/contracts';

describe('contracts', () => {
  it('supports mailbox read models for future IPC hydration', () => {
    const mailbox: MailboxReadModel = {
      accountId: 'acc_1',
      activeFolder: 'fld_inbox',
      syncState: { kind: 'running' },
      folders: [],
      allThreads: [],
      threads: [
        {
          id: 'thr_1',
          subject: 'Subject',
          snippet: 'Preview',
          participants: ['hello@example.com'],
          isUnread: true,
          isStarred: false,
          hasAttachments: false,
          messageCount: 1,
          lastMessageAt: '2026-03-13T10:00:00Z'
        }
      ]
    };

    expect(mailbox.threads).toHaveLength(1);
    expect(mailbox.allThreads).toHaveLength(0);
  });

  it('covers domain events consumed by the frontend shell', () => {
    const event: DomainEvent = {
      type: 'sync-status-changed',
      accountId: 'acc_1',
      state: { kind: 'sleeping' }
    };

    expect(event.type).toBe('sync-status-changed');
  });

  it('supports detailed sync snapshots for the phase 2 shell', () => {
    const status: SyncStatusDetail = {
      state: { kind: 'sleeping' },
      phase: 'idling',
      folders: [
        {
          path: 'INBOX',
          displayName: 'Inbox',
          unreadCount: 2,
          totalCount: 12
        }
      ],
      foldersSynced: 1,
      messagesObserved: 3,
      lastSyncStartedAt: '2026-03-13T10:00:00Z',
      lastSyncFinishedAt: '2026-03-13T10:00:25Z',
      lastError: null
    };

    expect(status.phase).toBe('idling');
    expect(status.folders[0]?.displayName).toBe('Inbox');
  });
});
