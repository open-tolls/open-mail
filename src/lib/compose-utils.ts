import type { ContactRecord, MessageRecord } from '@lib/contracts';
import type { ComposerDraft } from '@components/composer/Composer';
import { toComposerForwardedAttachment } from '@lib/composer-attachments';

const uniqueEmails = (contacts: ContactRecord[]) => {
  const seen = new Set<string>();

  return contacts.filter((contact) => {
    const normalizedEmail = contact.email.trim().toLowerCase();

    if (!normalizedEmail || seen.has(normalizedEmail)) {
      return false;
    }

    seen.add(normalizedEmail);
    return true;
  });
};

const toEmailList = (contacts: ContactRecord[]) => uniqueEmails(contacts).map((contact) => contact.email);

const formatReplyDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'an earlier message';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const formatSender = (contact: ContactRecord | undefined) => {
  if (!contact) {
    return 'Open Mail';
  }

  return contact.name ? `${contact.name} <${contact.email}>` : contact.email;
};

const prefixSubject = (subject: string, prefix: 'Re:' | 'Fwd:') => {
  const trimmedSubject = subject.trim();
  if (!trimmedSubject) {
    return prefix;
  }

  return trimmedSubject.toLowerCase().startsWith(prefix.toLowerCase()) ? trimmedSubject : `${prefix} ${trimmedSubject}`;
};

const quoteBody = (message: MessageRecord) => {
  const dateLabel = formatReplyDate(message.date);
  const senderLabel = formatSender(message.from[0]);

  return [
    '<p></p>',
    '<div class="gmail_quote">',
    `<div>On ${dateLabel}, ${senderLabel} wrote:</div>`,
    '<blockquote style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex;">',
    message.body || '<p></p>',
    '</blockquote>',
    '</div>'
  ].join('');
};

const forwardBody = (message: MessageRecord) => {
  const dateLabel = formatReplyDate(message.date);
  const senderLabel = formatSender(message.from[0]);
  const toLabel = toEmailList(message.to).join(', ') || 'Undisclosed recipients';
  const ccLabel = toEmailList(message.cc).join(', ');

  return [
    '<p></p>',
    '<div class="forward_quote">',
    '<p>---------- Forwarded message ---------</p>',
    `<p><strong>From:</strong> ${senderLabel}</p>`,
    `<p><strong>Date:</strong> ${dateLabel}</p>`,
    `<p><strong>Subject:</strong> ${message.subject || '(no subject)'}</p>`,
    `<p><strong>To:</strong> ${toLabel}</p>`,
    ccLabel ? `<p><strong>Cc:</strong> ${ccLabel}</p>` : '',
    message.body || '<p></p>',
    '</div>'
  ].filter(Boolean).join('');
};

export const prepareReplyDraft = (message: MessageRecord, replyAll: boolean): Partial<ComposerDraft> => {
  const replyTargets = message.reply_to.length ? message.reply_to : message.from;
  const toContacts = replyAll
    ? uniqueEmails([...replyTargets, ...message.to].filter((contact) => !contact.is_me))
    : uniqueEmails(replyTargets.filter((contact) => !contact.is_me));
  const ccContacts = replyAll ? uniqueEmails(message.cc.filter((contact) => !contact.is_me)) : [];

  return {
    attachments: [],
    bcc: [],
    body: quoteBody(message),
    cc: toEmailList(ccContacts),
    inReplyTo: message.message_id_header,
    references: Array.from(new Set([...message.references, message.message_id_header].filter(Boolean))),
    subject: prefixSubject(message.subject, 'Re:'),
    to: toEmailList(toContacts)
  };
};

export const prepareForwardDraft = (message: MessageRecord): Partial<ComposerDraft> => ({
  attachments: message.attachments
    .filter((attachment) => !attachment.is_inline)
    .map(toComposerForwardedAttachment),
  bcc: [],
  body: forwardBody(message),
  cc: [],
  inReplyTo: null,
  references: [],
  subject: prefixSubject(message.subject, 'Fwd:'),
  to: []
});
