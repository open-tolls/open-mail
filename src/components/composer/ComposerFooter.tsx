import { Spinner } from '@components/ui/Spinner';

type ComposerFooterProps = {
  isSending: boolean;
  onOpenTemplates: () => void;
  onEditSignature: () => void;
  onDiscard: () => void;
  onFlushOutbox: () => Promise<void>;
  onOpenReminder: () => void;
  onOpenSchedule: () => void;
  onSend: () => Promise<void>;
  status: string;
};

export const ComposerFooter = ({
  isSending,
  onOpenTemplates,
  onEditSignature,
  onDiscard,
  onFlushOutbox,
  onOpenReminder,
  onOpenSchedule,
  onSend,
  status
}: ComposerFooterProps) => (
  <footer className="composer-panel-footer">
    <div className="composer-actions">
      <button aria-label="Open composer templates" className="composer-secondary" disabled={isSending} onClick={onOpenTemplates} type="button">
        Templates
      </button>
      <button aria-label="Edit composer signature" className="composer-secondary" disabled={isSending} onClick={onEditSignature} type="button">
        Signature
      </button>
      <button aria-label="Discard draft" className="composer-secondary" disabled={isSending} onClick={onDiscard} type="button">
        Discard
      </button>
      <button aria-label="Flush queued outbox messages" className="composer-secondary" disabled={isSending} onClick={() => void onFlushOutbox()} type="button">
        Flush outbox
      </button>
      <button aria-label="Open send reminder options" className="composer-secondary" disabled={isSending} onClick={onOpenReminder} type="button">
        Remind me
      </button>
      <button aria-label="Open send later options" className="composer-secondary" disabled={isSending} onClick={onOpenSchedule} type="button">
        Send later
      </button>
      <button aria-label={isSending ? 'Queueing message' : 'Queue message'} className="composer-primary" disabled={isSending} onClick={() => void onSend()} type="button">
        {isSending ? (
          <>
            <Spinner className="composer-button-spinner" />
            Queueing...
          </>
        ) : (
          'Queue'
        )}
      </button>
    </div>

    <p className="composer-status" role="status">
      {status}
    </p>
  </footer>
);
