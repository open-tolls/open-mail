import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTauriEvent } from '@hooks/useTauriEvent';
import type { DomainEvent } from '@lib/contracts';
import { getInvalidationKeysForDomainEvent } from '@lib/query-events';

export const useDomainEvents = () => {
  const queryClient = useQueryClient();

  const handleDomainEvent = useCallback(
    (domainEvent: DomainEvent) => {
      for (const queryKey of getInvalidationKeysForDomainEvent(domainEvent)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    [queryClient]
  );

  useTauriEvent<DomainEvent>('domain:event', handleDomainEvent);
};
