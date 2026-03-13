import { useDeferredValue, useEffect, useState } from 'react';
import { ShellFrame } from '@components/layout/ShellFrame';
import { useFolderThreads } from '@hooks/useFolderThreads';
import { useBackendHealth } from '@hooks/useBackendHealth';
import { useDomainEvents } from '@hooks/useDomainEvents';
import { useMessageDetail } from '@hooks/useMessageDetail';
import { useMailboxOverview } from '@hooks/useMailboxOverview';
import { useSearchThreads } from '@hooks/useSearchThreads';
import { useSyncStatusDetail } from '@hooks/useSyncStatusDetail';
import { useThreadMessages } from '@hooks/useThreadMessages';

const App = () => {
  useDomainEvents();
  const { data, isLoading, isError } = useBackendHealth();
  const mailboxQuery = useMailboxOverview();
  const mailbox = mailboxQuery.data;
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
  const threads =
    (isSearchActive ? searchThreadsQuery.data : folderThreadsQuery.data) ?? mailbox?.threads ?? [];
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const messagesQuery = useThreadMessages(selectedThread?.id ?? null);
  const messageDetailQuery = useMessageDetail(selectedMessageId);
  const syncStatusDetailQuery = useSyncStatusDetail(mailbox?.accountId ?? null);

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
    />
  );
};

export default App;
