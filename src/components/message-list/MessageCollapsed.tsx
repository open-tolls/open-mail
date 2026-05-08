import type { KeyboardEventHandler } from 'react';
import type { MessageRecord } from '@lib/contracts';
import { formatMessageDate, getPrimaryAuthor } from '@components/message-list/messageListUtils';

type MessageCollapsedProps = {
  message: MessageRecord;
  onNavigate?: KeyboardEventHandler<HTMLButtonElement>;
  onExpand: () => void;
};

export const MessageCollapsed = ({ message, onExpand, onNavigate }: MessageCollapsedProps) => (
  <article className="message-card message-card-collapsed">
    <button aria-label="Expand message" data-message-id={message.id} onClick={onExpand} onKeyDown={onNavigate} type="button">
      <span>
        <strong>{getPrimaryAuthor(message)}</strong>
        <span>{message.snippet || message.plain_text}</span>
      </span>
      <time>{formatMessageDate(message.date)}</time>
    </button>
  </article>
);
