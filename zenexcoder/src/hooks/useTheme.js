import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';

export function useTheme() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.zezenexcoderr?.store?.set('theme', theme).catch(() => {});
  }, [theme]);

  useEffect(() => {
    window.zezenexcoderr?.store?.get('theme', 'dark').then(setTheme).catch(() => {});
  }, [setTheme]);

  return { theme, setTheme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
