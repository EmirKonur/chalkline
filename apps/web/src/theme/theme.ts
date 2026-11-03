import { createStore, useStore } from '../lib/store.ts';
import { readJson, writeJson } from '../lib/storage.ts';
import type { ThemeName } from './palette.ts';

const KEY = 'chalkline:theme';
const THEME_COLOR: Record<ThemeName, string> = { chalkboard: '#1d2f29', whiteboard: '#f5f3ee' };

function initialTheme(): ThemeName {
  const stored = readJson<string>(KEY, 'chalkboard');
  return stored === 'whiteboard' ? 'whiteboard' : 'chalkboard';
}

export const themeStore = createStore<{ theme: ThemeName }>({ theme: initialTheme() });

/** Mirrors the theme onto <html> so CSS tokens switch, and remembers it. */
export function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export function setTheme(theme: ThemeName): void {
  themeStore.set({ theme });
  applyTheme(theme);
  writeJson(KEY, theme);
}

export function toggleTheme(): void {
  setTheme(themeStore.get().theme === 'chalkboard' ? 'whiteboard' : 'chalkboard');
}

export function useTheme(): ThemeName {
  return useStore(themeStore, (s) => s.theme);
}
