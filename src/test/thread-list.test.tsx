import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThreadList } from '@components/thread-list/ThreadList';
import { filterThreads } from '@components/thread-list/threadListUtils';
import type { ThreadSummary } from '@lib/contracts';

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
});
