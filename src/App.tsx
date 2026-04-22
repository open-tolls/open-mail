import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { save } from '@tauri-apps/plugin-dialog';
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router';
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
import type { AttachmentRecord, EnqueueOutboxMessageRequest, OutboxMessage, OutboxSendReport } from '@lib/contracts';
import { applyTheme } from '@lib/themes';
import { api, tauriRuntime } from '@lib/tauri-bridge';
import { type StoreThreadAction, useThreadStore } from '@stores/useThreadStore';
import { useUIStore } from '@stores/useUIStore';

type ComposeDraft = {
  to: string;
  subject: string;
  body: string;
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

const parseRecipients = (value: string) =>
  value
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ name: null, email }));

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
  const applyThreadAction = useThreadStore((state) => state.applyThreadAction);
  const applyThreadLabels = useThreadStore((state) => state.applyThreadLabels);
  const moveThreadsToFolder = useThreadStore((state) => state.moveThreadsToFolder);
  const updateThread = useThreadStore((state) => state.updateThread);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const folderThreadsQuery = useThreads({
    accountId: mailbox?.accountId ?? null,
    folderId: selectedFolderId,
    fallbackThreads: mailbox?.allThreads ?? []
  });
  const searchThreadsQuery = useSearchThreads(
    mailbox?.accountId ?? null,
    deferredSearchQuery,
    mailbox?.allThreads ?? []
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
  const messagesQuery = useThreadMessages(selectedThread?.id ?? null);
  const syncStatusDetailQuery = useSyncStatusDetail(mailbox?.accountId ?? null);
  const enqueueOutboxMutation = useMutation({
    mutationFn: async (draft: ComposeDraft): Promise<OutboxMessage> => {
      const accountId = mailbox?.accountId ?? 'acc_demo';
      const request: EnqueueOutboxMessageRequest = {
        accountId,
        from: { name: 'Open Mail', email: 'leco@example.com' },
        to: parseRecipients(draft.to),
        cc: [],
        bcc: [],
        replyTo: null,
        subject: draft.subject,
        htmlBody: toSafeHtml(draft.body),
        plainBody: draft.body,
        inReplyTo: null,
        references: [],
        attachments: []
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

  const handleSendDraft = async (draft: ComposeDraft) => {
    setOutboxStatus('Queueing message...');
    const queued = await enqueueOutboxMutation.mutateAsync(draft);
    setOutboxStatus(`Queued ${queued.mimeMessage.to.length} recipient(s)`);
  };

  const handleFlushOutbox = async () => {
    setOutboxStatus('Sending queued mail...');
    const report = await flushOutboxMutation.mutateAsync();
    setOutboxStatus(`Sent ${report.sent}/${report.attempted}; failed ${report.failed}`);
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
  const handleThreadAction = (action: StoreThreadAction, threadIds: string[]) => {
    applyThreadAction(action, threadIds);
  };
  const handleApplyLabels = (threadIds: string[], labelIds: string[]) => {
    applyThreadLabels(threadIds, labelIds);
  };
  const handleMoveThreads = (threadIds: string[], folderId: string) => {
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
      folders={mailbox?.folders ?? []}
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
