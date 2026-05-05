import { useCallback, useEffect, useMemo, useRef } from 'react';
import { show } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification';
import { useTauriEvent } from '@hooks/useTauriEvent';
import { api, tauriRuntime } from '@lib/tauri-bridge';
import type { DomainEvent } from '@lib/contracts';
import {
  isWithinQuietHours,
  readNotificationTarget,
  shouldNotifyMessage,
  toNotificationRouteSegment,
  toNotificationBody,
  toNotificationTarget,
  toNotificationTitle,
  type DesktopNotificationTarget
} from '@lib/desktop-notifications';
import { usePreferencesStore } from '@stores/usePreferencesStore';

const MAX_NOTIFICATIONS_PER_EVENT = 3;

type UseDesktopNotificationsOptions = {
  onOpenMessage?: (target: DesktopNotificationTarget & { routeSegment: string }) => void;
};

export const useDesktopNotifications = ({ onOpenMessage }: UseDesktopNotificationsOptions = {}) => {
  const notificationsEnabled = usePreferencesStore((state) => state.notificationsEnabled);
  const notificationScope = usePreferencesStore((state) => state.notificationScope);
  const quietHoursStart = usePreferencesStore((state) => state.quietHoursStart);
  const quietHoursEnd = usePreferencesStore((state) => state.quietHoursEnd);
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());

  const enabled = useMemo(
    () => tauriRuntime.isAvailable() && notificationsEnabled,
    [notificationsEnabled]
  );

  const handleDomainEvent = useCallback(
    async (event: DomainEvent) => {
      if (isWithinQuietHours(new Date(), quietHoursStart, quietHoursEnd)) {
        return;
      }

      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        permissionGranted = (await requestPermission()) === 'granted';
      }

      if (!permissionGranted) {
        return;
      }

      if (event.type === 'snooze-woke') {
        const folders = await api.mailbox.listFolders(event.accountId);
        const messages = await api.messages.listByThread(event.threadId);
        const latestMessage = [...messages]
          .filter((message) => !message.is_draft)
          .sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime())[0];

        if (!latestMessage) {
          return;
        }

        sendNotification({
          title: `Snooze ended: ${latestMessage.subject.trim() || 'Untitled thread'}`,
          body: toNotificationBody(latestMessage),
          autoCancel: true,
          extra: toNotificationTarget(latestMessage, folders)
        });
        return;
      }

      if (event.type === 'scheduled-send-processed') {
        if (!event.success) {
          return;
        }

        sendNotification({
          title: `Sent later: ${event.subject.trim() || 'Untitled message'}`,
          body: 'Your scheduled message was sent successfully.',
          autoCancel: true
        });
        return;
      }

      if (event.type !== 'messages-changed' || event.messageIds.length === 0) {
        return;
      }

      const unseenMessageIds = event.messageIds.filter(
        (messageId) => !notifiedMessageIdsRef.current.has(messageId)
      );

      if (unseenMessageIds.length === 0) {
        return;
      }

      const folders = await api.mailbox.listFolders(event.accountId);
      const messages = (
        await Promise.all(unseenMessageIds.map((messageId) => api.messages.get(messageId)))
      ).filter((message) => message !== null);

      const candidates = messages.filter((message) =>
        shouldNotifyMessage(message, folders, notificationScope)
      );

      if (candidates.length === 0) {
        return;
      }

      for (const message of candidates.slice(0, MAX_NOTIFICATIONS_PER_EVENT)) {
        const target = toNotificationTarget(message, folders);
        sendNotification({
          title: toNotificationTitle(message),
          body: toNotificationBody(message),
          autoCancel: true,
          extra: target
        });
        notifiedMessageIdsRef.current.add(message.id);
      }

      for (const message of messages) {
        notifiedMessageIdsRef.current.add(message.id);
      }
    },
    [notificationScope, quietHoursEnd, quietHoursStart]
  );

  useTauriEvent<DomainEvent>('domain:event', (payload) => {
    void handleDomainEvent(payload);
  }, { enabled });

  useEffect(() => {
    if (!tauriRuntime.isAvailable()) {
      return undefined;
    }

    let isMounted = true;
    let unregister: (() => Promise<void>) | undefined;

    void onAction(async (notification) => {
      const target = readNotificationTarget(notification.extra ?? {});
      if (!target) {
        return;
      }

      await show().catch(() => undefined);
      await getCurrentWindow().setFocus().catch(() => undefined);

      onOpenMessage?.({
        ...target,
        routeSegment: toNotificationRouteSegment(target)
      });
    }).then((listener) => {
      if (isMounted) {
        unregister = () => listener.unregister();
        return;
      }

      void listener.unregister();
    });

    return () => {
      isMounted = false;
      void unregister?.();
    };
  }, [onOpenMessage]);
};
