import type { ContactPreview } from '@lib/contacts-directory';

type ContactCardProps = {
  contact: ContactPreview;
};

const formatContactDate = (value: string | null) => {
  if (!value) {
    return 'No recent activity yet';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

export const ContactCard = ({ contact }: ContactCardProps) => (
  <div aria-label={`Contact card for ${contact.email}`} className="contact-hover-card" role="dialog">
    <div>
      <strong>{contact.name ?? contact.email}</strong>
      {contact.name ? <p>{contact.email}</p> : null}
      <span>{contact.isMe ? 'Your account contact' : 'Known from synced mail'}</span>
    </div>
    <div className="contact-hover-metrics">
      <p>Touchpoints: {contact.emailCount}</p>
      <p>Last emailed: {formatContactDate(contact.lastEmailedAt)}</p>
    </div>
    {contact.notes ? (
      <div className="contact-hover-notes">
        <strong>Notes</strong>
        <p>{contact.notes}</p>
      </div>
    ) : null}
    {contact.threads.length ? (
      <div className="contact-hover-history">
        <strong>Recent threads</strong>
        <div className="contact-hover-history-list">
          {contact.threads.slice(0, 3).map((thread) => (
            <div className="contact-hover-history-item" key={thread.threadId}>
              <span>{thread.subject}</span>
              <small>{formatContactDate(thread.lastMessageAt)}</small>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <p className="preferences-note">No thread history loaded for this contact yet.</p>
    )}
  </div>
);
