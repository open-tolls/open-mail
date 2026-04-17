export type ThemeId = 'system' | 'dark' | 'light';

export type Theme = {
  id: Exclude<ThemeId, 'system'>;
  name: string;
  description: string;
  colorScheme: 'dark' | 'light';
  variables: Record<string, string>;
};

const darkTheme: Theme = {
  id: 'dark',
  name: 'Nocturne',
  description: 'Warm dark workspace for long reading sessions.',
  colorScheme: 'dark',
  variables: {
    '--bg': '#08111f',
    '--bg-elevated': 'rgba(10, 23, 39, 0.78)',
    '--bg-soft': 'rgba(15, 31, 53, 0.6)',
    '--bg-page':
      'radial-gradient(circle at top left, rgba(240, 141, 73, 0.18), transparent 24%), radial-gradient(circle at top right, rgba(132, 216, 199, 0.12), transparent 28%), linear-gradient(180deg, #0c1625 0%, #07101d 100%)',
    '--grid-line': 'rgba(255, 255, 255, 0.02)',
    '--line': 'rgba(255, 255, 255, 0.08)',
    '--line-strong': 'rgba(255, 255, 255, 0.16)',
    '--text': '#f5f1e8',
    '--muted': '#b9c1cd',
    '--accent': '#f6b66f',
    '--accent-strong': '#f08d49',
    '--success': '#84d8c7',
    '--shadow': '0 24px 60px rgba(0, 0, 0, 0.35)'
  }
};

const lightTheme: Theme = {
  id: 'light',
  name: 'Parchment',
  description: 'Soft editorial light theme with warm paper contrast.',
  colorScheme: 'light',
  variables: {
    '--bg': '#f8f1e7',
    '--bg-elevated': 'rgba(255, 250, 241, 0.84)',
    '--bg-soft': 'rgba(255, 255, 255, 0.7)',
    '--bg-page':
      'radial-gradient(circle at top left, rgba(240, 141, 73, 0.24), transparent 24%), radial-gradient(circle at top right, rgba(50, 119, 112, 0.13), transparent 28%), linear-gradient(180deg, #fff8ed 0%, #f2e6d6 100%)',
    '--grid-line': 'rgba(31, 18, 8, 0.035)',
    '--line': 'rgba(31, 18, 8, 0.11)',
    '--line-strong': 'rgba(31, 18, 8, 0.19)',
    '--text': '#24160c',
    '--muted': '#75685b',
    '--accent': '#b85f20',
    '--accent-strong': '#8f3f18',
    '--success': '#24766e',
    '--shadow': '0 24px 60px rgba(89, 59, 30, 0.18)'
  }
};

export const builtInThemes: Record<Exclude<ThemeId, 'system'>, Theme> = {
  dark: darkTheme,
  light: lightTheme
};

export const resolveTheme = (themeId: ThemeId, prefersDark: boolean) => {
  if (themeId === 'system') {
    return prefersDark ? darkTheme : lightTheme;
  }

  return builtInThemes[themeId];
};

export const applyTheme = (
  themeId: ThemeId,
  prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
) => {
  const theme = resolveTheme(themeId, prefersDark);
  const root = document.documentElement;

  root.dataset.theme = themeId;
  root.style.colorScheme = theme.colorScheme;
  Object.entries(theme.variables).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
};

export const nextThemeId = (themeId: ThemeId): ThemeId => {
  if (themeId === 'system') {
    return 'dark';
  }

  return themeId === 'dark' ? 'light' : 'system';
};
