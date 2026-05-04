import { useEffect } from 'react';
import { api, tauriRuntime } from '@lib/tauri-bridge';

export const useUnreadTrayIndicator = (unreadCount: number) => {
  useEffect(() => {
    if (!tauriRuntime.isAvailable()) {
      return;
    }

    void api.system.setTrayUnreadCount(unreadCount).catch(() => {
      // Tray title/tooltip support varies by platform.
    });
  }, [unreadCount]);
};
