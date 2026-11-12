import { useEffect, useState } from 'react';

export type ThemeChoice = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'anwc-studio-theme';

function readStored(): ThemeChoice {
  try {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function nextTheme(choice: ThemeChoice): ThemeChoice {
  return choice === 'auto' ? 'light' : choice === 'light' ? 'dark' : 'auto';
}

/**
 * Theme choice applied as `data-theme` on <html>. "auto" removes the attribute
 * so index.css follows `prefers-color-scheme`.
 */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readStored);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (choice === 'auto') delete root.dataset.theme;
    else root.dataset.theme = choice;
    try {
      if (choice === 'auto') window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Storage can be blocked; the choice still applies for this session.
    }
  }, [choice]);
  return [choice, setChoice];
}
