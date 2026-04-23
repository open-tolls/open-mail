import { describe, expect, it } from 'vitest';
import { prepareForwardDraft, prepareReplyDraft } from '@lib/compose-utils';
import type { ContactRecord, MessageRecord } from '@lib/contracts';

const contact = (email: string, options?: Partial<ContactRecord>): ContactRecord => ({
  id: options?.id ?? email,
  account_id: 'acc_demo',
  name: options?.name ?? null,
  email,
  is_me: options?.is_me ?? false,
  created_at: '2026-03-13T10:00:00Z',
  updated_at: '2026-03-13T10:00:00Z'
});

const message = (overrides?: Partial<MessageRecord>): MessageRecord => ({
  id: 'msg_1',
  account_id: 'acc_demo',
  thread_id: 'thr_1',
  from: [contact('atlas@example.com', { name: 'Atlas Design' })],
  to: [contact('leco@example.com', { is_me: true, name: 'Leco' })],
  cc: [],
  bcc: [],
  reply_to: [],
  subject: 'Premium motion system approved',
  snippet: 'Vamos fechar a base visual do composer.',
  body: '<p>Vamos fechar a base visual do composer.</p>',
  plain_text: 'Vamos fechar a base visual do composer.',
  message_id_header: '<msg_1@openmail.dev>',
  in_reply_to: null,
  references: ['<root@openmail.dev>'],
  folder_id: 'fld_inbox',
  label_ids: [],
  is_unread: true,
  is_starred: false,
  is_draft: false,
  date: '2026-03-13T10:00:00Z',
  attachments: [],
  headers: {},
  created_at: '2026-03-13T10:00:00Z',
  updated_at: '2026-03-13T10:00:00Z',
  ...overrides
});

describe('prepareReplyDraft', () => {
  it('prepares a reply with subject, recipient, quoted body, and headers', () => {
    const draft = prepareReplyDraft(message(), false);

    expect(draft.to).toEqual(['atlas@example.com']);
    expect(draft.cc).toEqual([]);
    expect(draft.subject).toBe('Re: Premium motion system approved');
    expect(draft.inReplyTo).toBe('<msg_1@openmail.dev>');
    expect(draft.references).toEqual(['<root@openmail.dev>', '<msg_1@openmail.dev>']);
    expect(draft.body).toContain('Atlas Design <atlas@example.com> wrote:');
    expect(draft.body).toContain('<blockquote');
  });

  it('prepares reply all without including me or duplicate recipients', () => {
    const draft = prepareReplyDraft(
      message({
        to: [
          contact('leco@example.com', { is_me: true, name: 'Leco' }),
          contact('ops@example.com', { name: 'Ops' })
        ],
        cc: [
          contact('design@example.com', { name: 'Design' }),
          contact('ops@example.com', { name: 'Ops' })
        ]
      }),
      true
    );

    expect(draft.to).toEqual(['atlas@example.com', 'ops@example.com']);
    expect(draft.cc).toEqual(['design@example.com', 'ops@example.com']);
  });
});

describe('prepareForwardDraft', () => {
  it('prepares a forward with prefixed subject and forwarded content block', () => {
    const draft = prepareForwardDraft(
      message({
        cc: [contact('review@example.com', { name: 'Review' })]
      })
    );

    expect(draft.to).toEqual([]);
    expect(draft.cc).toEqual([]);
    expect(draft.subject).toBe('Fwd: Premium motion system approved');
    expect(draft.inReplyTo).toBeNull();
    expect(draft.references).toEqual([]);
    expect(draft.body).toContain('Forwarded message');
    expect(draft.body).toContain('Atlas Design <atlas@example.com>');
    expect(draft.body).toContain('review@example.com');
    expect(draft.body).toContain('Vamos fechar a base visual do composer.');
  });
});
