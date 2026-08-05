import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { safeLocalStorage } from '../browser/safeStorage';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme(): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (safeLocalStorage.getItem('theme') === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    safeLocalStorage.setItem('theme', theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme() {
        setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
