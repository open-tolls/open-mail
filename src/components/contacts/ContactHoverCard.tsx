import { type ReactNode, useState } from 'react';
import { ContactCard } from '@components/contacts/ContactCard';
import type { ContactPreview } from '@lib/contacts-directory';

type ContactHoverCardProps = {
  children: ReactNode;
  contact: ContactPreview;
};

export const ContactHoverCard = ({ children, contact }: ContactHoverCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span
      className="contact-hover-anchor"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false);
        }
      }}
      onFocus={() => setIsOpen(true)}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <span className="contact-hover-trigger" tabIndex={0}>
        {children}
      </span>
      {isOpen ? <ContactCard contact={contact} /> : null}
    </span>
  );
};
