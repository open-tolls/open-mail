type ComposerHeaderProps = {
  bcc: string;
  cc: string;
  from: string;
  isCcVisible: boolean;
  isSending: boolean;
  isBccVisible: boolean;
  onBccChange: (value: string) => void;
  onCcChange: (value: string) => void;
  onClose: () => void;
  onSubjectChange: (value: string) => void;
  onToChange: (value: string) => void;
  onToggleBcc: () => void;
  onToggleCc: () => void;
  subject: string;
  to: string;
};

export const ComposerHeader = ({
  bcc,
  cc,
  from,
  isCcVisible,
  isSending,
  isBccVisible,
  onBccChange,
  onCcChange,
  onClose,
  onSubjectChange,
  onToChange,
  onToggleBcc,
  onToggleCc,
  subject,
  to
}: ComposerHeaderProps) => (
  <header className="composer-panel-header">
    <div className="composer-panel-title-row">
      <div>
        <p className="eyebrow">Phase 5 composer</p>
        <h3>New message</h3>
      </div>
      <button
        aria-label="Close composer"
        className="composer-close-button"
        disabled={isSending}
        onClick={onClose}
        type="button"
      >
        Close
      </button>
    </div>

    <div className="composer-fields">
      <label className="composer-field-row">
        <span>From</span>
        <input disabled readOnly value={from} />
      </label>

      <label className="composer-field-row">
        <span>To</span>
        <input
          autoFocus
          onChange={(event) => onToChange(event.target.value)}
          placeholder="Add recipients"
          required
          type="email"
          value={to}
        />
      </label>

      <div className="composer-secondary-actions">
        <button onClick={onToggleCc} type="button">
          {isCcVisible ? 'Hide Cc' : 'Add Cc'}
        </button>
        <button onClick={onToggleBcc} type="button">
          {isBccVisible ? 'Hide Bcc' : 'Add Bcc'}
        </button>
      </div>

      {isCcVisible ? (
        <label className="composer-field-row">
          <span>Cc</span>
          <input onChange={(event) => onCcChange(event.target.value)} placeholder="Add Cc recipients" value={cc} />
        </label>
      ) : null}

      {isBccVisible ? (
        <label className="composer-field-row">
          <span>Bcc</span>
          <input onChange={(event) => onBccChange(event.target.value)} placeholder="Add Bcc recipients" value={bcc} />
        </label>
      ) : null}

      <label className="composer-field-row">
        <span>Subject</span>
        <input
          onChange={(event) => onSubjectChange(event.target.value)}
          placeholder="What is this about?"
          value={subject}
        />
      </label>
    </div>
  </header>
);
