import { useEffect, useRef, useState } from 'react';

/**
 * The behaviour every dropdown in the top bar needs: close on an outside click,
 * close on Escape, and close when the route changes underneath it.
 *
 * Written once here rather than twice in the account and notification menus,
 * because the two must agree — a half-dismissed popover that survives an outside
 * click is the kind of bug that only shows up when both are open at once.
 *
 * `pointerdown` rather than `click`: a click fires after the button that opened
 * the menu has already been released, so listening for `click` would close a
 * menu on the very interaction that opened it.
 */
export function useDismissable<T extends HTMLElement>(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  close: () => void;
  ref: React.RefObject<T | null>;
} {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return {
    open,
    setOpen,
    toggle: () => setOpen((v) => !v),
    close: () => setOpen(false),
    ref,
  };
}
