import { ParticipantField } from '@components/composer/ParticipantField';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';
import type { AccountRecord } from '@stores/useAccountStore';

type ComposerHeaderProps = {
  bcc: string[];
  cc: string[];
  contacts: ContactDirectoryEntry[];
  fromOptions: AccountRecord[];
  isCcVisible: boolean;
  isSending: boolean;
  isBccVisible: boolean;
  recipientSuggestions: string[];
  onBccChange: (value: string[]) => void;
  onCcChange: (value: string[]) => void;
  onClose: () => void;
  onFromChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onToChange: (value: string[]) => void;
  onToggleBcc: () => void;
  onToggleCc: () => void;
  selectedFromAccountId: string;
  subject: string;
  to: string[];
};

export const ComposerHeader = ({
  bcc,
  cc,
  contacts,
  fromOptions,
  isCcVisible,
  isSending,
  isBccVisible,
  recipientSuggestions,
  onBccChange,
  onCcChange,
  onClose,
  onFromChange,
  onSubjectChange,
  onToChange,
  onToggleBcc,
  onToggleCc,
  selectedFromAccountId,
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
        {fromOptions.length > 1 ? (
          <select
            aria-label="From"
            disabled={isSending}
            onChange={(event) => onFromChange(event.target.value)}
            value={selectedFromAccountId}
          >
            {fromOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName} &lt;{account.email}&gt;
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label="From"
            disabled
            readOnly
            value={fromOptions[0] ? `${fromOptions[0].displayName} <${fromOptions[0].email}>` : ''}
          />
        )}
      </label>

      <ParticipantField
        accountId={selectedFromAccountId}
        contacts={contacts}
        label="To"
        onChange={onToChange}
        placeholder="Add recipients"
        suggestions={recipientSuggestions}
        value={to}
      />

      <div className="composer-secondary-actions">
        <button onClick={onToggleCc} type="button">
          {isCcVisible ? 'Hide Cc' : 'Add Cc'}
        </button>
        <button onClick={onToggleBcc} type="button">
          {isBccVisible ? 'Hide Bcc' : 'Add Bcc'}
        </button>
      </div>

      {isCcVisible ? (
        <ParticipantField
          accountId={selectedFromAccountId}
          contacts={contacts}
          label="Cc"
          onChange={onCcChange}
          placeholder="Add Cc recipients"
          suggestions={recipientSuggestions}
          value={cc}
        />
      ) : null}

      {isBccVisible ? (
        <ParticipantField
          accountId={selectedFromAccountId}
          contacts={contacts}
          label="Bcc"
          onChange={onBccChange}
          placeholder="Add Bcc recipients"
          suggestions={recipientSuggestions}
          value={bcc}
        />
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
