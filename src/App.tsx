import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { save } from '@tauri-apps/plugin-dialog';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router';
import type { ComposerDraft } from '@components/composer/Composer';
import { ComponentGallery } from '@components/dev/ComponentGallery';
import { ShellFrame } from '@components/layout/ShellFrame';
import { OnboardingView } from '@components/onboarding/OnboardingView';
import { useBackendHealth } from '@hooks/useBackendHealth';
import { useDomainEvents } from '@hooks/useDomainEvents';
import { useMailboxOverview } from '@hooks/useMailboxOverview';
import { useSearchThreads } from '@hooks/useSearchThreads';
import { useSyncStatusDetail } from '@hooks/useSyncStatusDetail';
import { useThreadMessages } from '@hooks/useThreadMessages';
import { useThreads } from '@hooks/useThreads';
import { downloadAttachment } from '@lib/attachment-download';
import { autoMarkVisibleMessagesRead } from '@lib/auto-mark-read';
import type { AttachmentRecord, EnqueueOutboxMessageRequest, OutboxMessage, OutboxSendReport, ThreadRecord } from '@lib/contracts';
import { applyTheme } from '@lib/themes';
import { api, tauriRuntime } from '@lib/tauri-bridge';
import { useAccountStore } from '@stores/useAccountStore';
import { hydrateSignatureStore } from '@stores/useSignatureStore';
import { type StoreThreadAction, useThreadStore } from '@stores/useThreadStore';
import { useUndoStore } from '@stores/useUndoStore';
import { useUIStore } from '@stores/useUIStore';

type ComposerToast = {
  kind: 'success' | 'error';
  message: string;
};

const htmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const toSafeHtml = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[&<>"']/g, (character) => htmlEscapeMap[character] ?? character))
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');

const toMailAddresses = (emails: string[]) => emails.map((email) => ({ name: null, email }));
const toErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');
const readFileBytes = async (file: File) => {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }

  if (typeof Blob !== 'undefined' && file instanceof Blob) {
    return new Uint8Array(await new Response(file).arrayBuffer());
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read attachment'));
    reader.onload = () => {
      const result = reader.result;

      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('Unexpected attachment payload'));
        return;
      }

      resolve(new Uint8Array(result));
    };
    reader.readAsArrayBuffer(file);
  });
};

const readForwardedAttachmentBytes = async (localPath: string) => {
  const assetUrl = api.system.toAssetUrl(localPath);
  const response = await fetch(assetUrl);

  if (!response.ok) {
    throw new Error(`Failed to read forwarded attachment from ${localPath}`);
  }

  return new Uint8Array(await response.arrayBuffer());
};

const toMimeAttachments = async (attachments: ComposerDraft['attachments']) =>
  Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.kind === 'file') {
        return {
          filename: attachment.name,
          contentType: attachment.contentType,
          data: Array.from(await readFileBytes(attachment.file)),
          isInline: false,
          contentId: null
        };
      }

      if (!attachment.localPath) {
        throw new Error(`Attachment ${attachment.name} is not available locally`);
      }

      return {
        filename: attachment.name,
        contentType: attachment.contentType,
        data: Array.from(await readForwardedAttachmentBytes(attachment.localPath)),
        isInline: attachment.isInline,
        contentId: attachment.contentId
      };
    })
  );

const htmlToPlainText = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

const toLocalSentThreadRecord = (message: OutboxMessage): ThreadRecord => {
  const primaryRecipient = message.mimeMessage.to[0]?.email ?? 'Draft';
  const sentAt = new Date().toISOString();

  return {
    id: `thr_sent_${message.id}`,
    account_id: message.accountId,
    subject: message.mimeMessage.subject.trim() || '(no subject)',
    snippet: message.mimeMessage.plainBody?.trim() || 'Sent from Open Mail composer',
    message_count: 1,
    participant_ids: [primaryRecipient],
    folder_ids: ['fld_sent'],
    label_ids: [],
    has_attachments: message.mimeMessage.attachments.length > 0,
    is_unread: false,
    is_starred: false,
    last_message_at: sentAt,
    last_message_sent_at: sentAt,
    created_at: sentAt,
    updated_at: sentAt
  };
};

const useApplySelectedTheme = () => {
  const themeId = useUIStore((state) => state.themeId);

  useEffect(() => {
    const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => applyTheme(themeId, colorSchemeQuery.matches);

    syncTheme();
    colorSchemeQuery.addEventListener('change', syncTheme);

    return () => {
      colorSchemeQuery.removeEventListener('change', syncTheme);
    };
  }, [themeId]);
};

const MailShell = () => {
  const { folderId, threadId } = useParams<{ folderId?: string; threadId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useDomainEvents();
  const { data, isLoading, isError } = useBackendHealth();
  const mailboxQuery = useMailboxOverview();
  const mailbox = mailboxQuery.data;
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [outboxStatus, setOutboxStatus] = useState('Composer ready');
  const [composerToast, setComposerToast] = useState<ComposerToast | null>(null);
  const [, setQueuedOutboxMessages] = useState<OutboxMessage[]>([]);
  const [localSentThreadRecords, setLocalSentThreadRecords] = useState<ThreadRecord[]>([]);
  const accounts = useAccountStore((state) => state.accounts);
  const selectedAccountId = useAccountStore((state) => state.selectedAccountId);
  const upsertAccount = useAccountStore((state) => state.upsertAccount);
  const applyThreadAction = useThreadStore((state) => state.applyThreadAction);
  const applyThreadLabels = useThreadStore((state) => state.applyThreadLabels);
  const createThreadSnapshot = useThreadStore((state) => state.createThreadSnapshot);
  const moveThreadsToFolder = useThreadStore((state) => state.moveThreadsToFolder);
  const restoreThreadSnapshot = useThreadStore((state) => state.restoreThreadSnapshot);
  const updateThread = useThreadStore((state) => state.updateThread);
  const pushUndo = useUndoStore((state) => state.push);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const runtimeAllThreads = useMemo(
    () => [...localSentThreadRecords, ...(mailbox?.allThreads ?? [])],
    [localSentThreadRecords, mailbox?.allThreads]
  );
  const runtimeFolders = useMemo(
    () =>
      (mailbox?.folders ?? []).map((folder) =>
        folder.role === 'sent'
          ? {
              ...folder,
              total_count: folder.total_count + localSentThreadRecords.length
            }
          : folder
      ),
    [localSentThreadRecords.length, mailbox?.folders]
  );
  const folderThreadsQuery = useThreads({
    accountId: mailbox?.accountId ?? null,
    folderId: selectedFolderId,
    fallbackThreads: runtimeAllThreads
  });
  const searchThreadsQuery = useSearchThreads(
    mailbox?.accountId ?? null,
    deferredSearchQuery,
    runtimeAllThreads
  );
  const isSearchActive = deferredSearchQuery.trim().length > 0;
  const routeFolderId = useMemo(() => {
    if (!mailbox?.folders.length || !folderId) {
      return null;
    }

    const normalizedFolderId = folderId.toLowerCase();
    return (
      mailbox.folders.find(
        (folder) =>
          folder.id === folderId ||
          folder.role === normalizedFolderId ||
          folder.name.toLowerCase() === normalizedFolderId
      )?.id ?? null
    );
  }, [folderId, mailbox?.folders]);
  const threads = useMemo(
    () => (isSearchActive ? searchThreadsQuery.data : folderThreadsQuery.threads) ?? mailbox?.threads ?? [],
    [folderThreadsQuery.threads, isSearchActive, mailbox?.threads, searchThreadsQuery.data]
  );
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const recipientSuggestions = useMemo(
    () => Array.from(new Set(runtimeAllThreads.flatMap((thread) => thread.participant_ids))).sort(),
    [runtimeAllThreads]
  );
  const fallbackComposerAccount = useMemo(
    () => ({
      id: mailbox?.accountId ?? 'acc_demo',
      provider: 'Gmail' as const,
      email: 'leco@example.com',
      displayName: 'Open Mail Demo'
    }),
    [mailbox?.accountId]
  );
  const composerAccounts = accounts.length ? accounts : [fallbackComposerAccount];
  const selectedComposerAccount = composerAccounts.find((account) => account.id === selectedAccountId) ?? composerAccounts[0];
  const messagesQuery = useThreadMessages(selectedThread?.id ?? null);
  const syncStatusDetailQuery = useSyncStatusDetail(mailbox?.accountId ?? null);

  useEffect(() => {
    if (!mailbox?.accountId) {
      return;
    }

    upsertAccount({
      id: mailbox.accountId,
      provider: 'Gmail',
      email: 'leco@example.com',
      displayName: 'Open Mail Demo'
    });
  }, [mailbox?.accountId, upsertAccount]);

  useEffect(() => {
    void hydrateSignatureStore().catch(() => {
      setOutboxStatus('Could not load saved signatures');
    });
  }, []);
  const enqueueOutboxMutation = useMutation({
    mutationFn: async (draft: ComposerDraft): Promise<OutboxMessage> => {
      const accountId = draft.fromAccountId || selectedComposerAccount.id;
      const fromAccount = composerAccounts.find((account) => account.id === accountId) ?? selectedComposerAccount;
      const request: EnqueueOutboxMessageRequest = {
        accountId,
        from: { name: fromAccount.displayName, email: fromAccount.email },
        to: toMailAddresses(draft.to),
        cc: toMailAddresses(draft.cc),
        bcc: toMailAddresses(draft.bcc),
        replyTo: null,
        subject: draft.subject,
        htmlBody: draft.body.trim().startsWith('<') ? draft.body : toSafeHtml(draft.body),
        plainBody: htmlToPlainText(draft.body),
        inReplyTo: draft.inReplyTo,
        references: draft.references,
        attachments: await toMimeAttachments(draft.attachments)
      };

      if (!tauriRuntime.isAvailable()) {
        return {
          id: `web_out_${Date.now()}`,
          accountId,
          mimeMessage: request,
          status: 'queued',
          retryCount: 0,
          lastError: null,
          queuedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }

      return api.outbox.enqueue(request);
    }
  });
  const flushOutboxMutation = useMutation({
    mutationFn: async (): Promise<OutboxSendReport> => {
      const accountId = mailbox?.accountId ?? 'acc_demo';

      if (!tauriRuntime.isAvailable()) {
        return { accountId, attempted: 1, sent: 1, failed: 0 };
      }

      return api.outbox.flush(accountId);
    }
  });

  useEffect(() => {
    if (!mailbox?.folders.length) {
      setSelectedFolderId(null);
      return;
    }

    setSelectedFolderId((currentFolderId) => {
      if (routeFolderId) {
        return routeFolderId;
      }

      return currentFolderId && mailbox.folders.some((folder) => folder.id === currentFolderId)
        ? currentFolderId
        : mailbox.activeFolder;
    });
  }, [mailbox, routeFolderId]);

  useEffect(() => {
    if (!threads.length) {
      setSelectedThreadId(null);
      setSelectedMessageId(null);
      return;
    }

    setSelectedThreadId((currentThreadId) => {
      if (threadId && threads.some((thread) => thread.id === threadId)) {
        return threadId;
      }

      return currentThreadId && threads.some((thread) => thread.id === currentThreadId)
        ? currentThreadId
        : threads[0].id;
    });
  }, [threadId, threads]);

  useEffect(() => {
    const messages = messagesQuery.data ?? [];

    if (!messages.length) {
      setSelectedMessageId(null);
      return;
    }

    setSelectedMessageId((currentMessageId) =>
      currentMessageId && messages.some((message) => message.id === currentMessageId)
        ? currentMessageId
        : messages[0].id
    );
  }, [messagesQuery.data]);

  useEffect(() => {
    const messages = messagesQuery.data ?? [];

    if (!messages.length) {
      return;
    }

    void autoMarkVisibleMessagesRead(messages, {
      isDesktopRuntime: tauriRuntime.isAvailable(),
      markRead: api.messages.markRead
    })
      .then((updatedMessageIds) => {
        if (!updatedMessageIds.length) {
          return;
        }

        if (selectedThread) {
          updateThread(selectedThread.id, { isUnread: false });
        }

        void queryClient.invalidateQueries({ queryKey: ['mailbox-overview'] });
        void queryClient.invalidateQueries({ queryKey: ['thread-messages', selectedThread?.id ?? null] });
        void queryClient.invalidateQueries({ queryKey: ['folder-threads'] });
        void queryClient.invalidateQueries({ queryKey: ['sync-status-detail'] });
      })
      .catch(() => {
        setOutboxStatus('Could not mark visible messages as read');
      });
  }, [messagesQuery.data, queryClient, selectedThread, updateThread]);

  const handleSendDraft = async (draft: ComposerDraft) => {
    try {
      setOutboxStatus('Queueing message...');
      const queued = await enqueueOutboxMutation.mutateAsync(draft);
      setQueuedOutboxMessages((current) => [...current, queued]);
      const successMessage = `Queued ${queued.mimeMessage.to.length} recipient(s)`;
      setOutboxStatus(successMessage);
      setComposerToast({ kind: 'success', message: successMessage });
      return true;
    } catch (error) {
      const errorMessage = `Could not queue message: ${toErrorMessage(error)}`;
      setOutboxStatus(errorMessage);
      setComposerToast({ kind: 'error', message: errorMessage });
      return false;
    }
  };

  const handleFlushOutbox = async () => {
    try {
      setOutboxStatus('Sending queued mail...');
      const report = await flushOutboxMutation.mutateAsync();
      setQueuedOutboxMessages((current) => {
        const sentMessages = current.slice(0, report.sent);
        if (sentMessages.length) {
          setLocalSentThreadRecords((existing) => [
            ...sentMessages.map(toLocalSentThreadRecord),
            ...existing
          ]);
        }

        return current.slice(report.sent);
      });
      const successMessage = `Sent ${report.sent}/${report.attempted}; failed ${report.failed}`;
      setOutboxStatus(successMessage);
      setComposerToast({ kind: 'success', message: successMessage });
    } catch (error) {
      const errorMessage = `Could not flush outbox: ${toErrorMessage(error)}`;
      setOutboxStatus(errorMessage);
      setComposerToast({ kind: 'error', message: errorMessage });
    }
  };
  const getFolderRouteSegment = (folderIdToRoute: string) => {
    const folder = mailbox?.folders.find((candidate) => candidate.id === folderIdToRoute);
    return folder?.role ?? folder?.id ?? folderIdToRoute;
  };
  const handleSelectFolder = (nextFolderId: string) => {
    setSelectedFolderId(nextFolderId);
    navigate(`/${getFolderRouteSegment(nextFolderId)}`);
  };
  const handleSelectThread = (nextThreadId: string) => {
    setSelectedThreadId(nextThreadId);
    const folderSegment = selectedFolderId ? getFolderRouteSegment(selectedFolderId) : 'inbox';
    navigate(`/${folderSegment}/${nextThreadId}`);
  };
  const pushThreadUndo = (description: string) => {
    const snapshot = createThreadSnapshot();

    pushUndo({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      description,
      timestamp: Date.now(),
      undo: () => {
        restoreThreadSnapshot(snapshot);
        setSelectedThreadId(snapshot.selectedThreadId);
      }
    });
  };
  const handleThreadAction = (action: StoreThreadAction, threadIds: string[]) => {
    pushThreadUndo('Thread action applied');
    applyThreadAction(action, threadIds);
  };
  const handleApplyLabels = (threadIds: string[], labelIds: string[]) => {
    pushThreadUndo('Labels applied');
    applyThreadLabels(threadIds, labelIds);
  };
  const handleMoveThreads = (threadIds: string[], folderId: string) => {
    pushThreadUndo('Thread moved');
    moveThreadsToFolder(threadIds, folderId);
  };
  const handleOpenExternalLink = (url: string) => {
    if (!tauriRuntime.isAvailable()) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    void api.system.openExternalUrl(url).catch(() => {
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  };
  const handleDownloadAttachment = (attachment: AttachmentRecord) => {
    if (!tauriRuntime.isAvailable()) {
      setOutboxStatus('Attachment download requires the desktop runtime');
      return;
    }

    setOutboxStatus(`Preparing ${attachment.filename}...`);
    void downloadAttachment(attachment, {
      saveAttachmentFile: api.attachments.download,
      showSaveDialog: (options) =>
        save({
          title: `Save ${attachment.filename}`,
          canCreateDirectories: true,
          ...options
        })
    })
      .then((result) => {
        if (result === 'saved') {
          setOutboxStatus(`Saved ${attachment.filename}`);
          return;
        }

        if (result === 'missing-local-file') {
          setOutboxStatus(`Attachment file unavailable: ${attachment.filename}`);
          return;
        }

        setOutboxStatus(`Download cancelled: ${attachment.filename}`);
      })
      .catch(() => {
        setOutboxStatus(`Could not save ${attachment.filename}`);
      });
  };
  const resolveInlineImageUrl = (localPath: string) => api.system.toAssetUrl(localPath);

  return (
    <ShellFrame
      backendStatus={
        isLoading ? 'Conectando ao backend Tauri...' : isError ? 'Modo web ativo' : data ?? 'Backend pronto'
      }
      folders={runtimeFolders}
      threads={threads}
      activeFolderId={selectedFolderId}
      searchQuery={searchQuery}
      isSearchActive={isSearchActive}
      selectedThreadId={selectedThread?.id ?? null}
      selectedThread={selectedThread}
      messages={messagesQuery.data ?? []}
      selectedMessageId={selectedMessageId}
      syncStatusDetail={syncStatusDetailQuery.data ?? null}
      outboxStatus={outboxStatus}
      composerToast={composerToast}
      composerAccounts={composerAccounts}
      composerAccountId={selectedComposerAccount.id}
      recipientSuggestions={recipientSuggestions}
      isOutboxBusy={enqueueOutboxMutation.isPending || flushOutboxMutation.isPending}
      isMessagesLoading={
        searchThreadsQuery.isLoading ||
        messagesQuery.isLoading ||
        syncStatusDetailQuery.isLoading
      }
      isThreadsLoading={folderThreadsQuery.isLoading || searchThreadsQuery.isLoading}
      hasMoreThreads={!isSearchActive && folderThreadsQuery.hasMore}
      onLoadMoreThreads={folderThreadsQuery.loadMore}
      onApplyLabels={handleApplyLabels}
      onMoveThreads={handleMoveThreads}
      onThreadAction={handleThreadAction}
      onSelectFolder={handleSelectFolder}
      onSearchQueryChange={setSearchQuery}
      onSelectThread={handleSelectThread}
      onSelectMessage={setSelectedMessageId}
      onOpenExternalLink={handleOpenExternalLink}
      onDownloadAttachment={handleDownloadAttachment}
      resolveInlineImageUrl={resolveInlineImageUrl}
      onSendDraft={handleSendDraft}
      onFlushOutbox={handleFlushOutbox}
    />
  );
};

const App = () => {
  useApplySelectedTheme();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MailShell />} path="/" />
        <Route element={<MailShell />} path="/search" />
        <Route element={<MailShell />} path="/compose" />
        <Route element={<OnboardingView />} path="/onboarding/*" />
        <Route element={<MailShell />} path="/:folderId" />
        <Route element={<MailShell />} path="/:folderId/:threadId" />
        <Route element={<ComponentGallery />} path="/dev" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
