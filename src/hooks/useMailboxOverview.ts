import { useQuery } from '@tanstack/react-query';
import type { MailboxReadModel, MailboxOverview, ThreadRecord, ThreadSummary } from '@lib/contracts';
import { api, tauriRuntime } from '@lib/tauri-bridge';

export const fallbackThreadRecords: ThreadRecord[] = [
  {
    id: 'thr_1',
    account_id: 'acc_demo',
    subject: 'Premium motion system approved',
    snippet: 'Vamos fechar a base visual do composer e da thread list hoje.',
    message_count: 3,
    participant_ids: ['atlas@example.com'],
    folder_ids: ['fld_inbox'],
    label_ids: [],
    has_attachments: true,
    is_unread: true,
    is_starred: false,
    last_message_at: '2026-03-13T10:00:00Z',
    last_message_sent_at: '2026-03-13T10:00:00Z',
    created_at: '2026-03-13T10:00:00Z',
    updated_at: '2026-03-13T10:00:00Z'
  },
  {
    id: 'thr_2',
    account_id: 'acc_demo',
    subject: 'Rust health-check online',
    snippet: 'IPC inicial respondeu sem erro e o shell já consegue refletir o estado.',
    message_count: 2,
    participant_ids: ['infra@example.com'],
    folder_ids: ['fld_inbox', 'fld_starred'],
    label_ids: [],
    has_attachments: false,
    is_unread: false,
    is_starred: true,
    last_message_at: '2026-03-13T09:28:00Z',
    last_message_sent_at: '2026-03-13T09:28:00Z',
    created_at: '2026-03-13T10:00:00Z',
    updated_at: '2026-03-13T10:00:00Z'
  },
  {
    id: 'thr_3',
    account_id: 'acc_demo',
    subject: 'Ship notes for desktop alpha',
    snippet: 'Build desktop alpha aprovado, agora seguimos com pacote de release.',
    message_count: 1,
    participant_ids: ['release@example.com'],
    folder_ids: ['fld_sent'],
    label_ids: [],
    has_attachments: false,
    is_unread: false,
    is_starred: false,
    last_message_at: '2026-03-13T07:00:00Z',
    last_message_sent_at: '2026-03-13T07:00:00Z',
    created_at: '2026-03-13T10:00:00Z',
    updated_at: '2026-03-13T10:00:00Z'
  },
  {
    id: 'thr_4',
    account_id: 'acc_ops',
    subject: 'Operations rollout ready',
    snippet: 'Second account is online and ready for the unified inbox pass.',
    message_count: 2,
    participant_ids: ['ops@example.com'],
    folder_ids: ['fld_ops_inbox'],
    label_ids: [],
    has_attachments: false,
    is_unread: true,
    is_starred: false,
    last_message_at: '2026-03-13T11:15:00Z',
    last_message_sent_at: '2026-03-13T11:15:00Z',
    created_at: '2026-03-13T11:15:00Z',
    updated_at: '2026-03-13T11:15:00Z'
  }
];

const fallbackThreads: ThreadSummary[] = fallbackThreadRecords.map((thread) => ({
  id: thread.id,
  subject: thread.subject,
  snippet: thread.snippet,
  participants: thread.participant_ids,
  isUnread: thread.is_unread,
  isStarred: thread.is_starred,
  hasAttachments: thread.has_attachments,
  messageCount: thread.message_count,
  lastMessageAt: thread.last_message_at
}));

const fallbackOverview: MailboxOverview = {
  accountId: 'acc_demo',
  activeFolderId: 'fld_inbox',
  syncState: { kind: 'running' },
  folders: [
    {
      id: 'fld_inbox',
      account_id: 'acc_demo',
      name: 'Inbox',
      path: 'INBOX',
      role: 'inbox',
      unread_count: 2,
      total_count: 12,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    },
    {
      id: 'fld_starred',
      account_id: 'acc_demo',
      name: 'Starred',
      path: 'Starred',
      role: 'starred',
      unread_count: 0,
      total_count: 3,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    },
    {
      id: 'fld_important',
      account_id: 'acc_demo',
      name: 'Important',
      path: 'Important',
      role: 'important',
      unread_count: 0,
      total_count: 2,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    },
    {
      id: 'fld_drafts',
      account_id: 'acc_demo',
      name: 'Drafts',
      path: 'Drafts',
      role: 'drafts',
      unread_count: 0,
      total_count: 0,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    },
    {
      id: 'fld_sent',
      account_id: 'acc_demo',
      name: 'Sent',
      path: 'Sent',
      role: 'sent',
      unread_count: 0,
      total_count: 42,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    },
    {
      id: 'fld_spam',
      account_id: 'acc_demo',
      name: 'Spam',
      path: 'Spam',
      role: 'spam',
      unread_count: 0,
      total_count: 0,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    },
    {
      id: 'fld_trash',
      account_id: 'acc_demo',
      name: 'Trash',
      path: 'Trash',
      role: 'trash',
      unread_count: 0,
      total_count: 0,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    },
    {
      id: 'fld_archive',
      account_id: 'acc_demo',
      name: 'Archive',
      path: 'Archive',
      role: 'archive',
      unread_count: 0,
      total_count: 0,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    }
  ],
  threads: fallbackThreads
};

const toMailboxReadModel = (overview: MailboxOverview): MailboxReadModel => ({
  accountId: overview.accountId,
  activeFolder: overview.activeFolderId,
  syncState: overview.syncState,
  folders: overview.folders,
  threads: overview.threads,
  allThreads: tauriRuntime.isAvailable() ? [] : fallbackThreadRecords
});

export const useMailboxOverview = () =>
  useQuery({
    queryKey: ['mailbox-overview'],
    queryFn: async () => {
      if (!tauriRuntime.isAvailable()) {
        return toMailboxReadModel(fallbackOverview);
      }

      const overview = await api.mailbox.overview();
      return toMailboxReadModel(overview);
    }
  });
