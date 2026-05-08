import { useState, type KeyboardEvent, type RefObject } from 'react';
import { Command, Search } from 'lucide-react';
import { SearchSuggestions } from '@components/search/SearchSuggestions';
import { StatusBadge } from '@components/ui/StatusBadge';
import type { FolderRecord, ThreadSummary } from '@lib/contracts';
import { buildSearchSuggestions } from '@lib/search-suggestions';
import type { ThemeId } from '@lib/themes';

type MailTopbarProps = {
  backendStatus: string;
  backendTone?: 'success' | 'accent' | 'neutral' | 'warning';
  folders: FolderRecord[];
  layoutMode: 'split' | 'list';
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  threads: ThreadSummary[];
  themeId: ThemeId;
  onCycleTheme: () => void;
  onSearchQueryChange: (query: string) => void;
  onToggleLayoutMode: () => void;
};

export const MailTopbar = ({
  backendStatus,
  backendTone = 'success',
  folders,
  layoutMode,
  searchInputRef,
  searchQuery,
  threads,
  themeId,
  onCycleTheme,
  onSearchQueryChange,
  onToggleLayoutMode
}: MailTopbarProps) => {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const suggestions = buildSearchSuggestions({ folders, query: searchQuery, threads });
  const isSuggestionsOpen = isSearchFocused || searchQuery.trim().length > 0;

  const completeSearchSuggestion = (value: string) => {
    const prefix = searchQuery.trim().split(/\s+/).slice(0, -1).join(' ');
    onSearchQueryChange(prefix ? `${prefix} ${value}` : value);
    setActiveSuggestionIndex(-1);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) {
      if (event.key === 'Escape') {
        setActiveSuggestionIndex(-1);
        setIsSearchFocused(false);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      event.preventDefault();
      completeSearchSuggestion(suggestions[activeSuggestionIndex]?.value ?? '');
      return;
    }

    if (event.key === 'Escape') {
      setActiveSuggestionIndex(-1);
      setIsSearchFocused(false);
    }
  };

  return (
    <header className="topbar">
      <div className="search-shell-wrap">
        <label className="search-shell" aria-label="Search">
          <Search size={16} />
          <input
            aria-activedescendant={
              activeSuggestionIndex >= 0 ? `mail-search-suggestion-${suggestions[activeSuggestionIndex]?.id ?? ''}` : undefined
            }
            aria-autocomplete="list"
            aria-controls={isSuggestionsOpen && suggestions.length > 0 ? 'mail-search-suggestions' : undefined}
            aria-expanded={isSuggestionsOpen && suggestions.length > 0}
            ref={searchInputRef}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onBlur={() => {
              setIsSearchFocused(false);
              setActiveSuggestionIndex(-1);
            }}
            onFocus={() => setIsSearchFocused(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search threads, people, commands"
            role="combobox"
            value={searchQuery}
          />
          <span className="shortcut-pill">
            <Command size={12} />
            K
          </span>
        </label>
        <SearchSuggestions
          activeIndex={activeSuggestionIndex}
          folders={folders}
          isOpen={isSuggestionsOpen}
          onSelect={completeSearchSuggestion}
          query={searchQuery}
          threads={threads}
        />
      </div>

      <div className="status-row">
        <button aria-label={`Switch theme (${themeId})`} className="theme-toggle" onClick={onCycleTheme} type="button">
          {themeId}
        </button>
        <button
          aria-label={layoutMode === 'split' ? 'Switch to list layout' : 'Switch to split layout'}
          aria-pressed={layoutMode === 'list'}
          className="layout-toggle"
          onClick={onToggleLayoutMode}
          type="button"
        >
          {layoutMode === 'split' ? 'Split' : 'List'}
        </button>
        <StatusBadge label={backendStatus} tone={backendTone} />
      </div>
    </header>
  );
};
