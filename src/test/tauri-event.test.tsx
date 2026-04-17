import { act, renderHook, waitFor } from '@testing-library/react';
import type { Event } from '@tauri-apps/api/event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTauriEvent } from '@hooks/useTauriEvent';

const tauriEventApi = vi.hoisted(() => ({
  listen: vi.fn()
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriEventApi.listen
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

describe('useTauriEvent', () => {
  beforeEach(() => {
    setTauriRuntime(true);
    tauriEventApi.listen.mockReset();
  });

  afterEach(() => {
    setTauriRuntime(false);
  });

  it('subscribes to Tauri events and cleans up on unmount', async () => {
    const cleanup = vi.fn();
    const handler = vi.fn();
    let dispatch: ((event: Event<string>) => void) | undefined;

    tauriEventApi.listen.mockImplementation(async (_eventName, callback) => {
      dispatch = callback;
      return cleanup;
    });

    const { unmount } = renderHook(() => useTauriEvent<string>('domain:event', handler));

    await waitFor(() =>
      expect(tauriEventApi.listen).toHaveBeenCalledWith('domain:event', expect.any(Function), undefined)
    );

    act(() => {
      dispatch?.({ event: 'domain:event', id: 1, payload: 'mailbox-updated' });
    });

    expect(handler).toHaveBeenCalledWith('mailbox-updated', {
      event: 'domain:event',
      id: 1,
      payload: 'mailbox-updated'
    });

    unmount();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe outside the Tauri runtime', () => {
    setTauriRuntime(false);

    renderHook(() => useTauriEvent<string>('domain:event', vi.fn()));

    expect(tauriEventApi.listen).not.toHaveBeenCalled();
  });
});
