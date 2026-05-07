import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Composer, type ComposerDraft } from '@components/composer/Composer';
import { SectionErrorBoundary } from '@components/error/SectionErrorBoundary';
import { GripVertical } from 'lucide-react';
import { MailSidebar } from '@components/layout/MailSidebar';
import { MailStatusBar } from '@components/layout/MailStatusBar';
import { MailTopbar } from '@components/layout/MailTopbar';
import { MessageReaderPanel } from '@components/layout/MessageReaderPanel';
import { ThreadListPanel, type ThreadDialogRequest } from '@components/layout/ThreadListPanel';
import { useAppShellEvents } from '@hooks/useAppShellEvents';
import { useDraftAutoSave } from '@hooks/useDraftAutoSave';
import { type KeyboardShortcutMap, useKeyboardShortcuts } from '@hooks/useKeyboardShortcuts';
import { prepareForwardDraft, prepareReplyDraft } from '@lib/compose-utils';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';
import { printMessage } from '@lib/message-print';
import { tauriRuntime } from '@lib/tauri-bridge';
import type { AttachmentRecord, FolderRecord, MessageRecord, SyncStatusDetail, ThreadSummary } from '@lib/contracts';
import { applySignatureHtml } from '@lib/signature-utils';
import type { AccountRecord } from '@stores/useAccountStore';
import { resolveSignatureForAccount, useSignatureStore } from '@stores/useSignatureStore';
import { useDraftStore } from '@stores/useDraftStore';
import { deleteDraftFromBackend, hydrateDraftStore, saveDraftToBackend } from '@stores/useDraftStore';
import type { StoreThreadAction } from '@stores/useThreadStore';
import { type ShortcutAction, useShortcutStore } from '@stores/useShortcutStore';
import { useUndoStore } from '@stores/useUndoStore';
import { useUIStore } from '@stores/useUIStore';

const stripHtmlPreview = (value: string) =>
  value
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SCHEDULED_FOLDER_ID = 'fld_scheduled';
const REMINDERS_FOLDER_ID = 'fld_reminders';

type ShellFrameProps = {
  accounts: AccountRecord[];
  backendStatus: string;
  folders: FolderRecord[];
  threads: ThreadSummary[];
  activeFolderId: string | null;
  searchQuery: string;
  isSearchActive: boolean;
  hasMoreThreads?: boolean;
  selectedThreadId: string | null;
  selectedThread: ThreadSummary | null;
  scheduledThreads: ThreadSummary[];
  reminderThreads: ThreadSummary[];
  messages: MessageRecord[];
  selectedMessageId: string | null;
  syncStatusDetail: SyncStatusDetail | null;
  outboxStatus: string;
  composerToast: { kind: 'success' | 'error'; message: string } | null;
  composerAccounts: AccountRecord[];
  composerAccountId: string;
  contacts: ContactDirectoryEntry[];
  recipientSuggestions: string[];
  syncStatusByAccountId?: Record<string, SyncStatusDetail | null>;
  isOutboxBusy: boolean;
  isMessagesLoading: boolean;
  isThreadsLoading?: boolean;
  onSelectFolder: (folderId: string) => void;
  onLoadMoreThreads?: () => Promise<void> | void;
  onApplyLabels: (threadIds: string[], labelIds: string[]) => void;
  onAddAccount: () => void;
  onOpenPreferences: () => void;
  onMoveThreads: (threadIds: string[], folderId: string) => void;
  onSnoozeThreads: (threadIds: string[], until: string) => void;
  onUnsnoozeThreads: (threadIds: string[]) => void;
  onCancelScheduledSends: (scheduledSendIds: string[]) => void;
  onCancelReminders: (reminderIds: string[]) => void;
  onRestoreScheduledDraft: (scheduledSendId: string) => Promise<Partial<ComposerDraft> | null>;
  onThreadAction: (action: StoreThreadAction, threadIds: string[]) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectThread: (threadId: string) => void;
  onSelectMessage: (messageId: string) => void;
  onOpenExternalLink: (url: string) => void;
  onDownloadAttachment: (attachment: AttachmentRecord) => void;
  resolveInlineImageUrl: (localPath: string) => string;
  onScheduleDraft: (draft: ComposerDraft, sendAt: string) => Promise<boolean>;
  onSendDraft: (draft: ComposerDraft, remindAt?: string | null) => Promise<boolean>;
  onFlushOutbox: () => Promise<void>;
};

export const ShellFrame = ({
  accounts,
  backendStatus,
  folders,
  threads,
  activeFolderId,
  searchQuery,
  isSearchActive,
  hasMoreThreads = false,
  selectedThreadId,
  selectedThread,
  scheduledThreads,
  reminderThreads,
  messages,
  selectedMessageId,
  syncStatusDetail,
  outboxStatus,
  composerToast,
  composerAccounts,
  composerAccountId,
  contacts,
  recipientSuggestions,
  syncStatusByAccountId,
  isOutboxBusy,
  isMessagesLoading,
  isThreadsLoading = false,
  onSelectFolder,
  onLoadMoreThreads,
  onApplyLabels,
  onAddAccount,
  onOpenPreferences,
  onMoveThreads,
  onSnoozeThreads,
  onUnsnoozeThreads,
  onCancelScheduledSends,
  onCancelReminders,
  onRestoreScheduledDraft,
  onThreadAction,
  onSearchQueryChange,
  onSelectThread,
  onSelectMessage,
  onOpenExternalLink,
  onDownloadAttachment,
  resolveInlineImageUrl,
  onScheduleDraft,
  onSendDraft,
  onFlushOutbox
}: ShellFrameProps) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerInitialDraft, setComposerInitialDraft] = useState<Partial<ComposerDraft> | undefined>(undefined);
  const [composerDraftId, setComposerDraftId] = useState<string | null>(null);
  const [composerLiveDraft, setComposerLiveDraft] = useState<ComposerDraft | null>(null);
  const [isResizingThreadPanel, setIsResizingThreadPanel] = useState(false);
  const [selectedDraftThreadId, setSelectedDraftThreadId] = useState<string | null>(null);
  const [selectedScheduledThreadId, setSelectedScheduledThreadId] = useState<string | null>(null);
  const [shortcutStatusLabel, setShortcutStatusLabel] = useState<string | null>(null);
  const [threadDialogRequest, setThreadDialogRequest] = useState<ThreadDialogRequest | null>(null);
  const [visibleComposerToast, setVisibleComposerToast] = useState(composerToast);
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
  const signatures = useSignatureStore((state) => state.signatures);
  const defaultSignatureId = useSignatureStore((state) => state.defaultSignatureId);
  const defaultSignatureIdsByAccountId = useSignatureStore((state) => state.defaultSignatureIdsByAccountId);
  const drafts = useDraftStore((state) => state.drafts);
  const activeDraftId = useDraftStore((state) => state.activeDraftId);
  const editDraft = useDraftStore((state) => state.editDraft);
  const removeDraft = useDraftStore((state) => state.removeDraft);
  const setDrafts = useDraftStore((state) => state.setDrafts);
  const selectDraft = useDraftStore((state) => state.selectDraft);
  const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;
  const runtimeFolders = useMemo(
    () =>
      folders.map((folder) =>
        folder.role === 'drafts'
          ? {
              ...folder,
              total_count: drafts.length
            }
          : folder
      ),
    [drafts.length, folders]
  );
  const accountId = composerAccountId;
  const defaultSignature = useMemo(
    () => resolveSignatureForAccount(signatures, defaultSignatureId, defaultSignatureIdsByAccountId, accountId),
    [accountId, defaultSignatureId, defaultSignatureIdsByAccountId, signatures]
  );
  const activeSavedDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) ?? null,
    [activeDraftId, drafts]
  );
  const draftThreads = useMemo(
    () =>
      drafts
        .filter((draft) => draft.accountId === accountId)
        .sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime())
        .map((draft) => ({
          id: draft.id,
          subject: draft.subject.trim() || '(no subject)',
          snippet: stripHtmlPreview(draft.body) || 'Draft in progress',
          participants: draft.to.length ? draft.to : ['Draft'],
          isUnread: false,
          isStarred: false,
          hasAttachments: false,
          messageCount: 1,
          lastMessageAt: draft.updatedAt
        })),
    [accountId, drafts]
  );
  const isDraftsFolder = activeFolder?.role === 'drafts';
  const isScheduledFolder = activeFolder?.id === SCHEDULED_FOLDER_ID || activeFolder?.role === 'scheduled';
  const isRemindersFolder = activeFolder?.id === REMINDERS_FOLDER_ID || activeFolder?.role === 'reminders';
  const visibleThreads = isDraftsFolder
    ? draftThreads
    : isScheduledFolder
      ? scheduledThreads
      : isRemindersFolder
        ? reminderThreads
        : threads;
  const visibleSelectedThreadId = isDraftsFolder
    ? selectedDraftThreadId
    : isScheduledFolder
      ? selectedScheduledThreadId
      : isRemindersFolder
        ? selectedThreadId
      : selectedThreadId;
  const resetComposerState = useCallback(() => {
    setIsComposerOpen(false);
    setComposerInitialDraft(undefined);
    setComposerDraftId(null);
    setComposerLiveDraft(null);
  }, []);
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
  const handleAutoSaveDraft = useCallback((draftId: string, draft: ComposerDraft) => {
    const savedDraft = {
      id: draftId,
      accountId: draft.fromAccountId,
      bcc: draft.bcc,
      body: draft.body,
      cc: draft.cc,
      fromAccountId: draft.fromAccountId,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      subject: draft.subject,
      to: draft.to,
      updatedAt: new Date().toISOString()
    };

    editDraft(savedDraft);
    void saveDraftToBackend(savedDraft).catch(() => {
      setShortcutStatusLabel('Draft saved locally only');
    });
    setShortcutStatusLabel('Draft saved locally');
  }, [editDraft]);
  useDraftAutoSave(composerDraftId, composerLiveDraft, isComposerOpen, handleAutoSaveDraft);

  useEffect(() => {
    if (!tauriRuntime.isAvailable() || !accountId) {
      return;
    }

    void hydrateDraftStore(accountId).catch(() => {
      setDrafts([]);
    });
  }, [accountId, setDrafts]);

  const activeMessage = useMemo(() => {
    if (!messages.length) {
      return null;
    }

    return (
      messages.find((message) => message.id === selectedMessageId) ??
      [...messages].sort((first, second) => new Date(first.date).getTime() - new Date(second.date).getTime()).at(-1) ??
      null
    );
  }, [messages, selectedMessageId]);
  const workspaceStyle = {
    '--thread-panel-width': `${threadPanelWidth}%`
  } as CSSProperties;
  const openComposerWithDraft = useCallback((draft?: Partial<ComposerDraft>) => {
    setSidebarCollapsed(false);
    if (!draft && activeSavedDraft) {
      selectDraft(activeSavedDraft.id);
      setComposerDraftId(activeSavedDraft.id);
      setComposerInitialDraft({
        attachments: [],
        bcc: activeSavedDraft.bcc,
        body: activeSavedDraft.body,
        cc: activeSavedDraft.cc,
        fromAccountId: activeSavedDraft.fromAccountId,
        inReplyTo: activeSavedDraft.inReplyTo,
        references: activeSavedDraft.references,
        subject: activeSavedDraft.subject,
        to: activeSavedDraft.to
      });
      setComposerLiveDraft(null);
      setIsComposerOpen(true);
      return;
    }

    const nextDraftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    selectDraft(nextDraftId);
    setComposerDraftId(nextDraftId);
    setComposerInitialDraft(
      draft
        ? {
            fromAccountId: composerAccountId,
            ...draft
          }
        : {
            body: applySignatureHtml('', defaultSignature?.body ?? null),
            fromAccountId: composerAccountId
          }
    );
    setComposerLiveDraft(null);
    setIsComposerOpen(true);
  }, [activeSavedDraft, composerAccountId, defaultSignature?.body, selectDraft, setSidebarCollapsed]);
  const openComposerFromSavedDraft = useCallback((savedDraft: typeof activeSavedDraft) => {
    if (!savedDraft) {
      openComposerWithDraft(undefined);
      return;
    }

    selectDraft(savedDraft.id);
    setComposerDraftId(savedDraft.id);
    setComposerInitialDraft({
      attachments: [],
      bcc: savedDraft.bcc,
      body: savedDraft.body,
      cc: savedDraft.cc,
      fromAccountId: savedDraft.fromAccountId,
      inReplyTo: savedDraft.inReplyTo,
      references: savedDraft.references,
      subject: savedDraft.subject,
      to: savedDraft.to
    });
    setComposerLiveDraft(null);
    setIsComposerOpen(true);
    setSelectedDraftThreadId(savedDraft.id);
  }, [openComposerWithDraft, selectDraft]);
  const toggleComposer = () => {
    if (isComposerOpen) {
      resetComposerState();
      return;
    }

    openComposerWithDraft(undefined);
  };
  useAppShellEvents({
    onComposeNew: () => openComposerWithDraft(undefined)
  });
  const toggleSidebarAndCloseComposer = () => {
    toggleSidebar();
    resetComposerState();
  };
  const handleReplyMessage = useCallback((message: MessageRecord, replyAll: boolean) => {
    openComposerWithDraft(prepareReplyDraft(message, replyAll));
    setShortcutStatusLabel(replyAll ? 'Reply all draft ready' : 'Reply draft ready');
  }, [openComposerWithDraft]);
  useEffect(() => {
    if (!isDraftsFolder) {
      setSelectedDraftThreadId(null);
      return;
    }

    setSelectedDraftThreadId((current) =>
      current && draftThreads.some((draft) => draft.id === current) ? current : draftThreads[0]?.id ?? null
    );
  }, [draftThreads, isDraftsFolder]);
  useEffect(() => {
    if (!isScheduledFolder) {
      setSelectedScheduledThreadId(null);
      return;
    }

    setSelectedScheduledThreadId((current) =>
      current && scheduledThreads.some((scheduledThread) => scheduledThread.id === current)
        ? current
        : scheduledThreads[0]?.id ?? null
    );
  }, [isScheduledFolder, scheduledThreads]);
  const handleForwardMessage = useCallback((message: MessageRecord) => {
    openComposerWithDraft(prepareForwardDraft(message));
    setShortcutStatusLabel('Forward draft ready');
  }, [openComposerWithDraft]);
  const handlePrintMessage = useCallback((message: MessageRecord) => {
    const opened = printMessage(message);
    setShortcutStatusLabel(opened ? 'Print dialog opened' : 'Print dialog blocked');
  }, []);
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
      'compose.new': () => openComposerWithDraft(undefined),
      'compose.newWindow': () => openComposerWithDraft(undefined),
      'compose.send': () => setShortcutStatusLabel('Composer send shortcut ready'),
      'nav.drafts': () => selectSystemFolder('drafts'),
      'nav.inbox': () => selectSystemFolder('inbox'),
      'nav.sent': () => selectSystemFolder('sent'),
      'preferences.open': onOpenPreferences,
      'search.focus': () => searchInputRef.current?.focus(),
      'thread.archive': () => runSelectedThreadAction('archive', 'Archive shortcut applied'),
      'thread.forward': () => {
        if (!activeMessage) {
          reportThreadShortcut('Forward shortcut queued');
          return;
        }

        handleForwardMessage(activeMessage);
      },
      'thread.label': () => openSelectedThreadDialog('label', 'Label shortcut opened'),
      'thread.move': () => openSelectedThreadDialog('move', 'Move shortcut opened'),
      'thread.next': () => selectThreadByOffset(1),
      'thread.print': () => {
        if (!activeMessage) {
          reportThreadShortcut('Print shortcut queued');
          return;
        }

        handlePrintMessage(activeMessage);
      },
      'thread.prev': () => selectThreadByOffset(-1),
      'thread.reply': () => {
        if (!activeMessage) {
          reportThreadShortcut('Reply shortcut queued');
          return;
        }

        handleReplyMessage(activeMessage, false);
      },
      'thread.replyAll': () => {
        if (!activeMessage) {
          reportThreadShortcut('Reply all shortcut queued');
          return;
        }

        handleReplyMessage(activeMessage, true);
      },
      'thread.star': () => runSelectedThreadAction('star', 'Star shortcut applied'),
      'thread.snooze': () => openSelectedThreadDialog('snooze', 'Snooze shortcut opened'),
      'thread.trash': () => runSelectedThreadAction('trash', 'Trash shortcut applied'),
      'ui.back': () => {
        resetComposerState();
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
    activeMessage,
    handleForwardMessage,
    handlePrintMessage,
    handleReplyMessage,
    openComposerWithDraft,
    openSelectedThreadDialog,
    reportThreadShortcut,
    runSelectedThreadAction,
    runUndoShortcut,
    resetComposerState,
    onOpenPreferences,
    selectSystemFolder,
    selectThreadByOffset,
    shortcutBindings
  ]);

  useKeyboardShortcuts(shortcutMap);

  useEffect(() => {
    setVisibleComposerToast(composerToast);

    if (!composerToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setVisibleComposerToast(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [composerToast]);

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
      <SectionErrorBoundary title="Sidebar">
        <MailSidebar
          activeFolderId={activeFolderId}
          accounts={accounts}
          activeAccountId={composerAccountId}
          folders={runtimeFolders}
          isCollapsed={isSidebarCollapsed}
          isComposerOpen={isComposerOpen}
          isOutboxBusy={isOutboxBusy}
          outboxStatus={outboxStatus}
          onAddAccount={onAddAccount}
          onFlushOutbox={onFlushOutbox}
          onOpenPreferences={onOpenPreferences}
          onSelectFolder={onSelectFolder}
          syncStatusByAccountId={syncStatusByAccountId}
          onToggleComposer={toggleComposer}
          onToggleSidebar={toggleSidebarAndCloseComposer}
        />
      </SectionErrorBoundary>

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

        {isComposerOpen ? (
          <SectionErrorBoundary title="Composer">
            <Composer
              contacts={contacts}
              fromOptions={composerAccounts}
              initialDraft={composerInitialDraft}
              isSending={isOutboxBusy}
              recipientSuggestions={recipientSuggestions}
              status={outboxStatus}
              onClose={resetComposerState}
              onDiscard={() => {
                if (composerDraftId) {
                  removeDraft(composerDraftId);
                  void deleteDraftFromBackend(composerAccountId, composerDraftId).catch(() => {
                    setShortcutStatusLabel('Draft removed locally only');
                  });
                }
                selectDraft(null);
                resetComposerState();
              }}
              onDraftChange={setComposerLiveDraft}
              onFlushOutbox={onFlushOutbox}
              onSchedule={async (draft, sendAt) => {
                const didSchedule = await onScheduleDraft(draft, sendAt);
                if (didSchedule) {
                  if (composerDraftId) {
                    removeDraft(composerDraftId);
                    void deleteDraftFromBackend(composerAccountId, composerDraftId).catch(() => {
                      setShortcutStatusLabel('Scheduled message, but draft cleanup stayed local');
                    });
                  }
                  selectDraft(null);
                  resetComposerState();
                }
                return didSchedule;
              }}
              onSend={async (draft, remindAt) => {
                const didQueue = await onSendDraft(draft, remindAt);
                if (didQueue) {
                  if (composerDraftId) {
                    removeDraft(composerDraftId);
                    void deleteDraftFromBackend(composerAccountId, composerDraftId).catch(() => {
                      setShortcutStatusLabel('Queued message, but draft cleanup stayed local');
                    });
                  }
                  selectDraft(null);
                  resetComposerState();
                }
                return didQueue;
              }}
            />
          </SectionErrorBoundary>
        ) : null}

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
          <SectionErrorBoundary title="Thread list">
            <ThreadListPanel
              activeFolderId={activeFolder?.id ?? null}
              activeFolderName={activeFolder?.name ?? null}
              dialogRequest={threadDialogRequest}
              folders={runtimeFolders}
              hasMore={hasMoreThreads}
              isReminderFolder={isRemindersFolder}
              isSearchActive={isSearchActive}
              isLoading={isThreadsLoading}
              isScheduledFolder={isScheduledFolder}
              onApplyLabels={onApplyLabels}
              onCancelReminders={onCancelReminders}
              onCancelScheduledSends={onCancelScheduledSends}
              onLoadMore={onLoadMoreThreads}
              onMoveThreads={onMoveThreads}
              onSnoozeThreads={onSnoozeThreads}
              onUnsnoozeThreads={onUnsnoozeThreads}
              onThreadAction={onThreadAction}
              searchQuery={searchQuery}
              selectedThreadId={visibleSelectedThreadId}
              threads={visibleThreads}
              onSelectThread={(threadId) => {
                if (isDraftsFolder) {
                  const savedDraft = drafts.find((draft) => draft.id === threadId) ?? null;
                  if (!savedDraft) {
                    return;
                  }

                  setSelectedDraftThreadId(threadId);
                  openComposerFromSavedDraft(savedDraft);
                  setShortcutStatusLabel('Draft restored');
                  return;
                }

                if (isScheduledFolder) {
                  setSelectedScheduledThreadId(threadId);
                  void onRestoreScheduledDraft(threadId).then((restoredDraft) => {
                    if (!restoredDraft) {
                      return;
                    }

                    openComposerWithDraft(restoredDraft);
                    setShortcutStatusLabel('Scheduled draft restored');
                  });
                  return;
                }

                if (isRemindersFolder) {
                  onSelectThread(threadId);
                  return;
                }

                onSelectThread(threadId);
              }}
            />
          </SectionErrorBoundary>

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

          <SectionErrorBoundary title="Message reader">
            <MessageReaderPanel
              contacts={contacts}
              isMessagesLoading={isScheduledFolder ? false : isMessagesLoading}
              messages={isScheduledFolder ? [] : messages}
              selectedMessageId={selectedMessageId}
              selectedThread={isScheduledFolder ? null : selectedThread}
              onForwardMessage={handleForwardMessage}
              onOpenExternalLink={onOpenExternalLink}
              onPrintMessage={handlePrintMessage}
              onReplyAllMessage={(message) => handleReplyMessage(message, true)}
              onReplyMessage={(message) => handleReplyMessage(message, false)}
              onSelectMessage={onSelectMessage}
              onDownloadAttachment={onDownloadAttachment}
              resolveInlineImageUrl={resolveInlineImageUrl}
            />
          </SectionErrorBoundary>
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
        {visibleComposerToast ? (
          <div
            aria-label="Composer notification"
            className={['undo-toast', 'composer-toast', `composer-toast-${visibleComposerToast.kind}`].join(' ')}
            role={visibleComposerToast.kind === 'error' ? 'alert' : 'status'}
          >
            <span>{visibleComposerToast.message}</span>
          </div>
        ) : null}
      </main>
    </div>
  );
};
