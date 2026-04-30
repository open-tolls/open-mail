import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnreadBadge } from '@hooks/useUnreadBadge';

const tauriWindowApi = vi.hoisted(() => ({
  setBadgeCount: vi.fn(),
  getCurrentWindow: vi.fn()
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: tauriWindowApi.getCurrentWindow
}));

const setTauriRuntime = (isAvailable: boolean) => {
  if (isAvailable) {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {}
    });
    return;
  }

  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
};

describe('useUnreadBadge', () => {
  beforeEach(() => {
    setTauriRuntime(true);
    tauriWindowApi.setBadgeCount.mockReset();
    tauriWindowApi.getCurrentWindow.mockReturnValue({
      setBadgeCount: tauriWindowApi.setBadgeCount
    });
  });

  it('applies the unread count to the desktop badge', async () => {
    tauriWindowApi.setBadgeCount.mockResolvedValue(undefined);

    renderHook(() => useUnreadBadge(5));

    await waitFor(() => expect(tauriWindowApi.setBadgeCount).toHaveBeenCalledWith(5));
  });

  it('clears the desktop badge when unread count reaches zero', async () => {
    tauriWindowApi.setBadgeCount.mockResolvedValue(undefined);

    renderHook(() => useUnreadBadge(0));

    await waitFor(() => expect(tauriWindowApi.setBadgeCount).toHaveBeenCalledWith(undefined));
  });
});
