import { ContactHoverCard } from '@components/contacts/ContactHoverCard';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';
import { toContactPreview } from '@lib/contacts-directory';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { MessageRecord } from '@lib/contracts';
import { formatMessageDate } from '@components/message-list/messageListUtils';

type MessageHeaderProps = {
  contacts: ContactDirectoryEntry[];
  isExpanded: boolean;
  message: MessageRecord;
  onToggle: () => void;
};

const ContactLine = ({
  accountId,
  contacts,
  items,
  label
}: {
  accountId: string;
  contacts: ContactDirectoryEntry[];
  items: MessageRecord['from'];
  label?: string;
}) => {
  if (!items.length) {
    return null;
  }

  return (
    <div className="message-address">
      {label ? <span>{label}: </span> : null}
      {items.map((contact, index) => (
        <span key={`${contact.email}-${index}`}>
          {index > 0 ? ', ' : null}
          <ContactHoverCard
            contact={toContactPreview(contacts, accountId, contact.email, contact.name, contact.is_me)}
          >
            <span>{contact.name ?? contact.email}</span>
          </ContactHoverCard>
        </span>
      ))}
    </div>
  );
};

export const MessageHeader = ({ contacts, isExpanded, message, onToggle }: MessageHeaderProps) => (
  <header className="message-item-header">
    <div>
      <ContactLine accountId={message.account_id} contacts={contacts} items={message.from} />
      {isExpanded ? <ContactLine accountId={message.account_id} contacts={contacts} items={message.to} label="To" /> : null}
      {isExpanded ? <ContactLine accountId={message.account_id} contacts={contacts} items={message.cc} label="Cc" /> : null}
    </div>
    <div className="message-actions">
      <span>{formatMessageDate(message.date)}</span>
      <button
        aria-label={isExpanded ? 'Collapse message' : 'Expand message'}
        className="message-action"
        onClick={onToggle}
        type="button"
      >
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
    </div>
  </header>
);
