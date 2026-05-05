import type { ContactDirectoryEntry } from '@lib/contacts-directory';

type ContactDetailProps = {
  contact: ContactDirectoryEntry | null;
};

const formatContactDate = (value: string | null) => {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

export const ContactDetail = ({ contact }: ContactDetailProps) => {
  if (!contact) {
    return <p className="preferences-note">Select a contact to inspect recent thread history.</p>;
  }

  return (
    <article className="contact-detail">
      <div>
        <strong>{contact.name ?? contact.email}</strong>
        <p>{contact.email}</p>
        <span>{contact.isMe ? 'Your account contact' : 'Auto-populated from synced mail'}</span>
      </div>
      <div className="contact-metrics">
        <p>Touchpoints: {contact.emailCount}</p>
        <p>Last emailed: {formatContactDate(contact.lastEmailedAt)}</p>
      </div>
      <div className="contact-history">
        <strong>Recent thread history</strong>
        {contact.threads.length ? (
          <div className="contact-history-list">
            {contact.threads.slice(0, 6).map((thread) => (
              <div className="contact-history-item" key={thread.threadId}>
                <strong>{thread.subject}</strong>
                <span>{formatContactDate(thread.lastMessageAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="preferences-note">No thread history loaded for this contact yet.</p>
        )}
      </div>
    </article>
  );
};
