import { useMemo, useState } from 'react';
import { StatusBadge } from '@components/ui/StatusBadge';
import { ThreadList } from '@components/thread-list/ThreadList';
import { ThreadListFilters } from '@components/thread-list/ThreadListFilters';
import type { ThreadAction } from '@components/thread-list/ThreadListToolbar';
import { filterThreads, type ThreadFilter } from '@components/thread-list/threadListUtils';
import type { FolderRecord, ThreadSummary } from '@lib/contracts';

export type ThreadLabelOption = {
  id: string;
  name: string;
};

type ThreadListPanelProps = {
  activeFolderName: string | null;
  folders: FolderRecord[];
  isSearchActive: boolean;
  labels?: ThreadLabelOption[];
  isLoading?: boolean;
  hasMore?: boolean;
  searchQuery: string;
  selectedThreadId: string | null;
  threads: ThreadSummary[];
  onLoadMore?: () => Promise<void> | void;
  onThreadAction?: (action: Exclude<ThreadAction, 'move' | 'label'>, threadIds: string[]) => void;
  onMoveThreads?: (threadIds: string[], folderId: string) => void;
  onApplyLabels?: (threadIds: string[], labelIds: string[]) => void;
  onSelectThread: (threadId: string) => void;
};

const defaultLabels: ThreadLabelOption[] = [
  { id: 'label:design-review', name: 'Design review' },
  { id: 'label:desktop-alpha', name: 'Desktop alpha' },
  { id: 'label:tauri-health', name: 'Tauri health' }
];

const toCustomLabelId = (name: string) => `custom:${name.trim().toLowerCase().replace(/\s+/g, '-')}`;

export const ThreadListPanel = ({
  activeFolderName,
  folders,
  hasMore = false,
  isLoading = false,
  isSearchActive,
  labels = defaultLabels,
  searchQuery,
  selectedThreadId,
  threads,
  onLoadMore,
  onApplyLabels,
  onMoveThreads,
  onThreadAction,
  onSelectThread
}: ThreadListPanelProps) => {
  const [activeFilter, setActiveFilter] = useState<ThreadFilter>('all');
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [checkedLabelIds, setCheckedLabelIds] = useState<string[]>([]);
  const [customLabelName, setCustomLabelName] = useState('');
  const [labelThreadIds, setLabelThreadIds] = useState<string[] | null>(null);
  const [moveThreadIds, setMoveThreadIds] = useState<string[] | null>(null);
  const filteredThreads = useMemo(() => filterThreads(threads, activeFilter), [activeFilter, threads]);
  const title = isSearchActive ? `Search results for "${searchQuery.trim()}"` : activeFolderName ?? 'Message stream';
  const countLabel = isSearchActive ? `${filteredThreads.length} matches` : `${filteredThreads.length} threads`;
  const handleThreadAction = (action: ThreadAction, threadIds: string[]) => {
    if (action === 'move') {
      setLabelThreadIds(null);
      setMoveThreadIds(threadIds);
      return;
    }

    if (action === 'label') {
      setMoveThreadIds(null);
      setLabelThreadIds(threadIds);
      setCheckedLabelIds([]);
      setCustomLabelName('');
      return;
    }

    const actionLabel = action.replace('-', ' ');
    onThreadAction?.(action, threadIds);
    setActionStatus(`${actionLabel} applied to ${threadIds.length} thread${threadIds.length === 1 ? '' : 's'}`);
  };
  const handleLabelToggle = (labelId: string) => {
    setCheckedLabelIds((currentIds) =>
      currentIds.includes(labelId) ? currentIds.filter((id) => id !== labelId) : [...currentIds, labelId]
    );
  };
  const handleApplyLabels = () => {
    if (!labelThreadIds?.length) {
      return;
    }

    const customLabelId = customLabelName.trim() ? toCustomLabelId(customLabelName) : null;
    const labelIds = Array.from(new Set([...checkedLabelIds, ...(customLabelId ? [customLabelId] : [])]));

    if (!labelIds.length) {
      return;
    }

    onApplyLabels?.(labelThreadIds, labelIds);
    setActionStatus(`labeled ${labelThreadIds.length} thread${labelThreadIds.length === 1 ? '' : 's'}`);
    setLabelThreadIds(null);
    setCheckedLabelIds([]);
    setCustomLabelName('');
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
      {labelThreadIds ? (
        <div aria-label="Label threads dialog" className="thread-action-dialog" role="dialog">
          <div>
            <strong>Label {labelThreadIds.length} thread{labelThreadIds.length === 1 ? '' : 's'}</strong>
            <button aria-label="Close label dialog" onClick={() => setLabelThreadIds(null)} type="button">
              Close
            </button>
          </div>
          <div className="thread-action-dialog-options">
            {labels.map((label) => (
              <label className="thread-action-checkbox" key={label.id}>
                <input
                  checked={checkedLabelIds.includes(label.id)}
                  onChange={() => handleLabelToggle(label.id)}
                  type="checkbox"
                />
                {label.name}
              </label>
            ))}
            <label className="thread-action-field">
              <span>Create label</span>
              <input
                aria-label="Create label"
                onChange={(event) => setCustomLabelName(event.target.value)}
                placeholder="New label name"
                type="text"
                value={customLabelName}
              />
            </label>
            <button onClick={handleApplyLabels} type="button">
              Apply labels
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
