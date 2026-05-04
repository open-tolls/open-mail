import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnreadTrayIndicator } from '@hooks/useUnreadTrayIndicator';

const bridgeApi = vi.hoisted(() => ({
  setTrayUnreadCount: vi.fn(),
  isAvailable: vi.fn()
}));

vi.mock('@lib/tauri-bridge', () => ({
  api: {
    system: {
      setTrayUnreadCount: bridgeApi.setTrayUnreadCount
    }
  },
  tauriRuntime: {
    isAvailable: bridgeApi.isAvailable
  }
}));

describe('useUnreadTrayIndicator', () => {
  beforeEach(() => {
    bridgeApi.setTrayUnreadCount.mockReset();
    bridgeApi.isAvailable.mockReturnValue(true);
  });

  it('pushes the unread total to the desktop tray indicator', async () => {
    bridgeApi.setTrayUnreadCount.mockResolvedValue(undefined);

    renderHook(() => useUnreadTrayIndicator(4));

    await waitFor(() => expect(bridgeApi.setTrayUnreadCount).toHaveBeenCalledWith(4));
  });

  it('does not run outside the desktop runtime', () => {
    bridgeApi.isAvailable.mockReturnValue(false);

    renderHook(() => useUnreadTrayIndicator(2));

    expect(bridgeApi.setTrayUnreadCount).not.toHaveBeenCalled();
  });
});
