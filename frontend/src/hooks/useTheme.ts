import { useContext } from 'react';
import { ThemeContext, type ThemeState } from '../providers/ThemeProvider';

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
