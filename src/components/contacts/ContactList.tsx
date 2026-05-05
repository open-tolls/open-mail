import type { ContactDirectoryEntry } from '@lib/contacts-directory';

type ContactListProps = {
  contacts: ContactDirectoryEntry[];
  selectedContactId: string | null;
  onSelect: (contactId: string) => void;
};

export const ContactList = ({ contacts, selectedContactId, onSelect }: ContactListProps) => {
  if (!contacts.length) {
    return <p className="preferences-note">No contacts match the current search yet.</p>;
  }

  return (
    <div aria-label="Contacts list" className="contact-list">
      {contacts.map((contact) => (
        <button
          className={contact.id === selectedContactId ? 'contact-card contact-card-active' : 'contact-card'}
          key={contact.id}
          onClick={() => onSelect(contact.id)}
          type="button"
        >
          <strong>{contact.name ?? contact.email}</strong>
          {contact.name ? <p>{contact.email}</p> : null}
          <span>{contact.emailCount} email touchpoint(s)</span>
        </button>
      ))}
    </div>
  );
};
