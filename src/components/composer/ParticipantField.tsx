import { useMemo, useState } from 'react';
import { ParticipantChip } from '@components/composer/ParticipantChip';
import { isValidEmail, parseRecipients } from '@components/composer/participant-field-utils';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';
import { toContactPreview } from '@lib/contacts-directory';

type ParticipantFieldProps = {
  accountId: string;
  contacts: ContactDirectoryEntry[];
  label: 'To' | 'Cc' | 'Bcc';
  placeholder: string;
  suggestions: string[];
  value: string[];
  onChange: (value: string[]) => void;
};

export const ParticipantField = ({
  accountId,
  contacts,
  label,
  placeholder,
  suggestions,
  value,
  onChange
}: ParticipantFieldProps) => {
  const [inputValue, setInputValue] = useState('');
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  const filteredSuggestions = useMemo(() => {
    if (inputValue.trim().length < 2) {
      return [];
    }

    const normalizedInput = inputValue.trim().toLowerCase();
    return suggestions
      .filter((candidate) => candidate.toLowerCase().includes(normalizedInput))
      .filter((candidate) => !value.includes(candidate))
      .slice(0, 6);
  }, [inputValue, suggestions, value]);

  const commitRecipients = (recipients: string[]) => {
    if (!recipients.length) {
      setInputValue('');
      setIsSuggestionsOpen(false);
      return;
    }

    onChange(Array.from(new Set([...value, ...recipients])));
    setInputValue('');
    setIsSuggestionsOpen(false);
  };

  const commitInputValue = () => {
    commitRecipients(parseRecipients(inputValue));
  };

  return (
    <label className="composer-field-row">
      <span>{label}</span>
      <div className="participant-field">
        <div className="participant-field-input-wrap">
          {value.map((email) => (
            <ParticipantChip
              contact={isValidEmail(email) ? toContactPreview(contacts, accountId, email) : null}
              email={email}
              isInvalid={!isValidEmail(email)}
              key={email}
              onRemove={() => onChange(value.filter((candidate) => candidate !== email))}
            />
          ))}
          <input
            aria-label={label}
            onBlur={() => {
              window.setTimeout(() => {
                setIsSuggestionsOpen(false);
              }, 0);
            }}
            onChange={(event) => {
              setInputValue(event.target.value);
              setIsSuggestionsOpen(true);
            }}
            onFocus={() => setIsSuggestionsOpen(true)}
            onKeyDown={(event) => {
              if ((event.key === 'Enter' || event.key === 'Tab') && (filteredSuggestions.length || inputValue.trim())) {
                event.preventDefault();
                if (filteredSuggestions.length) {
                  commitRecipients([filteredSuggestions[0]]);
                  return;
                }

                commitInputValue();
                return;
              }

              if ((event.key === ',' || event.key === ';') && inputValue.trim()) {
                event.preventDefault();
                commitInputValue();
                return;
              }

              if (event.key === 'Backspace' && !inputValue && value.length) {
                onChange(value.slice(0, -1));
                return;
              }

              if (event.key === 'Escape') {
                setIsSuggestionsOpen(false);
              }
            }}
            onPaste={(event) => {
              const pastedRecipients = parseRecipients(event.clipboardData.getData('text'));
              if (pastedRecipients.length > 1) {
                event.preventDefault();
                commitRecipients(pastedRecipients);
              }
            }}
            placeholder={value.length ? '' : placeholder}
            type="text"
            value={inputValue}
          />
        </div>

        {isSuggestionsOpen && filteredSuggestions.length ? (
          <div aria-label={`${label} suggestions`} className="participant-suggestions" role="listbox">
            {filteredSuggestions.map((candidate) => (
              <button
                key={candidate}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commitRecipients([candidate]);
                }}
                role="option"
                type="button"
              >
                {candidate}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
};
