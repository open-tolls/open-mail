const createMemoryStorage = () => {
  const state = new Map<string, string>();

  return {
    get length() {
      return state.size;
    },
    clear: () => {
      state.clear();
    },
    getItem: (key: string) => state.get(key) ?? null,
    key: (index: number) => Array.from(state.keys())[index] ?? null,
    removeItem: (key: string) => {
      state.delete(key);
    },
    setItem: (key: string, value: string) => {
      state.set(key, value);
    }
  } satisfies Storage;
};

const installStableLocalStorage = () => {
  const candidate = window.localStorage;

  if (
    candidate &&
    typeof candidate.clear === 'function' &&
    typeof candidate.getItem === 'function' &&
    typeof candidate.removeItem === 'function' &&
    typeof candidate.setItem === 'function'
  ) {
    return;
  }

  const storage = createMemoryStorage();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage
  });
};

installStableLocalStorage();

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
