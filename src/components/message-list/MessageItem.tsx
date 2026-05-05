import { useEffect, useState } from 'react';
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
  onDownloadAttachment?: (attachment: AttachmentRecord) => void;
  onOpenExternalLink?: (url: string) => void;
  onForward?: (message: MessageRecord) => void;
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
  onDownloadAttachment,
  onOpenExternalLink,
  onForward,
  onReply,
  onReplyAll,
  onSelectMessage,
  resolveInlineImageUrl
}: MessageItemProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const securityAnalysis = analyzeMessageSecurity(message);

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
      <MessageHeader contacts={contacts} isExpanded={isExpanded} message={message} onToggle={() => setIsExpanded(false)} />
      <MessageSecurityBanner analysis={securityAnalysis} message={message} onOpenExternalLink={onOpenExternalLink} />
      <MessageBody
        attachments={message.attachments}
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
        onReply={onReply ? () => onReply(message) : undefined}
        onReplyAll={onReplyAll ? () => onReplyAll(message) : undefined}
      />
    </article>
  );
};
