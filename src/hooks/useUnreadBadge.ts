import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { tauriRuntime } from '@lib/tauri-bridge';

export const useUnreadBadge = (unreadCount: number) => {
  useEffect(() => {
    if (!tauriRuntime.isAvailable()) {
      return;
    }

    void getCurrentWindow()
      .setBadgeCount(unreadCount > 0 ? unreadCount : undefined)
      .catch(() => {
        // Windows and some Linux environments may not support badges.
      });
  }, [unreadCount]);
};
