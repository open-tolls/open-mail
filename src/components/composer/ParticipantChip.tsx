import { ContactHoverCard } from '@components/contacts/ContactHoverCard';
import type { ContactPreview } from '@lib/contacts-directory';

type ParticipantChipProps = {
  email: string;
  contact: ContactPreview | null;
  isInvalid: boolean;
  onRemove: () => void;
};

export const ParticipantChip = ({ email, contact, isInvalid, onRemove }: ParticipantChipProps) => (
  <span className={isInvalid ? 'participant-chip participant-chip-invalid' : 'participant-chip'} title={email}>
    {contact ? (
      <ContactHoverCard contact={contact}>
        <span>{email}</span>
      </ContactHoverCard>
    ) : (
      <span>{email}</span>
    )}
    <button aria-label={`Remove ${email}`} onClick={onRemove} type="button">
      ×
    </button>
  </span>
);
