import { useCallback, useMemo, useRef } from 'react';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification';
import { useTauriEvent } from '@hooks/useTauriEvent';
import { api, tauriRuntime } from '@lib/tauri-bridge';
import type { DomainEvent } from '@lib/contracts';
import {
  isWithinQuietHours,
  shouldNotifyMessage,
  toNotificationBody,
  toNotificationTitle
} from '@lib/desktop-notifications';
import { usePreferencesStore } from '@stores/usePreferencesStore';

const MAX_NOTIFICATIONS_PER_EVENT = 3;

export const useDesktopNotifications = () => {
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
      if (event.type !== 'messages-changed' || event.messageIds.length === 0) {
        return;
      }

      if (isWithinQuietHours(new Date(), quietHoursStart, quietHoursEnd)) {
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

      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        permissionGranted = (await requestPermission()) === 'granted';
      }

      if (!permissionGranted) {
        return;
      }

      for (const message of candidates.slice(0, MAX_NOTIFICATIONS_PER_EVENT)) {
        sendNotification({
          title: toNotificationTitle(message),
          body: toNotificationBody(message)
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
};
