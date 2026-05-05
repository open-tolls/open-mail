import { describe, expect, it } from 'vitest';
import { buildContactDirectory, searchContacts, toThreadLikeRecords } from '@lib/contacts-directory';
import type { MessageRecord, ThreadSummary } from '@lib/contracts';

const threadSummaries: ThreadSummary[] = [
  {
    id: 'thr_1',
    subject: 'Premium motion system approved',
    snippet: 'Vamos fechar a base visual do composer e da thread list hoje.',
    participants: ['atlas@example.com'],
    isUnread: true,
    isStarred: false,
    hasAttachments: true,
    messageCount: 3,
    lastMessageAt: '2026-03-13T10:00:00Z'
  }
];

const messages: Record<string, MessageRecord[]> = {
  thr_1: [
    {
      id: 'msg_1',
      account_id: 'acc_demo',
      thread_id: 'thr_1',
      from: [
        {
          id: 'ct_atlas',
          account_id: 'acc_demo',
          name: 'Atlas Design',
          email: 'atlas@example.com',
          is_me: false,
          created_at: '2026-03-13T10:00:00Z',
          updated_at: '2026-03-13T10:00:00Z'
        }
      ],
      to: [],
      cc: [],
      bcc: [],
      reply_to: [],
      subject: 'Premium motion system approved',
      snippet: 'Snippet',
      body: '<p>Snippet</p>',
      plain_text: 'Snippet',
      message_id_header: '<msg_1@example.com>',
      in_reply_to: null,
      references: [],
      folder_id: 'fld_inbox',
      label_ids: [],
      is_unread: true,
      is_starred: false,
      is_draft: false,
      date: '2026-03-13T10:00:00Z',
      attachments: [],
      headers: {},
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    }
  ]
};

describe('contacts directory', () => {
  it('builds contacts from threads and message contacts', () => {
    const contacts = buildContactDirectory(toThreadLikeRecords('acc_demo', threadSummaries), messages);

    expect(contacts[0]).toEqual(
      expect.objectContaining({
        email: 'atlas@example.com',
        name: 'Atlas Design',
        emailCount: 1
      })
    );
    expect(contacts[0]?.threads[0]?.subject).toBe('Premium motion system approved');
  });

  it('searches contacts by email or name', () => {
    const contacts = buildContactDirectory(toThreadLikeRecords('acc_demo', threadSummaries), messages);

    expect(searchContacts(contacts, 'atlas')).toHaveLength(1);
    expect(searchContacts(contacts, 'missing')).toHaveLength(0);
  });
});
