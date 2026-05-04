import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';

export type OAuthCallbackPayload = {
  code: string;
  state: string | null;
};

export const parseOAuthCallbackUrl = (url: string): OAuthCallbackPayload | null => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'openmail:' || parsed.hostname !== 'oauth' || parsed.pathname !== '/callback') {
      return null;
    }

    const code = parsed.searchParams.get('code')?.trim();
    if (!code) {
      return null;
    }

    return {
      code,
      state: parsed.searchParams.get('state')?.trim() || null
    };
  } catch {
    return null;
  }
};

export const getCurrentOAuthCallbacks = async (): Promise<OAuthCallbackPayload[]> => {
  const urls = await getCurrent();
  return (urls ?? []).map(parseOAuthCallbackUrl).filter((payload): payload is OAuthCallbackPayload => payload !== null);
};

export const listenToOAuthCallbacks = async (
  handler: (payloads: OAuthCallbackPayload[]) => void
): Promise<() => void> => {
  const unlisten = await onOpenUrl((urls) => {
    const payloads = urls.map(parseOAuthCallbackUrl).filter((payload): payload is OAuthCallbackPayload => payload !== null);
    if (payloads.length > 0) {
      handler(payloads);
    }
  });

  return unlisten;
};
