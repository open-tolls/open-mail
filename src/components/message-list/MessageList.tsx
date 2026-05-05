import { useMemo } from 'react';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';
import type { AttachmentRecord, MessageRecord } from '@lib/contracts';
import { MessageItem } from '@components/message-list/MessageItem';
import { sortMessagesChronologically } from '@components/message-list/messageListUtils';

type MessageListProps = {
  contacts?: ContactDirectoryEntry[];
  messages: MessageRecord[];
  selectedMessageId: string | null;
  threadSubject: string;
  onDownloadAttachment?: (attachment: AttachmentRecord) => void;
  onForward?: (message: MessageRecord) => void;
  onReply?: (message: MessageRecord) => void;
  onReplyAll?: (message: MessageRecord) => void;
  onSelectMessage: (messageId: string) => void;
  onOpenExternalLink?: (url: string) => void;
  resolveInlineImageUrl?: (localPath: string) => string;
};

export const MessageList = ({
  contacts = [],
  messages,
  selectedMessageId,
  threadSubject,
  onDownloadAttachment,
  onForward,
  onReply,
  onReplyAll,
  onSelectMessage,
  onOpenExternalLink,
  resolveInlineImageUrl
}: MessageListProps) => {
  const chronologicalMessages = useMemo(() => sortMessagesChronologically(messages), [messages]);
  const latestMessage = chronologicalMessages.at(-1) ?? null;
  const latestMessageId = latestMessage?.id ?? null;
  const expandedMessageId = selectedMessageId ?? latestMessageId;

  if (!chronologicalMessages.length) {
    return <p className="reader-empty">This thread has no messages yet.</p>;
  }

  return (
    <div className="message-list">
      <p className="message-list-subject">{threadSubject}</p>
      <div className="message-stack">
        {chronologicalMessages.map((message) => (
          <MessageItem
            contacts={contacts}
            defaultExpanded={message.id === expandedMessageId}
            isSelected={message.id === selectedMessageId}
            key={message.id}
            message={message}
            onDownloadAttachment={onDownloadAttachment}
            onForward={onForward}
            onOpenExternalLink={onOpenExternalLink}
            onReply={onReply}
            onReplyAll={onReplyAll}
            onSelectMessage={onSelectMessage}
            resolveInlineImageUrl={resolveInlineImageUrl}
          />
        ))}
      </div>
      <div className="quick-reply-card">
        <strong>Quick reply</strong>
        <p>Jump into the composer with the latest message already quoted.</p>
        <div className="quick-reply-actions">
          <button disabled={!latestMessage} onClick={() => latestMessage && onReply?.(latestMessage)} type="button">
            Reply
          </button>
          <button disabled={!latestMessage} onClick={() => latestMessage && onReplyAll?.(latestMessage)} type="button">
            Reply all
          </button>
        </div>
      </div>
    </div>
  );
};
