import { useMemo, useState } from 'react';
import { StatusBadge } from '@components/ui/StatusBadge';
import { ThreadList } from '@components/thread-list/ThreadList';
import { ThreadListFilters } from '@components/thread-list/ThreadListFilters';
import type { ThreadAction } from '@components/thread-list/ThreadListToolbar';
import { filterThreads, type ThreadFilter } from '@components/thread-list/threadListUtils';
import type { ThreadSummary } from '@lib/contracts';

type ThreadListPanelProps = {
  activeFolderName: string | null;
  isSearchActive: boolean;
  isLoading?: boolean;
  hasMore?: boolean;
  searchQuery: string;
  selectedThreadId: string | null;
  threads: ThreadSummary[];
  onLoadMore?: () => Promise<void> | void;
  onSelectThread: (threadId: string) => void;
};

export const ThreadListPanel = ({
  activeFolderName,
  hasMore = false,
  isLoading = false,
  isSearchActive,
  searchQuery,
  selectedThreadId,
  threads,
  onLoadMore,
  onSelectThread
}: ThreadListPanelProps) => {
  const [activeFilter, setActiveFilter] = useState<ThreadFilter>('all');
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const filteredThreads = useMemo(() => filterThreads(threads, activeFilter), [activeFilter, threads]);
  const title = isSearchActive ? `Search results for "${searchQuery.trim()}"` : activeFolderName ?? 'Message stream';
  const countLabel = isSearchActive ? `${filteredThreads.length} matches` : `${filteredThreads.length} threads`;
  const handleThreadAction = (action: ThreadAction, threadIds: string[]) => {
    const actionLabel = action.replace('-', ' ');
    setActionStatus(`${actionLabel} queued for ${threadIds.length} thread${threadIds.length === 1 ? '' : 's'}`);
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
    </div>
  );
};
