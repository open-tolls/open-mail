import type { ContactRecord, MessageRecord, ThreadRecord, ThreadSummary } from '@lib/contracts';

export type ContactDirectoryThread = {
  threadId: string;
  subject: string;
  lastMessageAt: string;
};

export type ContactDirectoryEntry = {
  id: string;
  accountId: string;
  email: string;
  name: string | null;
  isMe: boolean;
  emailCount: number;
  lastEmailedAt: string | null;
  threads: ContactDirectoryThread[];
};

export type ContactPreview = Pick<
  ContactDirectoryEntry,
  'accountId' | 'email' | 'name' | 'isMe' | 'emailCount' | 'lastEmailedAt' | 'threads'
>;

type ThreadLike =
  | Pick<ThreadRecord, 'id' | 'account_id' | 'participant_ids' | 'subject' | 'last_message_at' | 'message_count'>
  | {
      id: string;
      account_id: string;
      participant_ids: string[];
      subject: string;
      last_message_at: string;
      message_count: number;
    };

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const findContactEntry = (
  contacts: ContactDirectoryEntry[],
  accountId: string,
  email: string
) => contacts.find((contact) => contact.accountId === accountId && normalizeEmail(contact.email) === normalizeEmail(email)) ?? null;

export const toContactPreview = (
  contacts: ContactDirectoryEntry[],
  accountId: string,
  email: string,
  fallbackName: string | null = null,
  fallbackIsMe = false
): ContactPreview => {
  const knownContact = findContactEntry(contacts, accountId, email);

  if (knownContact) {
    return knownContact;
  }

  return {
    accountId,
    email,
    name: fallbackName,
    isMe: fallbackIsMe,
    emailCount: 0,
    lastEmailedAt: null,
    threads: []
  };
};

const upsertFromContact = (
  map: Map<string, ContactDirectoryEntry>,
  contact: ContactRecord,
  thread?: ContactDirectoryThread
) => {
  const key = `${contact.account_id}:${normalizeEmail(contact.email)}`;
  const current = map.get(key);

  if (!current) {
    map.set(key, {
      id: contact.id,
      accountId: contact.account_id,
      email: contact.email,
      name: contact.name,
      isMe: contact.is_me,
      emailCount: 1,
      lastEmailedAt: thread?.lastMessageAt ?? contact.updated_at,
      threads: thread ? [thread] : []
    });
    return;
  }

  const threadExists = thread ? current.threads.some((candidate) => candidate.threadId === thread.threadId) : false;
  map.set(key, {
    ...current,
    name: current.name ?? contact.name,
    isMe: current.isMe || contact.is_me,
    emailCount: current.emailCount + (threadExists ? 0 : 1),
    lastEmailedAt:
      [current.lastEmailedAt, thread?.lastMessageAt ?? contact.updated_at]
        .filter(Boolean)
        .sort()
        .at(-1) ?? current.lastEmailedAt,
    threads: thread && !threadExists ? [...current.threads, thread] : current.threads
  });
};

export const buildContactDirectory = (
  threads: ThreadLike[],
  messagesByThreadId: Record<string, MessageRecord[]> = {}
) => {
  const directory = new Map<string, ContactDirectoryEntry>();

  threads.forEach((thread) => {
    const threadInfo = {
      threadId: thread.id,
      subject: thread.subject,
      lastMessageAt: thread.last_message_at
    };
    const messages = messagesByThreadId[thread.id] ?? [];

    if (messages.length) {
      messages.forEach((message) => {
        [...message.from, ...message.to, ...message.cc, ...message.bcc, ...message.reply_to].forEach((contact) =>
          upsertFromContact(directory, contact, threadInfo)
        );
      });
      return;
    }

    thread.participant_ids.forEach((email) => {
      const normalizedEmail = normalizeEmail(email);
      const key = `${thread.account_id}:${normalizedEmail}`;
      const current = directory.get(key);

      if (!current) {
        directory.set(key, {
          id: `ct_${normalizedEmail}`,
          accountId: thread.account_id,
          email,
          name: null,
          isMe: false,
          emailCount: thread.message_count,
          lastEmailedAt: thread.last_message_at,
          threads: [threadInfo]
        });
        return;
      }

      const alreadyLinked = current.threads.some((candidate) => candidate.threadId === thread.id);
      directory.set(key, {
        ...current,
        emailCount: current.emailCount + (alreadyLinked ? 0 : thread.message_count),
        lastEmailedAt: [current.lastEmailedAt, thread.last_message_at].filter(Boolean).sort().at(-1) ?? current.lastEmailedAt,
        threads: alreadyLinked ? current.threads : [...current.threads, threadInfo]
      });
    });
  });

  return [...directory.values()].sort((first, second) => {
    const firstTimestamp = first.lastEmailedAt ? new Date(first.lastEmailedAt).getTime() : 0;
    const secondTimestamp = second.lastEmailedAt ? new Date(second.lastEmailedAt).getTime() : 0;
    return secondTimestamp - firstTimestamp;
  });
};

export const searchContacts = (contacts: ContactDirectoryEntry[], query: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return contacts;
  }

  return contacts.filter((contact) =>
    [contact.email, contact.name ?? ''].some((value) => value.toLowerCase().includes(normalizedQuery))
  );
};

export const toThreadLikeRecords = (
  accountId: string,
  threads: ThreadSummary[]
): ThreadLike[] =>
  threads.map((thread) => ({
    id: thread.id,
    account_id: accountId,
    participant_ids: thread.participants,
    subject: thread.subject,
    last_message_at: thread.lastMessageAt,
    message_count: thread.messageCount
  }));
