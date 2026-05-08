import { useEffect, useMemo, useState } from 'react';
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
  onPrint?: (message: MessageRecord) => void;
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
  onPrint,
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
  const [pendingFocusMessageId, setPendingFocusMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFocusMessageId) {
      return;
    }

    const nextFrame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-message-id="${pendingFocusMessageId}"]`);
      if (target) {
        target.focus();
        setPendingFocusMessageId(null);
      }
    });

    return () => {
      window.cancelAnimationFrame(nextFrame);
    };
  }, [pendingFocusMessageId, chronologicalMessages]);

  const navigateMessage = (messageId: string, direction: 'next' | 'previous' | 'first' | 'last') => {
    const currentIndex = chronologicalMessages.findIndex((message) => message.id === messageId);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? chronologicalMessages.length - 1
          : direction === 'next'
            ? Math.min(chronologicalMessages.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1);

    if (targetIndex === currentIndex) {
      return;
    }

    const targetMessage = chronologicalMessages[targetIndex];
    onSelectMessage(targetMessage.id);
    setPendingFocusMessageId(targetMessage.id);
  };

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
            onNavigate={navigateMessage}
            onDownloadAttachment={onDownloadAttachment}
            onForward={onForward}
            onOpenExternalLink={onOpenExternalLink}
            onPrint={onPrint}
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
