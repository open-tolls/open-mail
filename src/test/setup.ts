import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
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
  window.localStorage.clear();
  useUIStore.setState({
    isSidebarCollapsed: false,
    layoutMode: 'split',
    themeId: 'system',
    threadPanelWidth: 58
  });
});
