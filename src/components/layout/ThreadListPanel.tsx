import { useEffect, useMemo, useState } from 'react';
import { PluginSlot } from '@/plugins/PluginSlot';
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

export type ThreadDialogRequest = {
  action: 'move' | 'label' | 'snooze';
  requestId: number;
  threadIds: string[];
};

type ThreadListPanelProps = {
  activeFolderId: string | null;
  activeFolderName: string | null;
  dialogRequest?: ThreadDialogRequest | null;
  folders: FolderRecord[];
  isReminderFolder?: boolean;
  isScheduledFolder?: boolean;
  isSearchActive: boolean;
  labels?: ThreadLabelOption[];
  isLoading?: boolean;
  hasMore?: boolean;
  searchQuery: string;
  selectedThreadId: string | null;
  threads: ThreadSummary[];
  onLoadMore?: () => Promise<void> | void;
  onThreadAction?: (
    action: Exclude<ThreadAction, 'move' | 'label' | 'snooze' | 'unsnooze' | 'cancel-schedule' | 'cancel-reminder'>,
    threadIds: string[]
  ) => void;
  onMoveThreads?: (threadIds: string[], folderId: string) => void;
  onApplyLabels?: (threadIds: string[], labelIds: string[]) => void;
  onSnoozeThreads?: (threadIds: string[], until: string) => void;
  onUnsnoozeThreads?: (threadIds: string[]) => void;
  onCancelScheduledSends?: (scheduledSendIds: string[]) => void;
  onCancelReminders?: (reminderIds: string[]) => void;
  onSelectThread: (threadId: string) => void;
};

const defaultLabels: ThreadLabelOption[] = [
  { id: 'label:design-review', name: 'Design review' },
  { id: 'label:desktop-alpha', name: 'Desktop alpha' },
  { id: 'label:tauri-health', name: 'Tauri health' }
];

const toCustomLabelId = (name: string) => `custom:${name.trim().toLowerCase().replace(/\s+/g, '-')}`;

export const ThreadListPanel = ({
  activeFolderId,
  activeFolderName,
  dialogRequest,
  folders,
  isReminderFolder = false,
  isScheduledFolder = false,
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
  onSnoozeThreads,
  onUnsnoozeThreads,
  onCancelScheduledSends,
  onCancelReminders,
  onThreadAction,
  onSelectThread
}: ThreadListPanelProps) => {
  const isSnoozedFolder = activeFolderId === 'fld_snoozed';
  const [activeFilter, setActiveFilter] = useState<ThreadFilter>('all');
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [checkedLabelIds, setCheckedLabelIds] = useState<string[]>([]);
  const [customLabelName, setCustomLabelName] = useState('');
  const [labelThreadIds, setLabelThreadIds] = useState<string[] | null>(null);
  const [moveThreadIds, setMoveThreadIds] = useState<string[] | null>(null);
  const [snoozeThreadIds, setSnoozeThreadIds] = useState<string[] | null>(null);
  const [customSnoozeAt, setCustomSnoozeAt] = useState('');
  const filteredThreads = useMemo(() => filterThreads(threads, activeFilter), [activeFilter, threads]);
  const title = isSearchActive ? `Search results for "${searchQuery.trim()}"` : activeFolderName ?? 'Message stream';
  const countLabel = isSearchActive ? `${filteredThreads.length} matches` : `${filteredThreads.length} threads`;

  const openMoveDialog = (threadIds: string[]) => {
    setLabelThreadIds(null);
    setSnoozeThreadIds(null);
    setMoveThreadIds(threadIds);
  };
  const openLabelDialog = (threadIds: string[]) => {
    setMoveThreadIds(null);
    setSnoozeThreadIds(null);
    setLabelThreadIds(threadIds);
    setCheckedLabelIds([]);
    setCustomLabelName('');
  };
  const openSnoozeDialog = (threadIds: string[]) => {
    setMoveThreadIds(null);
    setLabelThreadIds(null);
    setSnoozeThreadIds(threadIds);
    setCustomSnoozeAt('');
  };
  const handleThreadAction = (action: ThreadAction, threadIds: string[]) => {
    if (action === 'move') {
      openMoveDialog(threadIds);
      return;
    }

    if (action === 'label') {
      openLabelDialog(threadIds);
      return;
    }

    if (action === 'snooze') {
      openSnoozeDialog(threadIds);
      return;
    }

    if (action === 'unsnooze') {
      onUnsnoozeThreads?.(threadIds);
      setActionStatus(`unsnoozed ${threadIds.length} thread${threadIds.length === 1 ? '' : 's'}`);
      return;
    }

    if (action === 'cancel-schedule') {
      onCancelScheduledSends?.(threadIds);
      setActionStatus(`canceled ${threadIds.length} scheduled message${threadIds.length === 1 ? '' : 's'}`);
      return;
    }

    if (action === 'cancel-reminder') {
      onCancelReminders?.(threadIds);
      setActionStatus(`canceled ${threadIds.length} reminder${threadIds.length === 1 ? '' : 's'}`);
      return;
    }

    const actionLabel = action.replace('-', ' ');
    onThreadAction?.(action, threadIds);
    setActionStatus(`${actionLabel} applied to ${threadIds.length} thread${threadIds.length === 1 ? '' : 's'}`);
  };

  useEffect(() => {
    if (!dialogRequest?.threadIds.length) {
      return;
    }

    if (dialogRequest.action === 'move') {
      openMoveDialog(dialogRequest.threadIds);
      return;
    }

    if (dialogRequest.action === 'snooze') {
      openSnoozeDialog(dialogRequest.threadIds);
      return;
    }

    openLabelDialog(dialogRequest.threadIds);
  }, [dialogRequest?.action, dialogRequest?.requestId, dialogRequest?.threadIds]);

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
  const handleSnooze = (threadIds: string[], until: string) => {
    onSnoozeThreads?.(threadIds, until);
    setActionStatus(`snoozed ${threadIds.length} thread${threadIds.length === 1 ? '' : 's'}`);
    setSnoozeThreadIds(null);
    setCustomSnoozeAt('');
  };
  const buildSnoozePresets = () => {
    const now = new Date();
    const laterToday = new Date(now);
    laterToday.setHours(18, 0, 0, 0);
    if (laterToday <= now) {
      laterToday.setDate(laterToday.getDate() + 1);
    }

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);

    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + ((8 - nextWeek.getDay()) % 7 || 7));
    nextWeek.setHours(8, 0, 0, 0);

    return [
      { id: 'later-today', label: 'Later today', until: laterToday.toISOString() },
      { id: 'tomorrow', label: 'Tomorrow', until: tomorrow.toISOString() },
      { id: 'next-week', label: 'Next week', until: nextWeek.toISOString() }
    ];
  };
  const snoozePresets = buildSnoozePresets();

  return (
    <div className="thread-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Prototype inbox</p>
          <h3>{title}</h3>
        </div>
        <StatusBadge label={actionStatus ?? countLabel} tone="neutral" />
      </div>

      <PluginSlot
        name="thread-list:header"
        props={{ activeFilter, activeFolderId, activeFolderName, selectedThreadId, threadCount: filteredThreads.length }}
      />

      <ThreadListFilters activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      <ThreadList
        activeFolderName={activeFolderName}
        isReminderFolder={isReminderFolder}
        isScheduledFolder={isScheduledFolder}
        isSnoozedFolder={isSnoozedFolder}
        hasMore={hasMore}
        isLoading={isLoading}
        isSearchActive={isSearchActive}
        onAction={handleThreadAction}
        onLoadMore={onLoadMore}
        onSelectThread={onSelectThread}
        selectedThreadId={selectedThreadId}
        threads={filteredThreads}
      />
      <PluginSlot
        name="thread-list:footer"
        props={{ activeFilter, activeFolderId, activeFolderName, selectedThreadId, threadCount: filteredThreads.length }}
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
          <PluginSlot name="thread-list:dialog-footer" props={{ action: 'move', threadIds: moveThreadIds }} />
        </div>
      ) : null}
      {snoozeThreadIds ? (
        <div aria-label="Snooze threads dialog" className="thread-action-dialog" role="dialog">
          <div>
            <strong>Snooze {snoozeThreadIds.length} thread{snoozeThreadIds.length === 1 ? '' : 's'} until...</strong>
            <button aria-label="Close snooze dialog" onClick={() => setSnoozeThreadIds(null)} type="button">
              Close
            </button>
          </div>
          <div className="thread-action-dialog-options">
            {snoozePresets.map((preset) => (
              <button key={preset.id} onClick={() => handleSnooze(snoozeThreadIds, preset.until)} type="button">
                {preset.label}
              </button>
            ))}
            <label className="thread-action-field">
              <span>Pick date & time</span>
              <input
                aria-label="Pick snooze date and time"
                onChange={(event) => setCustomSnoozeAt(event.target.value)}
                type="datetime-local"
                value={customSnoozeAt}
              />
            </label>
            <button
              disabled={!customSnoozeAt}
              onClick={() => handleSnooze(snoozeThreadIds, new Date(customSnoozeAt).toISOString())}
              type="button"
            >
              Snooze custom time
            </button>
          </div>
          <PluginSlot name="thread-list:dialog-footer" props={{ action: 'snooze', threadIds: snoozeThreadIds }} />
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
          <PluginSlot name="thread-list:dialog-footer" props={{ action: 'label', threadIds: labelThreadIds }} />
        </div>
      ) : null}
    </div>
  );
};
