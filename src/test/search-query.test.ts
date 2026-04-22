import { describe, expect, it } from 'vitest';
import { matchesParsedSearchQuery, parseSearchQuery } from '@lib/search-query';
import type { ThreadRecord } from '@lib/contracts';

const now = '2026-04-22T12:00:00.000Z';

const thread = (overrides: Partial<ThreadRecord> = {}): ThreadRecord => ({
  id: 'thr_1',
  account_id: 'acc_1',
  subject: 'Project update',
  snippet: 'Alice shared the launch report',
  message_count: 1,
  participant_ids: ['alice@example.com', 'team@example.com'],
  folder_ids: ['inbox'],
  label_ids: [],
  has_attachments: true,
  is_unread: true,
  is_starred: false,
  last_message_at: '2026-04-20T10:00:00.000Z',
  last_message_sent_at: null,
  created_at: now,
  updated_at: now,
  ...overrides
});

describe('search query parser', () => {
  it('parses structured filters and free text terms', () => {
    expect(parseSearchQuery('from:alice subject:launch has:attachment after:2026-04-01 project update')).toEqual({
      after: '2026-04-01',
      before: null,
      from: ['alice'],
      hasAttachment: true,
      inFolder: null,
      isStarred: null,
      isUnread: null,
      subject: ['launch'],
      terms: ['project', 'update'],
      to: []
    });
  });

  it('matches thread records against structured filters', () => {
    expect(matchesParsedSearchQuery(thread(), parseSearchQuery('from:alice subject:project has:attachment is:unread after:2026-04-01'))).toBe(true);
    expect(matchesParsedSearchQuery(thread(), parseSearchQuery('from:bob'))).toBe(false);
    expect(matchesParsedSearchQuery(thread(), parseSearchQuery('is:starred'))).toBe(false);
    expect(matchesParsedSearchQuery(thread({ folder_ids: ['archive'] }), parseSearchQuery('in:inbox'))).toBe(false);
  });

  it('uses free text across subject, snippet, participants, and labels', () => {
    expect(matchesParsedSearchQuery(thread({ label_ids: ['design-review'] }), parseSearchQuery('design'))).toBe(true);
    expect(matchesParsedSearchQuery(thread(), parseSearchQuery('missing-term'))).toBe(false);
  });
});
