import { useCallback } from 'react';
import { useTauriEvent } from '@hooks/useTauriEvent';
import type { AppShellEvent } from '@lib/contracts';

type UseAppShellEventsOptions = {
  onComposeNew?: () => void;
};

export const useAppShellEvents = ({ onComposeNew }: UseAppShellEventsOptions = {}) => {
  const handleAppShellEvent = useCallback(
    (event: AppShellEvent) => {
      if (event.type === 'compose-new') {
        onComposeNew?.();
      }
    },
    [onComposeNew]
  );

  useTauriEvent<AppShellEvent>('app:event', handleAppShellEvent);
};
