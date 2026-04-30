import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopNotifications } from '@hooks/useDesktopNotifications';

const notificationApi = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(),
  onAction: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn()
}));

const tauriAppApi = vi.hoisted(() => ({
  show: vi.fn()
}));

const tauriWindowApi = vi.hoisted(() => ({
  getCurrentWindow: vi.fn(),
  setFocus: vi.fn()
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: notificationApi.isPermissionGranted,
  onAction: notificationApi.onAction,
  requestPermission: notificationApi.requestPermission,
  sendNotification: notificationApi.sendNotification
}));

vi.mock('@tauri-apps/api/app', () => ({
  show: tauriAppApi.show
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: tauriWindowApi.getCurrentWindow
}));

vi.mock('@hooks/useTauriEvent', () => ({
  useTauriEvent: vi.fn()
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

describe('desktop notification actions', () => {
  beforeEach(() => {
    setTauriRuntime(true);
    tauriAppApi.show.mockReset();
    tauriWindowApi.setFocus.mockReset();
    notificationApi.onAction.mockReset();
    tauriWindowApi.getCurrentWindow.mockReturnValue({
      setFocus: tauriWindowApi.setFocus
    });
  });

  afterEach(() => {
    setTauriRuntime(false);
  });

  it('focuses the app and reopens the clicked message target', async () => {
    const unregister = vi.fn();
    const onOpenMessage = vi.fn();
    let dispatchAction:
      | ((notification: {
          extra: Record<string, unknown>;
        }) => void | Promise<void>)
      | undefined;

    tauriAppApi.show.mockResolvedValue(undefined);
    tauriWindowApi.setFocus.mockResolvedValue(undefined);
    notificationApi.onAction.mockImplementation(async (callback) => {
      dispatchAction = callback;
      return {
        unregister
      };
    });

    const { unmount } = renderHook(() => useDesktopNotifications({ onOpenMessage }));

    await waitFor(() => expect(notificationApi.onAction).toHaveBeenCalledWith(expect.any(Function)));

    await act(async () => {
      await dispatchAction?.({
        extra: {
          accountId: 'acc_demo',
          threadId: 'thr_1',
          folderId: 'fld_inbox',
          folderRole: 'inbox'
        }
      });
    });

    expect(tauriAppApi.show).toHaveBeenCalledTimes(1);
    expect(tauriWindowApi.setFocus).toHaveBeenCalledTimes(1);
    expect(onOpenMessage).toHaveBeenCalledWith({
      accountId: 'acc_demo',
      threadId: 'thr_1',
      folderId: 'fld_inbox',
      folderRole: 'inbox',
      routeSegment: 'inbox'
    });

    unmount();

    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
