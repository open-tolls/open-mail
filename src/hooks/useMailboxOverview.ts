import { useQuery } from '@tanstack/react-query';
import type { MailboxReadModel, MailboxOverview, ThreadSummary } from '@lib/contracts';
import { api, tauriRuntime } from '@lib/tauri-bridge';

const fallbackOverview: MailboxOverview = {
  account_id: 'acc_demo',
  sync_state: { kind: 'running' },
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
      id: 'fld_sent',
      account_id: 'acc_demo',
      name: 'Sent',
      path: 'Sent',
      role: 'sent',
      unread_count: 0,
      total_count: 42,
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    }
  ],
  threads: [
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
      folder_ids: ['fld_inbox'],
      label_ids: [],
      has_attachments: false,
      is_unread: false,
      is_starred: true,
      last_message_at: '2026-03-13T09:28:00Z',
      last_message_sent_at: '2026-03-13T09:28:00Z',
      created_at: '2026-03-13T10:00:00Z',
      updated_at: '2026-03-13T10:00:00Z'
    }
  ]
};

const toThreadSummary = (overview: MailboxOverview): ThreadSummary[] =>
  overview.threads.map((thread) => ({
    id: thread.id,
    subject: thread.subject,
    snippet: thread.snippet,
    participants: thread.participant_ids,
    isUnread: thread.is_unread,
    isStarred: thread.is_starred,
    lastMessageAt: thread.last_message_at
  }));

const toMailboxReadModel = (overview: MailboxOverview): MailboxReadModel => ({
  activeFolder:
    overview.folders.find((folder) => folder.role === 'inbox')?.id ?? overview.folders[0]?.id ?? 'fld_inbox',
  syncState: overview.sync_state,
  folders: overview.folders,
  threads: toThreadSummary(overview)
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

