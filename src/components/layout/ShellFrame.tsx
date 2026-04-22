import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { MailSidebar } from '@components/layout/MailSidebar';
import { MailStatusBar } from '@components/layout/MailStatusBar';
import { MailTopbar } from '@components/layout/MailTopbar';
import { MessageReaderPanel } from '@components/layout/MessageReaderPanel';
import { ThreadListPanel, type ThreadDialogRequest } from '@components/layout/ThreadListPanel';
import { type KeyboardShortcutMap, useKeyboardShortcuts } from '@hooks/useKeyboardShortcuts';
import type { AttachmentRecord, FolderRecord, MessageRecord, SyncStatusDetail, ThreadSummary } from '@lib/contracts';
import type { StoreThreadAction } from '@stores/useThreadStore';
import { type ShortcutAction, useShortcutStore } from '@stores/useShortcutStore';
import { useUndoStore } from '@stores/useUndoStore';
import { useUIStore } from '@stores/useUIStore';

type ShellFrameProps = {
  backendStatus: string;
  folders: FolderRecord[];
  threads: ThreadSummary[];
  activeFolderId: string | null;
  searchQuery: string;
  isSearchActive: boolean;
  hasMoreThreads?: boolean;
  selectedThreadId: string | null;
  selectedThread: ThreadSummary | null;
  messages: MessageRecord[];
  selectedMessageId: string | null;
  syncStatusDetail: SyncStatusDetail | null;
  outboxStatus: string;
  isOutboxBusy: boolean;
  isMessagesLoading: boolean;
  isThreadsLoading?: boolean;
  onSelectFolder: (folderId: string) => void;
  onLoadMoreThreads?: () => Promise<void> | void;
  onApplyLabels: (threadIds: string[], labelIds: string[]) => void;
  onMoveThreads: (threadIds: string[], folderId: string) => void;
  onThreadAction: (action: StoreThreadAction, threadIds: string[]) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectThread: (threadId: string) => void;
  onSelectMessage: (messageId: string) => void;
  onOpenExternalLink: (url: string) => void;
  onDownloadAttachment: (attachment: AttachmentRecord) => void;
  resolveInlineImageUrl: (localPath: string) => string;
  onSendDraft: (draft: { to: string; subject: string; body: string }) => Promise<void>;
  onFlushOutbox: () => Promise<void>;
};

export const ShellFrame = ({
  backendStatus,
  folders,
  threads,
  activeFolderId,
  searchQuery,
  isSearchActive,
  hasMoreThreads = false,
  selectedThreadId,
  selectedThread,
  messages,
  selectedMessageId,
  syncStatusDetail,
  outboxStatus,
  isOutboxBusy,
  isMessagesLoading,
  isThreadsLoading = false,
  onSelectFolder,
  onLoadMoreThreads,
  onApplyLabels,
  onMoveThreads,
  onThreadAction,
  onSearchQueryChange,
  onSelectThread,
  onSelectMessage,
  onOpenExternalLink,
  onDownloadAttachment,
  resolveInlineImageUrl,
  onSendDraft,
  onFlushOutbox
}: ShellFrameProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isResizingThreadPanel, setIsResizingThreadPanel] = useState(false);
  const [shortcutStatusLabel, setShortcutStatusLabel] = useState<string | null>(null);
  const [threadDialogRequest, setThreadDialogRequest] = useState<ThreadDialogRequest | null>(null);
  const shortcutBindings = useShortcutStore((state) => state.bindings);
  const currentUndoToast = useUndoStore((state) => state.currentToast);
  const dismissUndoToast = useUndoStore((state) => state.dismiss);
  const runUndo = useUndoStore((state) => state.undo);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const layoutMode = useUIStore((state) => state.layoutMode);
  const themeId = useUIStore((state) => state.themeId);
  const threadPanelWidth = useUIStore((state) => state.threadPanelWidth);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const toggleLayoutMode = useUIStore((state) => state.toggleLayoutMode);
  const cycleTheme = useUIStore((state) => state.cycleTheme);
  const setThreadPanelWidth = useUIStore((state) => state.setThreadPanelWidth);
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;
  const syncPhaseLabel = syncStatusDetail?.phase ? syncStatusDetail.phase.replaceAll('-', ' ') : 'sync idle';
  const syncFoldersLabel = syncStatusDetail ? `${syncStatusDetail.foldersSynced} folders` : '0 folders';
  const syncMessagesLabel = syncStatusDetail
    ? `${syncStatusDetail.messagesObserved} observed, ${syncStatusDetail.messagesDeleted} removed`
    : '0 observed';
  const totalUnreadCount = folders.reduce((total, folder) => total + folder.unread_count, 0);
  const syncStatusLabel = syncStatusDetail?.phase
    ? `Sync ${syncStatusDetail.phase.replaceAll('-', ' ')}`
    : backendStatus;
  const selectedThreadIndex = threads.findIndex((thread) => thread.id === selectedThreadId);
  const selectThreadByOffset = useCallback((offset: number) => {
    if (!threads.length) {
      return;
    }

    const currentIndex = selectedThreadIndex >= 0 ? selectedThreadIndex : 0;
    const nextIndex = Math.min(threads.length - 1, Math.max(0, currentIndex + offset));
    onSelectThread(threads[nextIndex].id);
  }, [onSelectThread, selectedThreadIndex, threads]);
  const selectSystemFolder = useCallback((role: string) => {
    const folder = folders.find((candidate) => candidate.role === role);
    if (folder) {
      onSelectFolder(folder.id);
    }
  }, [folders, onSelectFolder]);
  const workspaceStyle = {
    '--thread-panel-width': `${threadPanelWidth}%`
  } as CSSProperties;
  const toggleComposer = () => setIsComposerOpen((current) => !current);
  const toggleSidebarAndCloseComposer = () => {
    toggleSidebar();
    setIsComposerOpen(false);
  };
  const reportThreadShortcut = useCallback((label: string) => {
    setShortcutStatusLabel(
      selectedThread ? `${label}: ${selectedThread.subject}` : `${label}: no thread selected`
    );
  }, [selectedThread]);
  const runSelectedThreadAction = useCallback((action: StoreThreadAction, label: string) => {
    if (!selectedThread) {
      reportThreadShortcut(label);
      return;
    }

    onThreadAction(action, [selectedThread.id]);
    reportThreadShortcut(label);
  }, [onThreadAction, reportThreadShortcut, selectedThread]);
  const openSelectedThreadDialog = useCallback((action: ThreadDialogRequest['action'], label: string) => {
    if (!selectedThread) {
      reportThreadShortcut(label);
      return;
    }

    setThreadDialogRequest((currentRequest) => ({
      action,
      requestId: (currentRequest?.requestId ?? 0) + 1,
      threadIds: [selectedThread.id]
    }));
    reportThreadShortcut(label);
  }, [reportThreadShortcut, selectedThread]);
  const runUndoShortcut = useCallback(() => {
    void runUndo().then(() => setShortcutStatusLabel('Undo applied'));
  }, [runUndo]);
  const shortcutMap = useMemo(() => {
    const actionHandlers: Partial<Record<ShortcutAction, () => void>> = {
      'action.redo': () => setShortcutStatusLabel('Redo shortcut ready'),
      'action.undo': runUndoShortcut,
      'compose.new': () => {
        setSidebarCollapsed(false);
        setIsComposerOpen(true);
      },
      'compose.newWindow': () => {
        setSidebarCollapsed(false);
        setIsComposerOpen(true);
      },
      'compose.send': () => setShortcutStatusLabel('Composer send shortcut ready'),
      'nav.drafts': () => selectSystemFolder('drafts'),
      'nav.inbox': () => selectSystemFolder('inbox'),
      'nav.sent': () => selectSystemFolder('sent'),
      'preferences.open': () => setShortcutStatusLabel('Preferences shortcut ready'),
      'search.focus': () => searchInputRef.current?.focus(),
      'thread.archive': () => runSelectedThreadAction('archive', 'Archive shortcut applied'),
      'thread.forward': () => reportThreadShortcut('Forward shortcut queued'),
      'thread.label': () => openSelectedThreadDialog('label', 'Label shortcut opened'),
      'thread.move': () => openSelectedThreadDialog('move', 'Move shortcut opened'),
      'thread.next': () => selectThreadByOffset(1),
      'thread.prev': () => selectThreadByOffset(-1),
      'thread.reply': () => reportThreadShortcut('Reply shortcut queued'),
      'thread.replyAll': () => reportThreadShortcut('Reply all shortcut queued'),
      'thread.star': () => runSelectedThreadAction('star', 'Star shortcut applied'),
      'thread.trash': () => runSelectedThreadAction('trash', 'Trash shortcut applied'),
      'ui.back': () => {
        setIsComposerOpen(false);
        searchInputRef.current?.blur();
      }
    };

    return Object.entries(shortcutBindings).reduce<KeyboardShortcutMap>((shortcuts, [action, shortcut]) => {
      const handler = actionHandlers[action as ShortcutAction];
      if (handler) {
        shortcuts[shortcut] = handler;
      }

      return shortcuts;
    }, {});
  }, [
    openSelectedThreadDialog,
    reportThreadShortcut,
    runSelectedThreadAction,
    runUndoShortcut,
    selectSystemFolder,
    selectThreadByOffset,
    setSidebarCollapsed,
    shortcutBindings
  ]);

  useKeyboardShortcuts(shortcutMap);

  useEffect(() => {
    if (!currentUndoToast) {
      return;
    }

    const timeoutId = window.setTimeout(dismissUndoToast, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentUndoToast, dismissUndoToast]);

  useEffect(() => {
    if (!isResizingThreadPanel) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
      setThreadPanelWidth(nextWidth);
    };
    const stopResize = () => setIsResizingThreadPanel(false);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
    };
  }, [isResizingThreadPanel, setThreadPanelWidth]);

  return (
    <div className={isSidebarCollapsed ? 'shell-root shell-root-sidebar-collapsed' : 'shell-root'}>
      <div className="shell-backdrop" aria-hidden="true" />
      <MailSidebar
        activeFolderId={activeFolderId}
        folders={folders}
        isCollapsed={isSidebarCollapsed}
        isComposerOpen={isComposerOpen}
        isOutboxBusy={isOutboxBusy}
        outboxStatus={outboxStatus}
        onFlushOutbox={onFlushOutbox}
        onSelectFolder={onSelectFolder}
        onSendDraft={onSendDraft}
        onToggleComposer={toggleComposer}
        onToggleSidebar={toggleSidebarAndCloseComposer}
      />

      <main className="content-panel">
        <MailTopbar
          backendStatus={backendStatus}
          folders={folders}
          layoutMode={layoutMode}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          threads={threads}
          themeId={themeId}
          onCycleTheme={cycleTheme}
          onSearchQueryChange={onSearchQueryChange}
          onToggleLayoutMode={toggleLayoutMode}
        />

        <section className="hero-card">
          <div>
            <p className="eyebrow">Luxury minimal shell</p>
            <h2>Hello Open Mail</h2>
            <p className="hero-copy">
              O projeto já nasce com Tauri v2, React 19, TypeScript estrito, IPC funcional e um shell
              visual pronto para receber sync engine, banco e composer.
            </p>
          </div>

          <div className="hero-metrics" aria-label="Project health">
            <article>
              <span>Sync phase</span>
              <strong>{syncPhaseLabel}</strong>
            </article>
            <article>
              <span>Folders</span>
              <strong>{syncFoldersLabel}</strong>
            </article>
            <article>
              <span>Messages</span>
              <strong>{syncMessagesLabel}</strong>
            </article>
          </div>
        </section>

        <section
          className={[
            'workspace-grid',
            layoutMode === 'list' ? 'workspace-grid-list' : '',
            isResizingThreadPanel ? 'workspace-grid-resizing' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          ref={workspaceRef}
          style={workspaceStyle}
        >
          <ThreadListPanel
            activeFolderName={activeFolder?.name ?? null}
            dialogRequest={threadDialogRequest}
            folders={folders}
            hasMore={hasMoreThreads}
            isSearchActive={isSearchActive}
            isLoading={isThreadsLoading}
            onApplyLabels={onApplyLabels}
            onLoadMore={onLoadMoreThreads}
            onMoveThreads={onMoveThreads}
            onThreadAction={onThreadAction}
            searchQuery={searchQuery}
            selectedThreadId={selectedThreadId}
            threads={threads}
            onSelectThread={onSelectThread}
          />

          <button
            aria-label="Resize thread and reader panels"
            aria-orientation="vertical"
            className="panel-resizer"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setIsResizingThreadPanel(true);
            }}
            role="separator"
            type="button"
          >
            <GripVertical size={16} />
          </button>

          <MessageReaderPanel
            isMessagesLoading={isMessagesLoading}
            messages={messages}
            selectedMessageId={selectedMessageId}
            selectedThread={selectedThread}
            onOpenExternalLink={onOpenExternalLink}
            onSelectMessage={onSelectMessage}
            onDownloadAttachment={onDownloadAttachment}
            resolveInlineImageUrl={resolveInlineImageUrl}
          />
        </section>

        <MailStatusBar
          actionStatusLabel={shortcutStatusLabel}
          activeFolderName={activeFolder?.name ?? 'No folder selected'}
          layoutMode={layoutMode}
          syncStatusLabel={syncStatusLabel}
          totalUnreadCount={totalUnreadCount}
        />
        {currentUndoToast ? (
          <div aria-label="Undo notification" className="undo-toast" role="status">
            <span>{currentUndoToast.description}</span>
            <button onClick={() => void runUndo()} type="button" aria-label="Undo last action">
              Undo
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
};
