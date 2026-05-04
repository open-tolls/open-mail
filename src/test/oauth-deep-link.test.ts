import { describe, expect, it } from 'vitest';
import { parseOAuthCallbackUrl } from '@lib/oauth-deep-link';

describe('oauth deep link parsing', () => {
  it('extracts the authorization code and state from the callback URL', () => {
    expect(
      parseOAuthCallbackUrl('openmail://oauth/callback?code=returned-code&state=csrf-state')
    ).toEqual({
      code: 'returned-code',
      state: 'csrf-state'
    });
  });

  it('ignores unrelated URLs and incomplete callbacks', () => {
    expect(parseOAuthCallbackUrl('openmail://oauth/callback?state=missing-code')).toBeNull();
    expect(parseOAuthCallbackUrl('https://example.com/callback?code=returned-code')).toBeNull();
  });
});
