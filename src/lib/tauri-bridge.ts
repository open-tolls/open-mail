import { invoke } from '@tauri-apps/api/core';
import type { MailboxOverview } from '@lib/contracts';

const isTauriRuntimeAvailable = () =>
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

const invokeOrThrow = async <T>(command: string, args?: Record<string, unknown>) => {
  if (!isTauriRuntimeAvailable()) {
    throw new Error('Tauri runtime unavailable');
  }

  return invoke<T>(command, args);
};

export const api = {
  mailbox: {
    overview: () => invokeOrThrow<MailboxOverview>('mailbox_overview')
  }
};

export const tauriRuntime = {
  isAvailable: isTauriRuntimeAvailable
};

