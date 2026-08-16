import { useEffect, useState } from 'react';

/** Subscribes to a media query. Used for the design's 900px sidebar breakpoint. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** The design switches from sidebar to drawer below 900px. */
export const useIsMobile = () => useMediaQuery('(max-width: 899px)');
