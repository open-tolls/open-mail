import { Spinner } from '@components/ui/Spinner';

type ComposerFooterProps = {
  isSending: boolean;
  onOpenTemplates: () => void;
  onEditSignature: () => void;
  onDiscard: () => void;
  onFlushOutbox: () => Promise<void>;
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
  onOpenSchedule,
  onSend,
  status
}: ComposerFooterProps) => (
  <footer className="composer-panel-footer">
    <div className="composer-actions">
      <button className="composer-secondary" disabled={isSending} onClick={onOpenTemplates} type="button">
        Templates
      </button>
      <button className="composer-secondary" disabled={isSending} onClick={onEditSignature} type="button">
        Signature
      </button>
      <button className="composer-secondary" disabled={isSending} onClick={onDiscard} type="button">
        Discard
      </button>
      <button className="composer-secondary" disabled={isSending} onClick={() => void onFlushOutbox()} type="button">
        Flush outbox
      </button>
      <button className="composer-secondary" disabled={isSending} onClick={onOpenSchedule} type="button">
        Send later
      </button>
      <button className="composer-primary" disabled={isSending} onClick={() => void onSend()} type="button">
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
