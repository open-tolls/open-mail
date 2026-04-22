import type { ThreadRecord } from '@lib/contracts';

export type ParsedSearchQuery = {
  after: string | null;
  before: string | null;
  from: string[];
  hasAttachment: boolean | null;
  inFolder: string | null;
  isStarred: boolean | null;
  isUnread: boolean | null;
  subject: string[];
  terms: string[];
  to: string[];
};

const emptyParsedSearchQuery = (): ParsedSearchQuery => ({
  after: null,
  before: null,
  from: [],
  hasAttachment: null,
  inFolder: null,
  isStarred: null,
  isUnread: null,
  subject: [],
  terms: [],
  to: []
});

const normalize = (value: string) => value.trim().toLocaleLowerCase('pt-BR');

const matchesAny = (values: string[], needles: string[]) =>
  needles.every((needle) => values.some((value) => normalize(value).includes(normalize(needle))));

const isDateOnOrAfter = (value: string, date: string) => new Date(value).getTime() >= new Date(date).getTime();

const isDateOnOrBefore = (value: string, date: string) => new Date(value).getTime() <= new Date(date).getTime();

export const parseSearchQuery = (query: string): ParsedSearchQuery => {
  const parsed = emptyParsedSearchQuery();

  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const separatorIndex = token.indexOf(':');

    if (separatorIndex === -1) {
      parsed.terms.push(token);
      continue;
    }

    const key = normalize(token.slice(0, separatorIndex));
    const value = token.slice(separatorIndex + 1).trim();

    if (!value && key !== 'has') {
      continue;
    }

    if (key === 'from') {
      parsed.from.push(value);
    } else if (key === 'to') {
      parsed.to.push(value);
    } else if (key === 'subject') {
      parsed.subject.push(value);
    } else if (key === 'has' && normalize(value) === 'attachment') {
      parsed.hasAttachment = true;
    } else if (key === 'is' && normalize(value) === 'unread') {
      parsed.isUnread = true;
    } else if (key === 'is' && normalize(value) === 'starred') {
      parsed.isStarred = true;
    } else if (key === 'after') {
      parsed.after = value;
    } else if (key === 'before') {
      parsed.before = value;
    } else if (key === 'in') {
      parsed.inFolder = value;
    } else {
      parsed.terms.push(token);
    }
  }

  return parsed;
};

export const matchesParsedSearchQuery = (thread: ThreadRecord, query: ParsedSearchQuery) => {
  if (query.from.length && !matchesAny(thread.participant_ids, query.from)) {
    return false;
  }

  if (query.to.length && !matchesAny(thread.participant_ids, query.to)) {
    return false;
  }

  if (query.subject.length && !matchesAny([thread.subject], query.subject)) {
    return false;
  }

  if (query.hasAttachment !== null && thread.has_attachments !== query.hasAttachment) {
    return false;
  }

  if (query.isUnread !== null && thread.is_unread !== query.isUnread) {
    return false;
  }

  if (query.isStarred !== null && thread.is_starred !== query.isStarred) {
    return false;
  }

  if (query.after && !isDateOnOrAfter(thread.last_message_at, query.after)) {
    return false;
  }

  if (query.before && !isDateOnOrBefore(thread.last_message_at, query.before)) {
    return false;
  }

  if (query.inFolder && !thread.folder_ids.some((folderId) => normalize(folderId).includes(normalize(query.inFolder ?? '')))) {
    return false;
  }

  const searchableValues = [
    thread.subject,
    thread.snippet,
    ...thread.participant_ids,
    ...thread.folder_ids,
    ...thread.label_ids
  ];

  return matchesAny(searchableValues, query.terms);
};
