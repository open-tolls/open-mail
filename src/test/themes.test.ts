import { describe, expect, it } from 'vitest';
import { applyTheme, nextThemeId, resolveTheme } from '@lib/themes';

describe('themes', () => {
  it('resolves system theme from OS preference', () => {
    expect(resolveTheme('system', true).id).toBe('dark');
    expect(resolveTheme('system', false).id).toBe('light');
  });

  it('applies theme variables to the document root', () => {
    applyTheme('light', false);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#f8f1e7');

    applyTheme('system', true);

    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#08111f');
  });

  it('cycles built-in theme ids predictably', () => {
    expect(nextThemeId('system')).toBe('dark');
    expect(nextThemeId('dark')).toBe('light');
    expect(nextThemeId('light')).toBe('system');
  });
});
