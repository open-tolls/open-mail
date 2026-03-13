import { describe, expect, it } from 'vitest';
import type { DomainEvent, MailboxReadModel } from '@lib/contracts';

describe('contracts', () => {
  it('supports mailbox read models for future IPC hydration', () => {
    const mailbox: MailboxReadModel = {
      activeFolder: 'Inbox',
      syncState: { kind: 'running' },
      folders: [],
      threads: [
        {
          id: 'thr_1',
          subject: 'Subject',
          snippet: 'Preview',
          participants: ['hello@example.com'],
          isUnread: true,
          isStarred: false,
          lastMessageAt: '2026-03-13T10:00:00Z'
        }
      ]
    };

    expect(mailbox.threads).toHaveLength(1);
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
