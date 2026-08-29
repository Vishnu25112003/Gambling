import { useCallback, useState } from 'react';

const STORAGE_KEY = 'gambling-hub.sidebar-collapsed';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Whether the desktop sidebar is collapsed to an icon-only rail. Persisted so
 * the choice survives a reload; the mobile drawer ignores it entirely.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(readStored);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Private mode: the change still applies for this session.
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
