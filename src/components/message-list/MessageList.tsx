import { useMemo } from 'react';
import type { AttachmentRecord, MessageRecord } from '@lib/contracts';
import { MessageItem } from '@components/message-list/MessageItem';
import { sortMessagesChronologically } from '@components/message-list/messageListUtils';

type MessageListProps = {
  messages: MessageRecord[];
  selectedMessageId: string | null;
  threadSubject: string;
  onDownloadAttachment?: (attachment: AttachmentRecord) => void;
  onSelectMessage: (messageId: string) => void;
  onOpenExternalLink?: (url: string) => void;
  resolveInlineImageUrl?: (localPath: string) => string;
};

export const MessageList = ({
  messages,
  selectedMessageId,
  threadSubject,
  onDownloadAttachment,
  onSelectMessage,
  onOpenExternalLink,
  resolveInlineImageUrl
}: MessageListProps) => {
  const chronologicalMessages = useMemo(() => sortMessagesChronologically(messages), [messages]);
  const latestMessageId = chronologicalMessages.at(-1)?.id ?? null;
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
            defaultExpanded={message.id === expandedMessageId}
            isSelected={message.id === selectedMessageId}
            key={message.id}
            message={message}
            onDownloadAttachment={onDownloadAttachment}
            onOpenExternalLink={onOpenExternalLink}
            onSelectMessage={onSelectMessage}
            resolveInlineImageUrl={resolveInlineImageUrl}
          />
        ))}
      </div>
      <div className="quick-reply-card">
        <strong>Quick reply</strong>
        <p>Composer integration lands in Phase 5.</p>
      </div>
    </div>
  );
};
