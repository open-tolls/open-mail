import type { FolderRecord, ThreadSummary } from '@lib/contracts';
import { buildSearchSuggestions } from '@lib/search-suggestions';

type BuildSearchSuggestionsOptions = {
  folders: FolderRecord[];
  query: string;
  threads: ThreadSummary[];
};

type SearchSuggestionsProps = BuildSearchSuggestionsOptions & {
  isOpen: boolean;
  onSelect: (value: string) => void;
};


export const SearchSuggestions = ({ folders, isOpen, onSelect, query, threads }: SearchSuggestionsProps) => {
  const suggestions = buildSearchSuggestions({ folders, query, threads });

  if (!isOpen || !suggestions.length) {
    return null;
  }

  return (
    <div aria-label="Search suggestions" className="search-suggestions" role="listbox">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion.value)}
          role="option"
          type="button"
        >
          <strong>{suggestion.value}</strong>
          <span>{suggestion.label}</span>
        </button>
      ))}
    </div>
  );
};
