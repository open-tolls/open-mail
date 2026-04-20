import { useEffect, useState } from 'react';
import type { MessageRecord } from '@lib/contracts';
import { MessageActions } from '@components/message-list/MessageActions';
import { MessageAttachments } from '@components/message-list/MessageAttachments';
import { MessageBody } from '@components/message-list/MessageBody';
import { MessageCollapsed } from '@components/message-list/MessageCollapsed';
import { MessageHeader } from '@components/message-list/MessageHeader';

type MessageItemProps = {
  defaultExpanded: boolean;
  isSelected: boolean;
  message: MessageRecord;
  onOpenExternalLink?: (url: string) => void;
  onSelectMessage: (messageId: string) => void;
  resolveInlineImageUrl?: (localPath: string) => string;
};

export const MessageItem = ({
  defaultExpanded,
  isSelected,
  message,
  onOpenExternalLink,
  onSelectMessage,
  resolveInlineImageUrl
}: MessageItemProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded, message.id]);

  const expandMessage = () => {
    setIsExpanded(true);
    onSelectMessage(message.id);
  };

  if (!isExpanded) {
    return <MessageCollapsed message={message} onExpand={expandMessage} />;
  }

  return (
    <article className={isSelected ? 'message-card message-card-active' : 'message-card'}>
      <MessageHeader isExpanded={isExpanded} message={message} onToggle={() => setIsExpanded(false)} />
      <MessageBody
        attachments={message.attachments}
        html={message.body}
        plainText={message.plain_text}
        onOpenExternalLink={onOpenExternalLink}
        resolveInlineImageUrl={resolveInlineImageUrl}
      />
      <MessageAttachments attachments={message.attachments} />
      {Object.keys(message.headers).length ? (
        <div className="message-header-grid">
          {Object.entries(message.headers).map(([key, value]) => (
            <div className="message-header-chip" key={key}>
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <MessageActions />
    </article>
  );
};
