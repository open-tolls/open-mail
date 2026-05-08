import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';
import { ContactCard } from '@components/contacts/ContactCard';
import type { ContactPreview } from '@lib/contacts-directory';

type ContactHoverCardProps = {
  children: ReactNode;
  contact: ContactPreview;
};

export const ContactHoverCard = ({ children, contact }: ContactHoverCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const cardId = useId();

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
      <span
        aria-controls={isOpen ? cardId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="contact-hover-trigger"
        onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        tabIndex={0}
      >
        {children}
      </span>
      {isOpen ? <ContactCard contact={contact} id={cardId} /> : null}
    </span>
  );
};
