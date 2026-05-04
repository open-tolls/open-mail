import { describe, expect, it } from 'vitest';
import { getInvalidationKeysForDomainEvent } from '@lib/query-events';

describe('query event invalidation', () => {
  it('invalidates mailbox and thread queries for thread changes', () => {
    const keys = getInvalidationKeysForDomainEvent({
      type: 'threads-changed',
      accountId: 'acc_1',
      threadIds: ['thr_1']
    });

    expect(keys).toEqual([
      ['mailbox-overview'],
      ['sync-status-detail'],
      ['folder-threads'],
      ['search-threads'],
      ['thread-messages'],
      ['message-detail']
    ]);
  });

  it('invalidates mailbox and thread queries when a snoozed thread wakes up', () => {
    const keys = getInvalidationKeysForDomainEvent({
      type: 'snooze-woke',
      accountId: 'acc_1',
      threadId: 'thr_1'
    });

    expect(keys).toEqual([
      ['mailbox-overview'],
      ['sync-status-detail'],
      ['folder-threads'],
      ['search-threads'],
      ['thread-messages'],
      ['message-detail']
    ]);
  });

  it('keeps sync status changes scoped to mailbox overview', () => {
    const keys = getInvalidationKeysForDomainEvent({
      type: 'sync-status-changed',
      accountId: 'acc_1',
      state: { kind: 'running' }
    });

    expect(keys).toEqual([['mailbox-overview'], ['sync-status-detail']]);
  });

  it('invalidates folder-derived queries when sync updates folders', () => {
    const keys = getInvalidationKeysForDomainEvent({
      type: 'folders-changed',
      accountId: 'acc_1'
    });

    expect(keys).toEqual([
      ['mailbox-overview'],
      ['sync-status-detail'],
      ['folder-threads'],
      ['search-threads']
    ]);
  });
});
