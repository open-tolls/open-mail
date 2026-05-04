import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDesktopNotifications } from '@hooks/useDesktopNotifications';
import { usePreferencesStore } from '@stores/usePreferencesStore';

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

const tauriEventApi = vi.hoisted(() => ({
  useTauriEvent: vi.fn()
}));

const tauriBridgeApi = vi.hoisted(() => ({
  listFolders: vi.fn(),
  listMessagesByThread: vi.fn()
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
  useTauriEvent: tauriEventApi.useTauriEvent
}));

vi.mock('@lib/tauri-bridge', () => ({
  tauriRuntime: {
    isAvailable: () => true
  },
  api: {
    mailbox: {
      listFolders: tauriBridgeApi.listFolders
    },
    messages: {
      listByThread: tauriBridgeApi.listMessagesByThread
    }
  }
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
    notificationApi.sendNotification.mockReset();
    notificationApi.isPermissionGranted.mockResolvedValue(true);
    notificationApi.requestPermission.mockResolvedValue('granted');
    tauriEventApi.useTauriEvent.mockReset();
    tauriBridgeApi.listFolders.mockReset();
    tauriBridgeApi.listMessagesByThread.mockReset();
    tauriWindowApi.getCurrentWindow.mockReturnValue({
      setFocus: tauriWindowApi.setFocus
    });
    notificationApi.onAction.mockResolvedValue({
      unregister: vi.fn()
    });
    usePreferencesStore.setState({
      notificationsEnabled: true,
      notificationScope: 'inbox',
      quietHoursStart: '',
      quietHoursEnd: ''
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

  it('shows a desktop notification when a snoozed thread wakes up', async () => {
    let domainEventHandler:
      | ((payload: {
          type: 'snooze-woke';
          accountId: string;
          threadId: string;
        }) => void)
      | undefined;

    tauriEventApi.useTauriEvent.mockImplementation((_event, handler) => {
      domainEventHandler = handler;
    });
    tauriBridgeApi.listFolders.mockResolvedValue([
      {
        id: 'fld_inbox',
        account_id: 'acc_demo',
        name: 'Inbox',
        path: 'INBOX',
        role: 'inbox',
        unread_count: 1,
        total_count: 1,
        created_at: '2026-03-13T10:00:00Z',
        updated_at: '2026-03-13T10:00:00Z'
      }
    ]);
    tauriBridgeApi.listMessagesByThread.mockResolvedValue([
      {
        id: 'msg_1',
        account_id: 'acc_demo',
        thread_id: 'thr_1',
        from: [],
        to: [],
        cc: [],
        bcc: [],
        reply_to: [],
        subject: 'Premium motion system approved',
        snippet: 'Back to the inbox',
        body: '<p>Back to the inbox</p>',
        plain_text: 'Back to the inbox',
        message_id_header: '<msg_1@example.com>',
        in_reply_to: null,
        references: [],
        folder_id: 'fld_inbox',
        label_ids: [],
        is_unread: true,
        is_starred: false,
        is_draft: false,
        date: '2026-03-13T10:00:00Z',
        attachments: [],
        headers: {},
        created_at: '2026-03-13T10:00:00Z',
        updated_at: '2026-03-13T10:00:00Z'
      }
    ]);

    renderHook(() => useDesktopNotifications());

    await act(async () => {
      await domainEventHandler?.({
        type: 'snooze-woke',
        accountId: 'acc_demo',
        threadId: 'thr_1'
      });
    });

    expect(notificationApi.sendNotification).toHaveBeenCalledWith({
      title: 'Snooze ended: Premium motion system approved',
      body: 'Back to the inbox',
      autoCancel: true,
      extra: {
        accountId: 'acc_demo',
        threadId: 'thr_1',
        folderId: 'fld_inbox',
        folderRole: 'inbox'
      }
    });
  });
});
