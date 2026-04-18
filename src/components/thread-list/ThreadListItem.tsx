import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { Archive, MailOpen, Paperclip, Star, Trash2 } from 'lucide-react';
import type { ThreadSummary } from '@lib/contracts';
import { formatThreadTime, getSenderInitials, getThreadLabels } from '@components/thread-list/threadListUtils';
import type { ThreadAction } from '@components/thread-list/ThreadListToolbar';

export type ThreadSelectEvent = Pick<MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>, 'ctrlKey' | 'metaKey' | 'shiftKey'>;

type ThreadListItemProps = {
  isSelected: boolean;
  isMultiSelected: boolean;
  style?: CSSProperties;
  thread: ThreadSummary;
  onAction: (action: ThreadAction, threadId: string) => void;
  onSelect: (threadId: string, event: ThreadSelectEvent) => void;
};

export const ThreadListItem = ({
  isSelected,
  isMultiSelected,
  style,
  thread,
  onAction,
  onSelect
}: ThreadListItemProps) => {
  const labels = getThreadLabels(thread);

  const runAction = (action: ThreadAction) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onAction(action, thread.id);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(thread.id, event);
    }
  };

  return (
    <div
      aria-current={isSelected ? 'true' : undefined}
      aria-pressed={isMultiSelected}
      aria-selected={isSelected}
      className={[
        'thread-card',
        thread.isUnread ? 'thread-card-unread' : '',
        isSelected ? 'thread-card-active' : '',
        isMultiSelected ? 'thread-card-multi-selected' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      data-thread-id={thread.id}
      onClick={(event) => onSelect(thread.id, event)}
      onKeyDown={handleKeyDown}
      role="option"
      style={style}
      tabIndex={0}
    >
      <span className="thread-avatar" aria-hidden="true">
        {getSenderInitials(thread)}
      </span>

      <span className="thread-card-content">
        <span className="thread-card-row">
          <strong className="thread-sender">{thread.participants[0] ?? 'Open Mail'}</strong>
          <span className="thread-date">{formatThreadTime(thread.lastMessageAt)}</span>
        </span>

        <span className="thread-subject-row">
          <span className="thread-subject">{thread.subject}</span>
          {thread.isStarred ? (
            <Star aria-label="Starred thread" className="thread-flag-star" fill="currentColor" size={14} />
          ) : null}
          {thread.hasAttachments ? <Paperclip aria-label="Thread has attachments" size={14} /> : null}
        </span>

        <span className="thread-preview">{thread.snippet}</span>

        {labels.length ? (
          <span className="thread-label-strip" aria-label="Thread labels">
            {labels.map((label) => (
              <span className="thread-label-chip" key={label}>
                {label}
              </span>
            ))}
          </span>
        ) : null}
      </span>

      <span className="thread-quick-actions" aria-label={`Quick actions for ${thread.subject}`}>
        <span className="thread-quick-action-row">
          <button aria-label="Archive thread" onClick={runAction('archive')} type="button">
            <Archive size={14} />
          </button>
          <button aria-label="Trash thread" onClick={runAction('trash')} type="button">
            <Trash2 size={14} />
          </button>
          <button aria-label="Mark thread read or unread" onClick={runAction('toggle-read')} type="button">
            <MailOpen size={14} />
          </button>
          <button aria-label="Star thread" onClick={runAction('star')} type="button">
            <Star size={14} />
          </button>
        </span>
      </span>

      {thread.isUnread ? <span className="thread-dot" aria-label="Unread thread" /> : null}
    </div>
  );
};
