import { useEffect, useState } from 'react';
import type { ContactDirectoryEntry } from '@lib/contacts-directory';

type ContactEditorProps = {
  contact: ContactDirectoryEntry;
  onDelete: () => void;
  onSave: (nextContact: { name: string | null; notes: string | null }) => void;
};

export const ContactEditor = ({ contact, onDelete, onSave }: ContactEditorProps) => {
  const [name, setName] = useState(contact.name ?? '');
  const [notes, setNotes] = useState(contact.notes ?? '');

  useEffect(() => {
    setName(contact.name ?? '');
    setNotes(contact.notes ?? '');
  }, [contact.id, contact.name, contact.notes]);

  return (
    <div className="contact-editor">
      <div className="contact-editor-header">
        <strong>Edit contact</strong>
        <button onClick={onDelete} type="button">
          Reset custom info
        </button>
      </div>
      <label className="preferences-field">
        <span>Display name</span>
        <input
          aria-label="Contact display name"
          onChange={(event) => setName(event.target.value)}
          placeholder="Give this contact a memorable name"
          value={name}
        />
      </label>
      <label className="preferences-field">
        <span>Notes</span>
        <textarea
          aria-label="Contact notes"
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Keep a quick note about this contact"
          rows={4}
          value={notes}
        />
      </label>
      <div className="contact-editor-actions">
        <button
          className="preferences-primary-button"
          onClick={() =>
            onSave({
              name: name.trim() || null,
              notes: notes.trim() || null
            })
          }
          type="button"
        >
          Save contact info
        </button>
      </div>
    </div>
  );
};
