import { type MouseEvent, type UIEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Clock3, MailOpen, Star, Trash2, Undo2, XCircle } from 'lucide-react';
import type { ThreadSummary } from '@lib/contracts';
import { ThreadListEmpty } from '@components/thread-list/ThreadListEmpty';
import { ThreadListItem, type ThreadSelectEvent } from '@components/thread-list/ThreadListItem';
import { ThreadListLoading } from '@components/thread-list/ThreadListLoading';
import { type ThreadAction, ThreadListToolbar } from '@components/thread-list/ThreadListToolbar';
import { THREAD_ROW_HEIGHT } from '@components/thread-list/threadListUtils';
import { ContextMenu } from '@components/ui';

type ThreadListProps = {
  activeFolderName: string | null;
  isReminderFolder?: boolean;
  isSnoozedFolder?: boolean;
  isScheduledFolder?: boolean;
  hasMore?: boolean;
  isLoading?: boolean;
  isSearchActive: boolean;
  selectedThreadId: string | null;
  threads: ThreadSummary[];
  onAction?: (action: ThreadAction, threadIds: string[]) => void;
  onLoadMore?: () => Promise<void> | void;
  onSelectThread: (threadId: string) => void;
};

const getVisibleWindow = (scrollTop: number, viewportHeight: number, itemCount: number) => {
  const visibleCount = Math.ceil(Math.max(viewportHeight, 640) / THREAD_ROW_HEIGHT);
  const startIndex = Math.max(0, Math.floor(scrollTop / THREAD_ROW_HEIGHT) - 4);
  const endIndex = Math.min(itemCount, startIndex + visibleCount + 8);

  return { startIndex, endIndex };
};

type ThreadContextMenuState = {
  threadId: string;
  x: number;
  y: number;
} | null;

const threadContextActions: Array<{
  action: ThreadAction;
  label: string;
  icon: typeof Archive;
}> = [
  { action: 'archive', label: 'Archive', icon: Archive },
  { action: 'trash', label: 'Move to trash', icon: Trash2 },
  { action: 'toggle-read', label: 'Mark read/unread', icon: MailOpen },
  { action: 'star', label: 'Star', icon: Star },
  { action: 'snooze', label: 'Snooze', icon: Clock3 }
];

export const ThreadList = ({
  activeFolderName,
  isReminderFolder = false,
  isSnoozedFolder = false,
  isScheduledFolder = false,
  hasMore = false,
  isLoading = false,
  isSearchActive,
  selectedThreadId,
  threads,
  onAction,
  onLoadMore,
  onSelectThread
}: ThreadListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ThreadContextMenuState>(null);
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

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeContextMenu = () => setContextMenu(null);
    const closeContextMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    window.addEventListener('click', closeContextMenu);
    window.addEventListener('keydown', closeContextMenuOnEscape);

    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('keydown', closeContextMenuOnEscape);
    };
  }, [contextMenu]);

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
    setContextMenu(null);
  };

  const handleContextMenu = (threadId: string, event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setSelectedIds(new Set([threadId]));
    setLastSelectedIndex(threads.findIndex((thread) => thread.id === threadId));
    onSelectThread(threadId);
    setContextMenu({
      threadId,
      x: event.clientX,
      y: event.clientY
    });
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    setScrollTop(element.scrollTop);
    setContextMenu(null);

    if (hasMore && !isLoading && element.scrollTop + element.clientHeight >= element.scrollHeight - 240) {
      void onLoadMore?.();
    }
  };

  if (isLoading && !threads.length) {
    return <ThreadListLoading />;
  }

  if (!threads.length) {
    return <ThreadListEmpty activeFolderName={activeFolderName} isSearchActive={isSearchActive} />;
  }

  return (
    <div className="thread-list-shell">
      <ThreadListToolbar
        isReminderFolder={isReminderFolder}
        isScheduledFolder={isScheduledFolder}
        isSnoozedFolder={isSnoozedFolder}
        selectedCount={selectedIds.size}
        onAction={(action) => handleAction(action)}
      />
      <div
        aria-label="Thread list"
        className="thread-list-viewport"
        onScroll={handleScroll}
        ref={parentRef}
        role="listbox"
      >
        <div className="thread-list-virtual-space" style={{ height: threads.length * THREAD_ROW_HEIGHT }}>
          {visibleThreads.map((thread, visibleIndex) => {
            const threadIndex = startIndex + visibleIndex;

            return (
              <ThreadListItem
                isReminderFolder={isReminderFolder}
                isMultiSelected={selectedIds.has(thread.id)}
                isSelected={thread.id === selectedThreadId}
                key={thread.id}
                onAction={(action, actionThreadId) => handleAction(action, actionThreadId)}
                onContextMenu={handleContextMenu}
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
      {contextMenu ? (
        <ContextMenu
          aria-label="Thread context menu"
          className="thread-context-menu"
          onClick={(event) => event.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {(isScheduledFolder
            ? [{ action: 'cancel-schedule' as const, label: 'Cancel schedule', icon: XCircle }]
            : isReminderFolder
              ? [{ action: 'cancel-reminder' as const, label: 'Cancel reminder', icon: XCircle }]
            : isSnoozedFolder
              ? [{ action: 'unsnooze' as const, label: 'Unsnooze', icon: Undo2 }]
              : threadContextActions
          ).map(({ action, icon: Icon, label }) => (
            <button
              className={action === 'trash' ? 'thread-context-menu-danger' : undefined}
              key={action}
              onClick={() => handleAction(action, contextMenu.threadId)}
              role="menuitem"
              type="button"
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </ContextMenu>
      ) : null}
      {isLoading && threads.length ? <p className="thread-loading-more">Loading more threads...</p> : null}
    </div>
  );
};
