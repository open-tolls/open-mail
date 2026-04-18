import { Archive, MailOpen, Star, Trash2 } from 'lucide-react';

export type ThreadAction = 'archive' | 'trash' | 'toggle-read' | 'star';

type ThreadListToolbarProps = {
  selectedCount: number;
  onAction: (action: ThreadAction) => void;
};

export const ThreadListToolbar = ({ selectedCount, onAction }: ThreadListToolbarProps) => {
  if (!selectedCount) {
    return null;
  }

  return (
    <div className="thread-selection-toolbar" aria-label="Thread selection actions">
      <strong>{selectedCount} selected</strong>
      <button aria-label="Archive selected threads" onClick={() => onAction('archive')} type="button">
        <Archive size={15} />
        Archive
      </button>
      <button aria-label="Trash selected threads" onClick={() => onAction('trash')} type="button">
        <Trash2 size={15} />
        Trash
      </button>
      <button aria-label="Mark selected threads read or unread" onClick={() => onAction('toggle-read')} type="button">
        <MailOpen size={15} />
        Read
      </button>
      <button aria-label="Star selected threads" onClick={() => onAction('star')} type="button">
        <Star size={15} />
        Star
      </button>
    </div>
  );
};
