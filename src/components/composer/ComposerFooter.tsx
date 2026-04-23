type ComposerFooterProps = {
  isSending: boolean;
  onDiscard: () => void;
  onFlushOutbox: () => Promise<void>;
  onSend: () => Promise<void>;
  status: string;
};

export const ComposerFooter = ({ isSending, onDiscard, onFlushOutbox, onSend, status }: ComposerFooterProps) => (
  <footer className="composer-panel-footer">
    <div className="composer-actions">
      <button className="composer-secondary" disabled={isSending} onClick={onDiscard} type="button">
        Discard
      </button>
      <button className="composer-secondary" disabled={isSending} onClick={() => void onFlushOutbox()} type="button">
        Flush outbox
      </button>
      <button className="composer-primary" disabled={isSending} onClick={() => void onSend()} type="button">
        {isSending ? 'Working...' : 'Queue'}
      </button>
    </div>

    <p className="composer-status" role="status">
      {status}
    </p>
  </footer>
);
