import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchSuggestions } from '@components/search/SearchSuggestions';
import type { FolderRecord, ThreadSummary } from '@lib/contracts';
import { buildSearchSuggestions } from '@lib/search-suggestions';

const now = '2026-04-22T12:00:00.000Z';

const folder = (id: string, name: string): FolderRecord => ({
  id,
  account_id: 'acc_1',
  name,
  path: name,
  role: id,
  unread_count: 0,
  total_count: 0,
  created_at: now,
  updated_at: now
});

const thread = (participants: string[]): ThreadSummary => ({
  id: 'thr_1',
  subject: 'Launch report',
  snippet: 'Hello',
  participants,
  isUnread: false,
  isStarred: false,
  hasAttachments: true,
  messageCount: 1,
  lastMessageAt: now
});

describe('SearchSuggestions', () => {
  it('builds filter, folder, and participant suggestions from mailbox context', () => {
    expect(buildSearchSuggestions({
      folders: [folder('inbox', 'Inbox')],
      query: 'in',
      threads: [thread(['alice@example.com'])]
    }).map((suggestion) => suggestion.value)).toEqual(['in:inbox']);

    expect(buildSearchSuggestions({
      folders: [folder('inbox', 'Inbox')],
      query: 'from:ali',
      threads: [thread(['alice@example.com'])]
    })[0]?.value).toBe('from:alice@example.com');

    expect(buildSearchSuggestions({
      folders: [],
      query: 'has',
      threads: []
    })[0]?.value).toBe('has:attachment');
  });

  it('reports the selected suggestion value', () => {
    const onSelect = vi.fn();

    render(
      <SearchSuggestions
        folders={[folder('inbox', 'Inbox')]}
        isOpen
        onSelect={onSelect}
        query="in"
        threads={[]}
      />
    );

    fireEvent.click(screen.getByRole('option', { name: 'in:inbox Search in Inbox' }));

    expect(onSelect).toHaveBeenCalledWith('in:inbox');
  });
});
