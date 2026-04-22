import { afterEach, describe, expect, it } from 'vitest';
import { useAccountStore } from '@stores/useAccountStore';
import { useDraftStore, type DraftRecord } from '@stores/useDraftStore';
import { useFolderStore } from '@stores/useFolderStore';
import { useMessageStore } from '@stores/useMessageStore';
import { useSearchStore } from '@stores/useSearchStore';
import { useSyncStore } from '@stores/useSyncStore';
import { useThreadStore } from '@stores/useThreadStore';
import type { FolderRecord, MessageRecord, SyncStatusDetail, ThreadRecord, ThreadSummary } from '@lib/contracts';

const now = '2026-04-17T12:00:00.000Z';

const folder = (id: string, unread_count = 0): FolderRecord => ({
  id,
  account_id: 'acc_1',
  name: id,
  path: id,
  role: id,
  unread_count,
  total_count: unread_count,
  created_at: now,
  updated_at: now
});

const threadSummary = (id: string, isStarred = false): ThreadSummary => ({
  id,
  subject: id,
  snippet: `${id} snippet`,
  participants: ['team@example.com'],
  isUnread: false,
  isStarred,
  hasAttachments: false,
  messageCount: 1,
  lastMessageAt: now
});

const threadRecord = (id: string, is_starred = false): ThreadRecord => ({
  id,
  account_id: 'acc_1',
  subject: id,
  snippet: `${id} snippet`,
  message_count: 1,
  participant_ids: [],
  folder_ids: ['inbox'],
  label_ids: [],
  has_attachments: false,
  is_unread: false,
  is_starred,
  last_message_at: now,
  last_message_sent_at: null,
  created_at: now,
  updated_at: now
});

const message = (id: string, thread_id = 'thr_1'): MessageRecord => ({
  id,
  account_id: 'acc_1',
  thread_id,
  from: [],
  to: [],
  cc: [],
  bcc: [],
  reply_to: [],
  subject: id,
  snippet: `${id} snippet`,
  body: '<p>Hello</p>',
  plain_text: 'Hello',
  message_id_header: `<${id}@example.com>`,
  in_reply_to: null,
  references: [],
  folder_id: 'inbox',
  label_ids: [],
  is_unread: false,
  is_starred: false,
  is_draft: false,
  date: now,
  attachments: [],
  headers: {},
  created_at: now,
  updated_at: now
});

const draft = (id: string): DraftRecord => ({
  id,
  accountId: 'acc_1',
  to: [{ name: null, email: 'team@example.com' }],
  subject: id,
  body: 'Hello',
  updatedAt: now
});

const syncStatus: SyncStatusDetail = {
  state: { kind: 'running' },
  phase: 'idling',
  folders: [],
  foldersSynced: 1,
  messagesObserved: 2,
  messagesFlagged: 0,
  messagesDeleted: 0,
  lastSyncStartedAt: now,
  lastSyncFinishedAt: null,
  lastError: null
};

describe('phase 3 domain stores', () => {
  afterEach(() => {
    useAccountStore.setState({ accounts: [], selectedAccountId: null });
    useFolderStore.setState({ folders: [], selectedFolderId: null });
    useThreadStore.setState({
      activeFolderKey: null,
      hasMore: false,
      hasMoreByFolderKey: {},
      isLoading: false,
      offset: 0,
      offsetByFolderKey: {},
      threadRecords: [],
      threads: [],
      threadsByFolderKey: {},
      threadSummaries: [],
      selectedThreadId: null
    });
    useMessageStore.setState({ messagesByThreadId: {}, selectedMessageId: null });
    useDraftStore.setState({ drafts: [], activeDraftId: null });
    useSyncStore.setState({ syncByAccountId: {}, lastEventState: { kind: 'not-started' } });
    useSearchStore.setState({ query: '', results: [], isSearching: false });
  });

  it('manages account selection while upserting and removing accounts', () => {
    useAccountStore.getState().upsertAccount({
      id: 'acc_1',
      provider: 'Gmail',
      email: 'team@example.com',
      displayName: 'Team'
    });

    expect(useAccountStore.getState().selectedAccountId).toBe('acc_1');

    useAccountStore.getState().removeAccount('acc_1');
    expect(useAccountStore.getState().accounts).toHaveLength(0);
    expect(useAccountStore.getState().selectedAccountId).toBeNull();
  });

  it('keeps folder selection valid and clamps unread counts', () => {
    useFolderStore.getState().setFolders([folder('inbox', 2), folder('sent')]);
    useFolderStore.getState().selectFolder('sent');
    useFolderStore.getState().updateUnreadCount('sent', -5);

    expect(useFolderStore.getState().selectedFolderId).toBe('sent');
    expect(useFolderStore.getState().folders.find((item) => item.id === 'sent')?.unread_count).toBe(0);
  });

  it('tracks thread summaries and records together for star state', () => {
    useThreadStore.getState().setThreadSummaries([threadSummary('thr_1')]);
    useThreadStore.getState().setThreadRecords([threadRecord('thr_1')]);
    useThreadStore.getState().toggleStarred('thr_1');

    expect(useThreadStore.getState().threadSummaries[0]?.isStarred).toBe(true);
    expect(useThreadStore.getState().threadRecords[0]?.is_starred).toBe(true);
  });

  it('applies thread actions across summaries, records, and folder caches', () => {
    useThreadStore.getState().setThreadSummaries([
      { ...threadSummary('thr_1'), isUnread: true },
      threadSummary('thr_2')
    ]);
    useThreadStore.getState().setThreadRecords([
      { ...threadRecord('thr_1'), is_unread: true },
      threadRecord('thr_2')
    ]);
    useThreadStore.setState({
      activeFolderKey: 'acc_1:inbox',
      threadsByFolderKey: {
        'acc_1:inbox': [{ ...threadSummary('thr_1'), isUnread: true }, threadSummary('thr_2')]
      }
    });

    useThreadStore.getState().applyThreadAction('star', ['thr_1']);
    expect(useThreadStore.getState().threadSummaries[0]?.isStarred).toBe(true);
    expect(useThreadStore.getState().threadRecords[0]?.is_starred).toBe(true);

    useThreadStore.getState().applyThreadAction('toggle-read', ['thr_1', 'thr_2']);
    expect(useThreadStore.getState().threadSummaries.map((thread) => thread.isUnread)).toEqual([false, false]);
    expect(useThreadStore.getState().threadRecords.map((thread) => thread.is_unread)).toEqual([false, false]);

    useThreadStore.getState().applyThreadAction('archive', ['thr_1']);
    expect(useThreadStore.getState().threadSummaries.map((thread) => thread.id)).toEqual(['thr_2']);
    expect(useThreadStore.getState().threadRecords.map((thread) => thread.id)).toEqual(['thr_2']);
    expect(useThreadStore.getState().threadsByFolderKey['acc_1:inbox']?.map((thread) => thread.id)).toEqual(['thr_2']);
  });

  it('moves threads between folder caches optimistically', () => {
    useThreadStore.getState().setThreadSummaries([threadSummary('thr_1'), threadSummary('thr_2')]);
    useThreadStore.getState().setThreadRecords([threadRecord('thr_1'), threadRecord('thr_2')]);
    useThreadStore.setState({
      activeFolderKey: 'acc_1:inbox',
      threads: [threadSummary('thr_1'), threadSummary('thr_2')],
      threadsByFolderKey: {
        'acc_1:inbox': [threadSummary('thr_1'), threadSummary('thr_2')],
        'acc_1:archive': []
      },
      selectedThreadId: 'thr_1'
    });

    useThreadStore.getState().moveThreadsToFolder(['thr_1'], 'archive');

    expect(useThreadStore.getState().threads.map((thread) => thread.id)).toEqual(['thr_2']);
    expect(useThreadStore.getState().selectedThreadId).toBe('thr_2');
    expect(useThreadStore.getState().threadRecords[0]?.folder_ids).toEqual(['archive']);
    expect(useThreadStore.getState().threadsByFolderKey['acc_1:archive']?.map((thread) => thread.id)).toEqual(['thr_1']);
  });

  it('restores an optimistic thread snapshot for undo', () => {
    useThreadStore.getState().setThreadSummaries([threadSummary('thr_1'), threadSummary('thr_2')]);
    useThreadStore.getState().setThreadRecords([threadRecord('thr_1'), threadRecord('thr_2')]);
    useThreadStore.setState({
      activeFolderKey: 'acc_1:inbox',
      threads: [threadSummary('thr_1'), threadSummary('thr_2')],
      threadsByFolderKey: {
        'acc_1:inbox': [threadSummary('thr_1'), threadSummary('thr_2')]
      },
      selectedThreadId: 'thr_1'
    });
    const snapshot = useThreadStore.getState().createThreadSnapshot();

    useThreadStore.getState().applyThreadAction('archive', ['thr_1']);
    useThreadStore.getState().restoreThreadSnapshot(snapshot);

    expect(useThreadStore.getState().threads.map((thread) => thread.id)).toEqual(['thr_1', 'thr_2']);
    expect(useThreadStore.getState().threadRecords.map((thread) => thread.id)).toEqual(['thr_1', 'thr_2']);
    expect(useThreadStore.getState().selectedThreadId).toBe('thr_1');
  });

  it('applies label ids to thread records optimistically', () => {
    useThreadStore.getState().setThreadRecords([
      { ...threadRecord('thr_1'), label_ids: ['lbl_existing'] },
      threadRecord('thr_2')
    ]);

    useThreadStore.getState().applyThreadLabels(['thr_1'], ['lbl_existing', 'lbl_design']);

    expect(useThreadStore.getState().threadRecords[0]?.label_ids).toEqual(['lbl_existing', 'lbl_design']);
    expect(useThreadStore.getState().threadRecords[1]?.label_ids).toEqual([]);
  });

  it('fetches paginated folder threads from fallback records and caches by folder', async () => {
    const records = Array.from({ length: 75 }, (_, index) => threadRecord(`thr_${index}`));

    await useThreadStore.getState().fetchThreads('acc_1', 'inbox', records);

    expect(useThreadStore.getState().threads).toHaveLength(50);
    expect(useThreadStore.getState().hasMore).toBe(true);
    expect(useThreadStore.getState().offset).toBe(50);

    await useThreadStore.getState().fetchMore('acc_1', 'inbox', records);

    expect(useThreadStore.getState().threads).toHaveLength(75);
    expect(useThreadStore.getState().hasMore).toBe(false);

    useThreadStore.getState().setThreadSummaries([]);
    await useThreadStore.getState().fetchThreads('acc_1', 'inbox', records);

    expect(useThreadStore.getState().threads).toHaveLength(75);
  });

  it('stores messages per thread and clears them', () => {
    useMessageStore.getState().setThreadMessages('thr_1', [message('msg_1')]);

    expect(useMessageStore.getState().selectedMessageId).toBe('msg_1');
    expect(useMessageStore.getState().messagesByThreadId.thr_1).toHaveLength(1);

    useMessageStore.getState().clearMessages();
    expect(useMessageStore.getState().selectedMessageId).toBeNull();
  });

  it('edits drafts and removes the active draft safely', () => {
    useDraftStore.getState().editDraft(draft('draft_1'));
    useDraftStore.getState().editDraft({ ...draft('draft_1'), subject: 'Updated' });

    expect(useDraftStore.getState().drafts).toHaveLength(1);
    expect(useDraftStore.getState().drafts[0]?.subject).toBe('Updated');

    useDraftStore.getState().removeDraft('draft_1');
    expect(useDraftStore.getState().activeDraftId).toBeNull();
  });

  it('tracks sync status by account and search results', () => {
    useSyncStore.getState().setSyncStatus('acc_1', syncStatus);
    useSearchStore.getState().setQuery('rust');
    useSearchStore.getState().setSearching(true);
    useSearchStore.getState().setResults([threadSummary('thr_1')]);

    expect(useSyncStore.getState().syncByAccountId.acc_1?.phase).toBe('idling');
    expect(useSyncStore.getState().lastEventState).toEqual({ kind: 'running' });
    expect(useSearchStore.getState().query).toBe('rust');
    expect(useSearchStore.getState().isSearching).toBe(false);
  });
});
