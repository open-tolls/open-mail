import { useMemo, useState } from 'react';
import { StatusBadge } from '@components/ui/StatusBadge';
import { ThreadList } from '@components/thread-list/ThreadList';
import { ThreadListFilters } from '@components/thread-list/ThreadListFilters';
import type { ThreadAction } from '@components/thread-list/ThreadListToolbar';
import { filterThreads, type ThreadFilter } from '@components/thread-list/threadListUtils';
import type { FolderRecord, ThreadSummary } from '@lib/contracts';

type ThreadListPanelProps = {
  activeFolderName: string | null;
  folders: FolderRecord[];
  isSearchActive: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  searchQuery: string;
  selectedThreadId: string | null;
  threads: ThreadSummary[];
  onLoadMore?: () => Promise<void> | void;
  onThreadAction?: (action: Exclude<ThreadAction, 'move'>, threadIds: string[]) => void;
  onMoveThreads?: (threadIds: string[], folderId: string) => void;
  onSelectThread: (threadId: string) => void;
};

export const ThreadListPanel = ({
  activeFolderName,
  folders,
  hasMore = false,
  isLoading = false,
  isSearchActive,
  searchQuery,
  selectedThreadId,
  threads,
  onLoadMore,
  onMoveThreads,
  onThreadAction,
  onSelectThread
}: ThreadListPanelProps) => {
  const [activeFilter, setActiveFilter] = useState<ThreadFilter>('all');
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [moveThreadIds, setMoveThreadIds] = useState<string[] | null>(null);
  const filteredThreads = useMemo(() => filterThreads(threads, activeFilter), [activeFilter, threads]);
  const title = isSearchActive ? `Search results for "${searchQuery.trim()}"` : activeFolderName ?? 'Message stream';
  const countLabel = isSearchActive ? `${filteredThreads.length} matches` : `${filteredThreads.length} threads`;
  const handleThreadAction = (action: ThreadAction, threadIds: string[]) => {
    if (action === 'move') {
      setMoveThreadIds(threadIds);
      return;
    }

    const actionLabel = action.replace('-', ' ');
    onThreadAction?.(action, threadIds);
    setActionStatus(`${actionLabel} applied to ${threadIds.length} thread${threadIds.length === 1 ? '' : 's'}`);
  };
  const handleMoveToFolder = (folder: FolderRecord) => {
    if (!moveThreadIds?.length) {
      return;
    }

    onMoveThreads?.(moveThreadIds, folder.id);
    setActionStatus(`moved to ${folder.name}`);
    setMoveThreadIds(null);
  };

  return (
    <div className="thread-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Prototype inbox</p>
          <h3>{title}</h3>
        </div>
        <StatusBadge label={actionStatus ?? countLabel} tone="neutral" />
      </div>

      <ThreadListFilters activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      <ThreadList
        activeFolderName={activeFolderName}
        hasMore={hasMore}
        isLoading={isLoading}
        isSearchActive={isSearchActive}
        onAction={handleThreadAction}
        onLoadMore={onLoadMore}
        onSelectThread={onSelectThread}
        selectedThreadId={selectedThreadId}
        threads={filteredThreads}
      />
      {moveThreadIds ? (
        <div aria-label="Move threads dialog" className="thread-action-dialog" role="dialog">
          <div>
            <strong>Move {moveThreadIds.length} thread{moveThreadIds.length === 1 ? '' : 's'} to...</strong>
            <button aria-label="Close move dialog" onClick={() => setMoveThreadIds(null)} type="button">
              Close
            </button>
          </div>
          <div className="thread-action-dialog-options">
            {folders.map((folder) => (
              <button key={folder.id} onClick={() => handleMoveToFolder(folder)} type="button">
                {folder.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
