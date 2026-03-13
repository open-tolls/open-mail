import { describe, expect, it } from 'vitest';
import type { DomainEvent, MailboxReadModel } from '@lib/contracts';

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
});
