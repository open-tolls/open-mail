import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { defaultShortcutBindings, useShortcutStore } from '@stores/useShortcutStore';
import { useThreadStore } from '@stores/useThreadStore';
import { useUIStore } from '@stores/useUIStore';

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    })
  });
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
  window.localStorage.clear();
  useUIStore.setState({
    isSidebarCollapsed: false,
    layoutMode: 'split',
    themeId: 'system',
    threadPanelWidth: 58
  });
  useShortcutStore.setState({
    bindings: defaultShortcutBindings
  });
  useThreadStore.setState({
    activeFolderKey: null,
    hasMore: false,
    hasMoreByFolderKey: {},
    isLoading: false,
    offset: 0,
    offsetByFolderKey: {},
    threadRecords: [],
    threads: [],
    threadsByFolderKey: {},
    threadSummaries: [],
    selectedThreadId: null
  });
});
