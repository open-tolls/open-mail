import { describe, expect, it } from 'vitest';
import type { FolderRecord, MessageRecord } from '@lib/contracts';
import {
  isWithinQuietHours,
  readNotificationTarget,
  shouldNotifyMessage,
  toNotificationRouteSegment,
  toNotificationBody,
  toNotificationTarget,
  toNotificationTitle
} from '@lib/desktop-notifications';

const inboxFolder: FolderRecord = {
  id: 'fld_inbox',
  account_id: 'acc_demo',
  name: 'Inbox',
  path: 'INBOX',
  role: 'inbox',
  unread_count: 1,
  total_count: 1,
  created_at: '2026-03-13T10:00:00Z',
  updated_at: '2026-03-13T10:00:00Z'
};

const sentFolder: FolderRecord = {
  ...inboxFolder,
  id: 'fld_sent',
  name: 'Sent',
  path: 'Sent',
  role: 'sent'
};

const sampleMessage: MessageRecord = {
  id: 'msg_1',
  account_id: 'acc_demo',
  thread_id: 'thr_1',
  from: [
    {
      id: 'contact_1',
      account_id: 'acc_demo',
      name: 'Infra',
      email: 'infra@example.com',
      is_me: false,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    }
  ],
  to: [],
  cc: [],
  bcc: [],
  reply_to: [],
  subject: 'New sync',
  snippet: 'Fresh mailbox payload',
  body: '<p>Fresh mailbox payload</p>',
  plain_text: 'Fresh mailbox payload',
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
};

describe('desktop notifications helpers', () => {
  it('matches quiet hours inside a same-day interval', () => {
    expect(isWithinQuietHours(new Date('2026-03-13T22:30:00'), '22:00', '23:00')).toBe(true);
    expect(isWithinQuietHours(new Date('2026-03-13T21:30:00'), '22:00', '23:00')).toBe(false);
  });

  it('matches quiet hours across midnight', () => {
    expect(isWithinQuietHours(new Date('2026-03-13T23:30:00'), '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(new Date('2026-03-13T06:30:00'), '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(new Date('2026-03-13T12:30:00'), '22:00', '07:00')).toBe(false);
  });

  it('respects inbox-only scope for desktop notifications', () => {
    expect(shouldNotifyMessage(sampleMessage, [inboxFolder, sentFolder], 'inbox')).toBe(true);
    expect(
      shouldNotifyMessage({ ...sampleMessage, folder_id: 'fld_sent' }, [inboxFolder, sentFolder], 'inbox')
    ).toBe(false);
    expect(
      shouldNotifyMessage({ ...sampleMessage, folder_id: 'fld_sent' }, [inboxFolder, sentFolder], 'all')
    ).toBe(true);
  });

  it('builds notification copy from sender and snippet', () => {
    expect(toNotificationTitle(sampleMessage)).toBe('Infra');
    expect(toNotificationBody(sampleMessage)).toBe('Fresh mailbox payload');
  });

  it('serializes the notification target used to reopen the message', () => {
    expect(toNotificationTarget(sampleMessage, [inboxFolder, sentFolder])).toEqual({
      accountId: 'acc_demo',
      threadId: 'thr_1',
      folderId: 'fld_inbox',
      folderRole: 'inbox'
    });
  });

  it('restores the notification target from plugin extras', () => {
    const target = readNotificationTarget({
      accountId: 'acc_demo',
      threadId: 'thr_1',
      folderId: 'fld_inbox',
      folderRole: 'inbox'
    });

    expect(target).toEqual({
      accountId: 'acc_demo',
      threadId: 'thr_1',
      folderId: 'fld_inbox',
      folderRole: 'inbox'
    });
    expect(toNotificationRouteSegment(target!)).toBe('inbox');
    expect(readNotificationTarget({ threadId: 'thr_1' })).toBeNull();
  });
});
