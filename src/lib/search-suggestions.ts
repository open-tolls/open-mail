import type { FolderRecord, ThreadSummary } from '@lib/contracts';

export type SearchSuggestion = {
  id: string;
  label: string;
  value: string;
};

export type BuildSearchSuggestionsOptions = {
  folders: FolderRecord[];
  query: string;
  threads: ThreadSummary[];
};

const filterSuggestions: SearchSuggestion[] = [
  { id: 'has-attachment', label: 'Threads with attachments', value: 'has:attachment' },
  { id: 'is-unread', label: 'Unread threads', value: 'is:unread' },
  { id: 'is-starred', label: 'Starred threads', value: 'is:starred' },
  { id: 'after-date', label: 'After date', value: 'after:2026-04-01' },
  { id: 'before-date', label: 'Before date', value: 'before:2026-04-30' },
  { id: 'subject', label: 'Search subject', value: 'subject:' },
  { id: 'from', label: 'Messages from', value: 'from:' },
  { id: 'to', label: 'Messages to', value: 'to:' },
  { id: 'in', label: 'Search in folder', value: 'in:' }
];

const normalize = (value: string) => value.toLocaleLowerCase('pt-BR');

const getActiveToken = (query: string) => query.trim().split(/\s+/).at(-1) ?? '';

const startsWithQuery = (value: string, query: string) => normalize(value).startsWith(normalize(query));

const unique = (values: string[]) => Array.from(new Set(values));

export const buildSearchSuggestions = ({ folders, query, threads }: BuildSearchSuggestionsOptions) => {
  const activeToken = getActiveToken(query);
  const [key, value = ''] = activeToken.split(':');
  const suggestions: SearchSuggestion[] = [];

  if (activeToken.startsWith('from:') || activeToken.startsWith('to:')) {
    const prefix = `${key}:`;
    const participants = unique(threads.flatMap((thread) => thread.participants)).filter((participant) =>
      startsWithQuery(participant, value)
    );

    suggestions.push(
      ...participants.map((participant) => ({
        id: `${prefix}${participant}`,
        label: key === 'to' ? `Messages to ${participant}` : `Messages from ${participant}`,
        value: `${prefix}${participant}`
      }))
    );
  } else if (activeToken.startsWith('in:') || startsWithQuery('in', activeToken)) {
    suggestions.push(
      ...folders
        .filter((folder) => startsWithQuery(folder.name, value || activeToken.replace(/^in:?/, '')))
        .map((folder) => ({
          id: `in:${folder.id}`,
          label: `Search in ${folder.name}`,
          value: `in:${folder.role ?? folder.id}`
        }))
    );
  }

  const filterMatches = filterSuggestions.filter((suggestion) => startsWithQuery(suggestion.value, activeToken));
  suggestions.push(...filterMatches.filter((suggestion) => !suggestions.some((item) => item.value.startsWith(suggestion.value))));

  return suggestions.slice(0, 6);
};
