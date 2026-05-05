import { MessageList } from '@components/message-list/MessageList';
import { StatusBadge } from '@components/ui/StatusBadge';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';
import type { AttachmentRecord, MessageRecord, ThreadSummary } from '@lib/contracts';

type MessageReaderPanelProps = {
  contacts: ContactDirectoryEntry[];
  isMessagesLoading: boolean;
  messages: MessageRecord[];
  selectedMessageId: string | null;
  selectedThread: ThreadSummary | null;
  onForwardMessage: (message: MessageRecord) => void;
  onOpenExternalLink: (url: string) => void;
  onPrintMessage: (message: MessageRecord) => void;
  onReplyAllMessage: (message: MessageRecord) => void;
  onReplyMessage: (message: MessageRecord) => void;
  onSelectMessage: (messageId: string) => void;
  onDownloadAttachment: (attachment: AttachmentRecord) => void;
  resolveInlineImageUrl: (localPath: string) => string;
};

export const MessageReaderPanel = ({
  contacts,
  isMessagesLoading,
  messages,
  selectedMessageId,
  selectedThread,
  onForwardMessage,
  onOpenExternalLink,
  onPrintMessage,
  onReplyAllMessage,
  onReplyMessage,
  onSelectMessage,
  onDownloadAttachment,
  resolveInlineImageUrl
}: MessageReaderPanelProps) => {
  return (
    <aside className="insight-panel reader-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Thread reader</p>
          <h3>{selectedThread?.subject ?? 'Select a conversation'}</h3>
        </div>
        {selectedThread ? <StatusBadge label={`${messages.length} messages`} tone="neutral" /> : null}
      </div>

      {isMessagesLoading ? <p className="reader-empty">Carregando a thread selecionada...</p> : null}

      {!isMessagesLoading && !selectedThread ? (
        <p className="reader-empty">Selecione uma thread para ver o histórico completo da conversa.</p>
      ) : null}

      {!isMessagesLoading && selectedThread ? (
        <MessageList
          contacts={contacts}
          messages={messages}
          selectedMessageId={selectedMessageId}
          threadSubject={selectedThread.subject}
          onForward={onForwardMessage}
          onOpenExternalLink={onOpenExternalLink}
          onPrint={onPrintMessage}
          onReply={onReplyMessage}
          onReplyAll={onReplyAllMessage}
          onSelectMessage={onSelectMessage}
          onDownloadAttachment={onDownloadAttachment}
          resolveInlineImageUrl={resolveInlineImageUrl}
        />
      ) : null}
    </aside>
  );
};
