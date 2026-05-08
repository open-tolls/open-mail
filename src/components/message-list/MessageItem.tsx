import { useEffect, type KeyboardEvent as ReactKeyboardEvent, useState } from 'react';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';
import type { AttachmentRecord, MessageRecord } from '@lib/contracts';
import { analyzeMessageSecurity } from '@lib/message-security';
import { MessageActions } from '@components/message-list/MessageActions';
import { MessageAttachments } from '@components/message-list/MessageAttachments';
import { MessageBody } from '@components/message-list/MessageBody';
import { MessageCollapsed } from '@components/message-list/MessageCollapsed';
import { MessageHeader } from '@components/message-list/MessageHeader';
import { MessageSecurityBanner } from '@components/message-list/MessageSecurityBanner';

type MessageItemProps = {
  contacts: ContactDirectoryEntry[];
  defaultExpanded: boolean;
  isSelected: boolean;
  message: MessageRecord;
  onNavigate?: (messageId: string, direction: 'next' | 'previous' | 'first' | 'last') => void;
  onDownloadAttachment?: (attachment: AttachmentRecord) => void;
  onOpenExternalLink?: (url: string) => void;
  onForward?: (message: MessageRecord) => void;
  onPrint?: (message: MessageRecord) => void;
  onReply?: (message: MessageRecord) => void;
  onReplyAll?: (message: MessageRecord) => void;
  onSelectMessage: (messageId: string) => void;
  resolveInlineImageUrl?: (localPath: string) => string;
};

export const MessageItem = ({
  contacts,
  defaultExpanded,
  isSelected,
  message,
  onNavigate,
  onDownloadAttachment,
  onOpenExternalLink,
  onForward,
  onPrint,
  onReply,
  onReplyAll,
  onSelectMessage,
  resolveInlineImageUrl
}: MessageItemProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const securityAnalysis = analyzeMessageSecurity(message);
  const primarySender = message.from[0];
  const bodyAriaLabel = `Message body for ${message.subject || 'No subject'} from ${
    primarySender?.name ?? primarySender?.email ?? 'Unknown sender'
  }`;

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded, message.id]);

  const expandMessage = () => {
    setIsExpanded(true);
    onSelectMessage(message.id);
  };

  const handleNavigate = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onNavigate?.(message.id, 'next');
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onNavigate?.(message.id, 'previous');
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      onNavigate?.(message.id, 'first');
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      onNavigate?.(message.id, 'last');
    }
  };

  if (!isExpanded) {
    return <MessageCollapsed message={message} onExpand={expandMessage} onNavigate={handleNavigate} />;
  }

  return (
    <article
      aria-label={`Message from ${message.from[0]?.name ?? message.from[0]?.email ?? 'Unknown sender'}`}
      className={isSelected ? 'message-card message-card-active' : 'message-card'}
      data-message-id={message.id}
      onFocus={() => onSelectMessage(message.id)}
      onKeyDown={handleNavigate}
      tabIndex={0}
    >
      <MessageHeader contacts={contacts} isExpanded={isExpanded} message={message} onToggle={() => setIsExpanded(false)} />
      <MessageSecurityBanner analysis={securityAnalysis} message={message} onOpenExternalLink={onOpenExternalLink} />
      <MessageBody
        attachments={message.attachments}
        ariaLabel={bodyAriaLabel}
        html={message.body}
        plainText={message.plain_text}
        onOpenExternalLink={onOpenExternalLink}
        resolveInlineImageUrl={resolveInlineImageUrl}
      />
      <MessageAttachments
        attachments={message.attachments}
        onDownloadAttachment={onDownloadAttachment}
        resolveAttachmentUrl={resolveInlineImageUrl}
      />
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
      <MessageActions
        onForward={onForward ? () => onForward(message) : undefined}
        onPrint={onPrint ? () => onPrint(message) : undefined}
        onReply={onReply ? () => onReply(message) : undefined}
        onReplyAll={onReplyAll ? () => onReplyAll(message) : undefined}
      />
    </article>
  );
};
