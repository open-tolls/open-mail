import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppShellEvents } from '@hooks/useAppShellEvents';

const tauriEventHook = vi.hoisted(() => ({
  useTauriEvent: vi.fn()
}));

vi.mock('@hooks/useTauriEvent', () => ({
  useTauriEvent: tauriEventHook.useTauriEvent
}));

describe('useAppShellEvents', () => {
  beforeEach(() => {
    tauriEventHook.useTauriEvent.mockReset();
  });

  it('opens the composer when the tray emits compose-new', () => {
    const onComposeNew = vi.fn();

    renderHook(() => useAppShellEvents({ onComposeNew }));

    expect(tauriEventHook.useTauriEvent).toHaveBeenCalledWith(
      'app:event',
      expect.any(Function)
    );

    const handler = tauriEventHook.useTauriEvent.mock.calls[0]?.[1] as
      | ((event: { type: string }) => void)
      | undefined;

    handler?.({ type: 'compose-new' });

    expect(onComposeNew).toHaveBeenCalledTimes(1);
  });
});
