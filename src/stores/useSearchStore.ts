import { create } from 'zustand';
import type { ThreadSummary } from '@lib/contracts';

type SearchState = {
  query: string;
  results: ThreadSummary[];
  isSearching: boolean;
  setQuery: (query: string) => void;
  setResults: (results: ThreadSummary[]) => void;
  setSearching: (isSearching: boolean) => void;
  clearSearch: () => void;
};

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  results: [],
  isSearching: false,
  setQuery: (query) => set({ query }),
  setResults: (results) => set({ results, isSearching: false }),
  setSearching: (isSearching) => set({ isSearching }),
  clearSearch: () => set({ query: '', results: [], isSearching: false })
}));
