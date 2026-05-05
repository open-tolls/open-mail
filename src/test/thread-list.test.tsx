import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThreadListPanel } from '@components/layout/ThreadListPanel';
import { ThreadList } from '@components/thread-list/ThreadList';
import { filterThreads } from '@components/thread-list/threadListUtils';
import type { FolderRecord, ThreadSummary } from '@lib/contracts';

const folder = (id: string, name: string): FolderRecord => ({
  id,
  account_id: 'acc_demo',
  name,
  path: name,
  role: id,
  unread_count: 0,
  total_count: 1,
  created_at: '2026-03-13T10:00:00Z',
  updated_at: '2026-03-13T10:00:00Z'
});

const makeThread = (index: number, overrides: Partial<ThreadSummary> = {}): ThreadSummary => ({
  id: `thr_${index}`,
  subject: `Thread ${index}`,
  snippet: index % 2 === 0 ? 'Motion design review with attachment notes' : 'Rust health-check update',
  participants: [`sender${index}@example.com`],
  isUnread: index % 3 === 0,
  isStarred: index % 5 === 0,
  hasAttachments: index % 2 === 0,
  messageCount: 1,
  lastMessageAt: new Date(Date.now() - index * 60000).toISOString(),
  ...overrides
});

describe('ThreadList', () => {
  it('renders a virtualized window instead of every thread', () => {
    const threads = Array.from({ length: 10000 }, (_, index) => makeThread(index));

    render(
      <ThreadList
        activeFolderName="Inbox"
        isSearchActive={false}
        onSelectThread={vi.fn()}
        selectedThreadId="thr_0"
        threads={threads}
      />
    );

    expect(screen.getByLabelText('Thread list')).toBeInTheDocument();
    expect(screen.getByText('Thread 0')).toBeInTheDocument();
    expect(screen.queryByText('Thread 9999')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-thread-id]').length).toBeLessThan(40);
  });

  it('supports simple, meta, and shift selection', () => {
    const onSelectThread = vi.fn();
    const threads = Array.from({ length: 8 }, (_, index) => makeThread(index));

    render(
      <ThreadList
        activeFolderName="Inbox"
        isSearchActive={false}
        onSelectThread={onSelectThread}
        selectedThreadId="thr_0"
        threads={threads}
      />
    );

    fireEvent.click(screen.getByText('Thread 1'));
    expect(onSelectThread).toHaveBeenLastCalledWith('thr_1');
    expect(screen.getByLabelText('Thread selection actions')).toHaveTextContent('1 selected');

    fireEvent.click(screen.getByText('Thread 3'), { metaKey: true });
    expect(screen.getByLabelText('Thread selection actions')).toHaveTextContent('2 selected');

    fireEvent.click(screen.getByText('Thread 6'), { shiftKey: true });
    expect(screen.getByLabelText('Thread selection actions')).toHaveTextContent('4 selected');
  });

  it('reports quick actions for a single thread', () => {
    const onAction = vi.fn();

    render(
      <ThreadList
        activeFolderName="Inbox"
        isSearchActive={false}
        onAction={onAction}
        onSelectThread={vi.fn()}
        selectedThreadId="thr_0"
        threads={[makeThread(0)]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Archive thread' }));

    expect(onAction).toHaveBeenCalledWith('archive', ['thr_0']);
  });

  it('requests more threads when scrolled near the bottom', () => {
    const onLoadMore = vi.fn();
    const threads = Array.from({ length: 20 }, (_, index) => makeThread(index));

    render(
      <ThreadList
        activeFolderName="Inbox"
        hasMore
        isSearchActive={false}
        onLoadMore={onLoadMore}
        onSelectThread={vi.fn()}
        selectedThreadId="thr_0"
        threads={threads}
      />
    );

    const viewport = screen.getByLabelText('Thread list');
    Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 420 });
    Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 900 });

    fireEvent.scroll(viewport, { target: { scrollTop: 520 } });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('opens a context menu for a thread and runs actions', () => {
    const onAction = vi.fn();

    render(
      <ThreadList
        activeFolderName="Inbox"
        isSearchActive={false}
        onAction={onAction}
        onSelectThread={vi.fn()}
        selectedThreadId="thr_0"
        threads={[makeThread(0)]}
      />
    );

    fireEvent.contextMenu(screen.getByText('Thread 0'), { clientX: 120, clientY: 180 });
    expect(screen.getByRole('menu', { name: 'Thread context menu' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to trash' }));

    expect(onAction).toHaveBeenCalledWith('trash', ['thr_0']);
    expect(screen.queryByRole('menu', { name: 'Thread context menu' })).not.toBeInTheDocument();
  });

  it('filters threads by unread, starred, and attachments', () => {
    const threads = [
      makeThread(1, { isUnread: true, isStarred: false, hasAttachments: false }),
      makeThread(2, { isUnread: false, isStarred: true, hasAttachments: false }),
      makeThread(3, { isUnread: false, isStarred: false, hasAttachments: true })
    ];

    expect(filterThreads(threads, 'unread')).toHaveLength(1);
    expect(filterThreads(threads, 'starred')).toHaveLength(1);
    expect(filterThreads(threads, 'attachments')).toHaveLength(1);
    expect(filterThreads(threads, 'all')).toHaveLength(3);
  });

  it('opens a move dialog and reports the selected destination folder', () => {
    const onMoveThreads = vi.fn();

    render(
      <ThreadListPanel
        activeFolderId="fld_inbox"
        activeFolderName="Inbox"
        folders={[folder('fld_inbox', 'Inbox'), folder('fld_archive', 'Archive')]}
        isSearchActive={false}
        onMoveThreads={onMoveThreads}
        onSelectThread={vi.fn()}
        searchQuery=""
        selectedThreadId="thr_0"
        threads={[makeThread(0)]}
      />
    );

    fireEvent.click(screen.getByText('Thread 0'));
    fireEvent.click(screen.getByRole('button', { name: 'Move selected threads to folder' }));

    expect(screen.getByRole('dialog', { name: 'Move threads dialog' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(onMoveThreads).toHaveBeenCalledWith(['thr_0'], 'fld_archive');
    expect(screen.queryByRole('dialog', { name: 'Move threads dialog' })).not.toBeInTheDocument();
  });

  it('opens a label dialog and reports checked plus newly created labels', () => {
    const onApplyLabels = vi.fn();

    render(
      <ThreadListPanel
        activeFolderId="fld_inbox"
        activeFolderName="Inbox"
        folders={[folder('fld_inbox', 'Inbox')]}
        isSearchActive={false}
        labels={[
          { id: 'lbl_design', name: 'Design review' },
          { id: 'lbl_release', name: 'Release' }
        ]}
        onApplyLabels={onApplyLabels}
        onSelectThread={vi.fn()}
        searchQuery=""
        selectedThreadId="thr_0"
        threads={[makeThread(0)]}
      />
    );

    fireEvent.click(screen.getByText('Thread 0'));
    fireEvent.click(screen.getByRole('button', { name: 'Label selected threads' }));
    fireEvent.click(screen.getByLabelText('Design review'));
    fireEvent.change(screen.getByLabelText('Create label'), { target: { value: 'VIP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply labels' }));

    expect(onApplyLabels).toHaveBeenCalledWith(['thr_0'], ['lbl_design', 'custom:vip']);
    expect(screen.queryByRole('dialog', { name: 'Label threads dialog' })).not.toBeInTheDocument();
  });

  it('opens a snooze dialog and reports the selected preset', () => {
    const onSnoozeThreads = vi.fn();

    render(
      <ThreadListPanel
        activeFolderId="fld_inbox"
        activeFolderName="Inbox"
        folders={[folder('fld_inbox', 'Inbox')]}
        isSearchActive={false}
        onSnoozeThreads={onSnoozeThreads}
        onSelectThread={vi.fn()}
        searchQuery=""
        selectedThreadId="thr_0"
        threads={[makeThread(0)]}
      />
    );

    fireEvent.click(screen.getByText('Thread 0'));
    fireEvent.click(screen.getByRole('button', { name: 'Snooze selected threads' }));

    expect(screen.getByRole('dialog', { name: 'Snooze threads dialog' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Later today' }));

    expect(onSnoozeThreads).toHaveBeenCalledTimes(1);
    expect(onSnoozeThreads.mock.calls[0]?.[0]).toEqual(['thr_0']);
    expect(typeof onSnoozeThreads.mock.calls[0]?.[1]).toBe('string');
    expect(screen.queryByRole('dialog', { name: 'Snooze threads dialog' })).not.toBeInTheDocument();
  });

  it('shows unsnooze actions inside the snoozed folder', () => {
    const onUnsnoozeThreads = vi.fn();

    render(
      <ThreadListPanel
        activeFolderId="fld_snoozed"
        activeFolderName="Snoozed"
        folders={[folder('fld_snoozed', 'Snoozed')]}
        isSearchActive={false}
        onSelectThread={vi.fn()}
        onUnsnoozeThreads={onUnsnoozeThreads}
        searchQuery=""
        selectedThreadId="thr_0"
        threads={[makeThread(0)]}
      />
    );

    fireEvent.click(screen.getByText('Thread 0'));
    fireEvent.click(screen.getByRole('button', { name: 'Unsnooze selected threads' }));

    expect(onUnsnoozeThreads).toHaveBeenCalledWith(['thr_0']);
  });

  it('shows cancel reminder actions inside the reminders folder', () => {
    const onCancelReminders = vi.fn();

    render(
      <ThreadListPanel
        activeFolderId="fld_reminders"
        activeFolderName="Reminders"
        folders={[folder('fld_reminders', 'Reminders')]}
        isReminderFolder
        isSearchActive={false}
        onCancelReminders={onCancelReminders}
        onSelectThread={vi.fn()}
        searchQuery=""
        selectedThreadId="thr_0"
        threads={[makeThread(0)]}
      />
    );

    fireEvent.click(screen.getByText('Thread 0'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel selected reminders' }));

    expect(onCancelReminders).toHaveBeenCalledWith(['thr_0']);
  });
});
