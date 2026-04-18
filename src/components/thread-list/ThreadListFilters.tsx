import type { ThreadFilter } from '@components/thread-list/threadListUtils';

type ThreadListFiltersProps = {
  activeFilter: ThreadFilter;
  onFilterChange: (filter: ThreadFilter) => void;
};

const filters: Array<{ id: ThreadFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'attachments', label: 'Attachments' }
];

export const ThreadListFilters = ({ activeFilter, onFilterChange }: ThreadListFiltersProps) => (
  <div className="thread-filters" aria-label="Thread filters">
    {filters.map((filter) => (
      <button
        aria-pressed={filter.id === activeFilter}
        className={filter.id === activeFilter ? 'thread-filter thread-filter-active' : 'thread-filter'}
        key={filter.id}
        onClick={() => onFilterChange(filter.id)}
        type="button"
      >
        {filter.label}
      </button>
    ))}
  </div>
);
