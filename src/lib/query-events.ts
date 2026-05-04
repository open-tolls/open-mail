import type { QueryKey } from '@tanstack/react-query';
import type { DomainEvent } from '@lib/contracts';

const mailboxKeys: QueryKey[] = [['mailbox-overview'], ['sync-status-detail']];
const threadKeys: QueryKey[] = [['folder-threads'], ['search-threads']];
const messageKeys: QueryKey[] = [['thread-messages'], ['message-detail']];

export const getInvalidationKeysForDomainEvent = (event: DomainEvent): QueryKey[] => {
  switch (event.type) {
    case 'application-started':
    case 'account-added':
    case 'account-removed':
    case 'folders-changed':
      return [...mailboxKeys, ...threadKeys];
    case 'threads-changed':
      return [...mailboxKeys, ...threadKeys, ...messageKeys];
    case 'snooze-woke':
      return [...mailboxKeys, ...threadKeys, ...messageKeys];
    case 'scheduled-send-processed':
      return [...mailboxKeys, ...threadKeys, ...messageKeys];
    case 'messages-changed':
      return [...mailboxKeys, ...threadKeys, ...messageKeys];
    case 'labels-changed':
    case 'contacts-changed':
    case 'sync-status-changed':
      return mailboxKeys;
  }
};
