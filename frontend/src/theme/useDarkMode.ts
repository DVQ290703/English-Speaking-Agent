import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'vt_theme';
const LEGACY_KEY = 'va-theme';

// Hàm helper để áp dụng class 'dark' lên thẻ <html>
function applyThemeToDocument(isDark: boolean) {
  if (typeof document !== 'undefined') {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}

function readInitial(): boolean {
  try {
    let stored = localStorage.getItem(STORAGE_KEY);
    if (stored == null) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === 'dark' || legacy === 'light') {
        stored = legacy;
        try {
          localStorage.setItem(STORAGE_KEY, legacy);
        } catch {
          /* ignore */
        }
      }
    }

    let isDark = false;
    if (stored === 'dark') isDark = true;
    else if (stored === 'light') isDark = false;
    else {
      isDark =
        typeof window !== 'undefined' &&
        !!window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // Áp dụng luôn theme ngay khi đọc lần đầu
    applyThemeToDocument(isDark);
    return isDark;
  } catch {
    return false;
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();
let current = readInitial();

function setShared(next: boolean) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    // Quan trọng: Cập nhật class 'dark' lên DOM mỗi khi toggle
    applyThemeToDocument(next);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return current;
}

export function useDarkMode(): [boolean, () => void] {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggle = useCallback(() => {
    setShared(!current);
  }, []);

  return [dark, toggle];
}
