import { describe, expect, it, vi } from 'vitest';
import { autoMarkVisibleMessagesRead } from '@lib/auto-mark-read';
import type { MessageRecord } from '@lib/contracts';

const message = (id: string, isUnread: boolean): MessageRecord => ({
  id,
  account_id: 'acc_demo',
  thread_id: 'thr_1',
  from: [],
  to: [],
  cc: [],
  bcc: [],
  reply_to: [],
  subject: 'Subject',
  snippet: 'Snippet',
  body: '<p>Body</p>',
  plain_text: 'Body',
  message_id_header: `<${id}@openmail.dev>`,
  in_reply_to: null,
  references: [],
  folder_id: 'fld_inbox',
  label_ids: [],
  is_unread: isUnread,
  is_starred: false,
  is_draft: false,
  date: '2026-03-13T10:00:00Z',
  attachments: [],
  headers: {},
  created_at: '2026-03-13T10:00:00Z',
  updated_at: '2026-03-13T10:00:00Z'
});

describe('autoMarkVisibleMessagesRead', () => {
  it('marks only visible unread messages in the desktop runtime', async () => {
    const markRead = vi.fn().mockResolvedValue(['msg_unread']);

    const result = await autoMarkVisibleMessagesRead([message('msg_unread', true), message('msg_read', false)], {
      isDesktopRuntime: true,
      markRead
    });

    expect(result).toEqual(['msg_unread']);
    expect(markRead).toHaveBeenCalledWith(['msg_unread']);
  });

  it('skips the command when no visible messages are unread', async () => {
    const markRead = vi.fn();

    const result = await autoMarkVisibleMessagesRead([message('msg_read', false)], {
      isDesktopRuntime: true,
      markRead
    });

    expect(result).toEqual([]);
    expect(markRead).not.toHaveBeenCalled();
  });

  it('skips the command outside the desktop runtime', async () => {
    const markRead = vi.fn();

    const result = await autoMarkVisibleMessagesRead([message('msg_unread', true)], {
      isDesktopRuntime: false,
      markRead
    });

    expect(result).toEqual([]);
    expect(markRead).not.toHaveBeenCalled();
  });
});
