import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { Archive, MailOpen, Paperclip, Star, Trash2, XCircle } from 'lucide-react';
import type { ThreadSummary } from '@lib/contracts';
import { formatThreadTime, getSenderInitials, getThreadAriaLabel, getThreadLabels } from '@components/thread-list/threadListUtils';
import type { ThreadAction } from '@components/thread-list/ThreadListToolbar';

export type ThreadSelectEvent = Pick<MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>, 'ctrlKey' | 'metaKey' | 'shiftKey'>;

type ThreadListItemProps = {
  isReminderFolder?: boolean;
  isSelected: boolean;
  isMultiSelected: boolean;
  style?: CSSProperties;
  thread: ThreadSummary;
  onAction: (action: ThreadAction, threadId: string) => void;
  onContextMenu: (threadId: string, event: MouseEvent<HTMLDivElement>) => void;
  onNavigate?: (threadId: string, direction: 'next' | 'previous' | 'first' | 'last') => void;
  onSelect: (threadId: string, event: ThreadSelectEvent) => void;
};

export const ThreadListItem = ({
  isReminderFolder = false,
  isSelected,
  isMultiSelected,
  style,
  thread,
  onAction,
  onContextMenu,
  onNavigate,
  onSelect
}: ThreadListItemProps) => {
  const labels = getThreadLabels(thread);
  const threadAriaLabel = getThreadAriaLabel(thread);

  const runAction = (action: ThreadAction) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onAction(action, thread.id);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(thread.id, event);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onNavigate?.(thread.id, 'next');
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onNavigate?.(thread.id, 'previous');
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      onNavigate?.(thread.id, 'first');
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      onNavigate?.(thread.id, 'last');
    }
  };

  return (
    <div
      aria-label={threadAriaLabel}
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
      onContextMenu={(event) => onContextMenu(thread.id, event)}
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
          {isReminderFolder ? (
            <button aria-label="Cancel reminder" onClick={runAction('cancel-reminder')} type="button">
              <XCircle size={14} />
            </button>
          ) : (
            <>
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
            </>
          )}
        </span>
      </span>

      {thread.isUnread ? <span className="thread-dot" aria-label="Unread thread" /> : null}
    </div>
  );
};
