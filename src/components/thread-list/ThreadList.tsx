import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThreadSummary } from '@lib/contracts';
import { ThreadListEmpty } from '@components/thread-list/ThreadListEmpty';
import { ThreadListItem, type ThreadSelectEvent } from '@components/thread-list/ThreadListItem';
import { ThreadListLoading } from '@components/thread-list/ThreadListLoading';
import { type ThreadAction, ThreadListToolbar } from '@components/thread-list/ThreadListToolbar';
import { THREAD_ROW_HEIGHT } from '@components/thread-list/threadListUtils';

type ThreadListProps = {
  activeFolderName: string | null;
  isLoading?: boolean;
  isSearchActive: boolean;
  selectedThreadId: string | null;
  threads: ThreadSummary[];
  onAction?: (action: ThreadAction, threadIds: string[]) => void;
  onSelectThread: (threadId: string) => void;
};

const getVisibleWindow = (scrollTop: number, viewportHeight: number, itemCount: number) => {
  const visibleCount = Math.ceil(Math.max(viewportHeight, 640) / THREAD_ROW_HEIGHT);
  const startIndex = Math.max(0, Math.floor(scrollTop / THREAD_ROW_HEIGHT) - 4);
  const endIndex = Math.min(itemCount, startIndex + visibleCount + 8);

  return { startIndex, endIndex };
};

export const ThreadList = ({
  activeFolderName,
  isLoading = false,
  isSearchActive,
  selectedThreadId,
  threads,
  onAction,
  onSelectThread
}: ThreadListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const { startIndex, endIndex } = getVisibleWindow(scrollTop, viewportHeight, threads.length);
  const visibleThreads = useMemo(
    () => threads.slice(startIndex, endIndex),
    [endIndex, startIndex, threads]
  );

  useEffect(() => {
    const updateViewport = () => {
      setViewportHeight(parentRef.current?.clientHeight || 640);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    setSelectedIds((current) => {
      const validThreadIds = new Set(threads.map((thread) => thread.id));
      return new Set([...current].filter((threadId) => validThreadIds.has(threadId)));
    });
  }, [threads]);

  const handleSelect = (threadId: string, event: ThreadSelectEvent) => {
    const threadIndex = threads.findIndex((thread) => thread.id === threadId);

    if (event.shiftKey && lastSelectedIndex !== null && threadIndex >= 0) {
      const start = Math.min(lastSelectedIndex, threadIndex);
      const end = Math.max(lastSelectedIndex, threadIndex);
      const rangeIds = threads.slice(start, end + 1).map((thread) => thread.id);
      setSelectedIds(new Set(rangeIds));
    } else if (event.metaKey || event.ctrlKey) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(threadId)) {
          next.delete(threadId);
        } else {
          next.add(threadId);
        }

        return next;
      });
      setLastSelectedIndex(threadIndex);
    } else {
      setSelectedIds(new Set([threadId]));
      setLastSelectedIndex(threadIndex);
    }

    onSelectThread(threadId);
  };

  const handleAction = (action: ThreadAction, threadId?: string) => {
    const actionIds = threadId ? [threadId] : [...selectedIds];
    onAction?.(action, actionIds);
  };

  if (isLoading) {
    return <ThreadListLoading />;
  }

  if (!threads.length) {
    return <ThreadListEmpty activeFolderName={activeFolderName} isSearchActive={isSearchActive} />;
  }

  return (
    <div className="thread-list-shell">
      <ThreadListToolbar selectedCount={selectedIds.size} onAction={(action) => handleAction(action)} />
      <div
        aria-label="Thread list"
        className="thread-list-viewport"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        ref={parentRef}
        role="listbox"
      >
        <div className="thread-list-virtual-space" style={{ height: threads.length * THREAD_ROW_HEIGHT }}>
          {visibleThreads.map((thread, visibleIndex) => {
            const threadIndex = startIndex + visibleIndex;

            return (
              <ThreadListItem
                isMultiSelected={selectedIds.has(thread.id)}
                isSelected={thread.id === selectedThreadId}
                key={thread.id}
                onAction={(action, actionThreadId) => handleAction(action, actionThreadId)}
                onSelect={handleSelect}
                style={{
                  height: THREAD_ROW_HEIGHT - 10,
                  position: 'absolute',
                  top: threadIndex * THREAD_ROW_HEIGHT,
                  width: '100%'
                }}
                thread={thread}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
