import { Forward, MoreHorizontal, Printer, Reply, ReplyAll } from 'lucide-react';

type MessageActionsProps = {
  onForward?: () => void;
  onPrint?: () => void;
  onReply?: () => void;
  onReplyAll?: () => void;
};

export const MessageActions = ({ onForward, onPrint, onReply, onReplyAll }: MessageActionsProps) => (
  <div className="message-action-bar" aria-label="Message actions">
    <button aria-label="Reply to message" onClick={onReply} type="button">
      <Reply size={14} />
      Reply
    </button>
    <button aria-label="Reply all to message" onClick={onReplyAll} type="button">
      <ReplyAll size={14} />
      Reply all
    </button>
    <button aria-label="Forward message" onClick={onForward} type="button">
      <Forward size={14} />
      Forward
    </button>
    <button aria-label="Print message" onClick={onPrint} type="button">
      <Printer size={14} />
      Print
    </button>
    <button aria-label="More message actions" type="button">
      <MoreHorizontal size={14} />
    </button>
  </div>
);
