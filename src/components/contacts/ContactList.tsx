import { type KeyboardEvent as ReactKeyboardEvent, useRef } from 'react';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';

type ContactListProps = {
  contacts: ContactDirectoryEntry[];
  selectedContactId: string | null;
  onSelect: (contactId: string) => void;
};

export const ContactList = ({ contacts, selectedContactId, onSelect }: ContactListProps) => {
  const contactRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (!contacts.length) {
    return <p className="preferences-note">No contacts match the current search yet.</p>;
  }

  const focusContactByIndex = (index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, contacts.length - 1));
    const targetContact = contacts[clampedIndex];
    if (!targetContact) {
      return;
    }

    contactRefs.current[targetContact.id]?.focus();
  };

  const handleContactKeyDown =
    (contactId: string) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = contacts.findIndex((contact) => contact.id === contactId);
      if (currentIndex === -1) {
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        focusContactByIndex(currentIndex + 1);
      }

      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        focusContactByIndex(currentIndex - 1);
      }

      if (event.key === 'Home') {
        event.preventDefault();
        focusContactByIndex(0);
      }

      if (event.key === 'End') {
        event.preventDefault();
        focusContactByIndex(contacts.length - 1);
      }
    };

  return (
    <div aria-label="Contacts list" className="contact-list" role="listbox">
      {contacts.map((contact) => (
        <button
          aria-selected={contact.id === selectedContactId}
          className={contact.id === selectedContactId ? 'contact-card contact-card-active' : 'contact-card'}
          key={contact.id}
          onKeyDown={handleContactKeyDown(contact.id)}
          onClick={() => onSelect(contact.id)}
          ref={(element) => {
            contactRefs.current[contact.id] = element;
          }}
          role="option"
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
