import { useEffect, useRef } from 'react';
import { listen, type Event, type Options } from '@tauri-apps/api/event';
import { tauriRuntime } from '@lib/tauri-bridge';

type TauriEventHandler<TPayload> = (payload: TPayload, event: Event<TPayload>) => void;

type UseTauriEventOptions = Options & {
  enabled?: boolean;
};

export const useTauriEvent = <TPayload>(
  eventName: string,
  handler: TauriEventHandler<TPayload>,
  options: UseTauriEventOptions = {}
) => {
  const handlerRef = useRef(handler);
  const { enabled = true, target } = options;

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled || !tauriRuntime.isAvailable()) {
      return undefined;
    }

    let isMounted = true;
    let unlisten: (() => void) | undefined;

    void listen<TPayload>(
      eventName,
      (event) => {
        handlerRef.current(event.payload, event);
      },
      target === undefined ? undefined : { target }
    ).then((cleanup) => {
      if (isMounted) {
        unlisten = cleanup;
        return;
      }

      cleanup();
    });

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, [enabled, eventName, target]);
};
