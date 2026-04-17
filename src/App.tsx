import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ShellFrame } from '@components/layout/ShellFrame';
import { useFolderThreads } from '@hooks/useFolderThreads';
import { useBackendHealth } from '@hooks/useBackendHealth';
import { useDomainEvents } from '@hooks/useDomainEvents';
import { useMessageDetail } from '@hooks/useMessageDetail';
import { useMailboxOverview } from '@hooks/useMailboxOverview';
import { useSearchThreads } from '@hooks/useSearchThreads';
import { useSyncStatusDetail } from '@hooks/useSyncStatusDetail';
import { useThreadMessages } from '@hooks/useThreadMessages';
import type { EnqueueOutboxMessageRequest, OutboxMessage, OutboxSendReport } from '@lib/contracts';
import { applyTheme } from '@lib/themes';
import { api, tauriRuntime } from '@lib/tauri-bridge';
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

const App = () => {
  useDomainEvents();
  const { data, isLoading, isError } = useBackendHealth();
  const mailboxQuery = useMailboxOverview();
  const mailbox = mailboxQuery.data;
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [outboxStatus, setOutboxStatus] = useState('Composer ready');
  const themeId = useUIStore((state) => state.themeId);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const folderThreadsQuery = useFolderThreads(
    mailbox?.accountId ?? null,
    selectedFolderId,
    mailbox?.allThreads ?? []
  );
  const searchThreadsQuery = useSearchThreads(
    mailbox?.accountId ?? null,
    deferredSearchQuery,
    mailbox?.allThreads ?? []
  );
  const isSearchActive = deferredSearchQuery.trim().length > 0;
  const threads = useMemo(
    () => (isSearchActive ? searchThreadsQuery.data : folderThreadsQuery.data) ?? mailbox?.threads ?? [],
    [folderThreadsQuery.data, isSearchActive, mailbox?.threads, searchThreadsQuery.data]
  );
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const messagesQuery = useThreadMessages(selectedThread?.id ?? null);
  const messageDetailQuery = useMessageDetail(selectedMessageId);
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
    const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => applyTheme(themeId, colorSchemeQuery.matches);

    syncTheme();
    colorSchemeQuery.addEventListener('change', syncTheme);

    return () => {
      colorSchemeQuery.removeEventListener('change', syncTheme);
    };
  }, [themeId]);

  useEffect(() => {
    if (!mailbox?.folders.length) {
      setSelectedFolderId(null);
      return;
    }

    setSelectedFolderId((currentFolderId) =>
      currentFolderId && mailbox.folders.some((folder) => folder.id === currentFolderId)
        ? currentFolderId
        : mailbox.activeFolder
    );
  }, [mailbox]);

  useEffect(() => {
    if (!threads.length) {
      setSelectedThreadId(null);
      setSelectedMessageId(null);
      return;
    }

    setSelectedThreadId((currentThreadId) =>
      currentThreadId && threads.some((thread) => thread.id === currentThreadId)
        ? currentThreadId
        : threads[0].id
    );
  }, [threads]);

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
      selectedMessage={messageDetailQuery.data ?? null}
      syncStatusDetail={syncStatusDetailQuery.data ?? null}
      outboxStatus={outboxStatus}
      isOutboxBusy={enqueueOutboxMutation.isPending || flushOutboxMutation.isPending}
      isMessagesLoading={
        folderThreadsQuery.isLoading ||
        searchThreadsQuery.isLoading ||
        messagesQuery.isLoading ||
        messageDetailQuery.isLoading ||
        syncStatusDetailQuery.isLoading
      }
      onSelectFolder={setSelectedFolderId}
      onSearchQueryChange={setSearchQuery}
      onSelectThread={setSelectedThreadId}
      onSelectMessage={setSelectedMessageId}
      onSendDraft={handleSendDraft}
      onFlushOutbox={handleFlushOutbox}
    />
  );
};

export default App;
