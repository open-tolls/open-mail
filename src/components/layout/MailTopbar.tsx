import { useState, type RefObject } from 'react';
import { Command, Search } from 'lucide-react';
import { SearchSuggestions } from '@components/search/SearchSuggestions';
import { StatusBadge } from '@components/ui/StatusBadge';
import type { FolderRecord, ThreadSummary } from '@lib/contracts';
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
  const completeSearchSuggestion = (value: string) => {
    const prefix = searchQuery.trim().split(/\s+/).slice(0, -1).join(' ');
    onSearchQueryChange(prefix ? `${prefix} ${value}` : value);
  };

  return (
    <header className="topbar">
      <div className="search-shell-wrap">
        <label className="search-shell" aria-label="Search">
          <Search size={16} />
          <input
            ref={searchInputRef}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onBlur={() => setIsSearchFocused(false)}
            onFocus={() => setIsSearchFocused(true)}
            placeholder="Search threads, people, commands"
            value={searchQuery}
          />
          <span className="shortcut-pill">
            <Command size={12} />
            K
          </span>
        </label>
        <SearchSuggestions
          folders={folders}
          isOpen={isSearchFocused || searchQuery.trim().length > 0}
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
