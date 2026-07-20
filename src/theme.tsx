import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface Theme {
  scheme: 'light' | 'dark';
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  danger: string;
  dangerBg: string;
  dangerText: string;
  success: string;
  warning: string;
  warningBg: string;
  warningText: string;
  chipSelectedBg: string;
  chipSelectedText: string;
  skeletonBase: string;
  skeletonHighlight: string;
  undoBg: string;
  undoText: string;
  undoAction: string;
}

const light: Theme = {
  scheme: 'light',
  bg: '#f9f9f7',
  surface: '#fcfcfb',
  surfaceAlt: '#f0efec',
  border: '#e1e0d9',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  primary: '#2563eb',
  primaryText: '#ffffff',
  danger: '#d03b3b',
  dangerBg: '#fbe4e4',
  dangerText: '#a52a2a',
  success: '#0ca30c',
  warning: '#fab219',
  warningBg: '#fef3c7',
  warningText: '#92400e',
  chipSelectedBg: '#111827',
  chipSelectedText: '#ffffff',
  skeletonBase: '#eceae4',
  skeletonHighlight: '#f7f6f2',
  undoBg: '#1f2937',
  undoText: '#ffffff',
  undoAction: '#60a5fa',
};

const dark: Theme = {
  scheme: 'dark',
  bg: '#0d0d0d',
  surface: '#1a1a19',
  surfaceAlt: '#242422',
  border: '#2c2c2a',
  text: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#898781',
  primary: '#3987e5',
  primaryText: '#ffffff',
  danger: '#e66767',
  dangerBg: '#3a2223',
  dangerText: '#f2a3a3',
  success: '#0ca30c',
  warning: '#c98500',
  warningBg: '#3a2f13',
  warningText: '#f2c976',
  chipSelectedBg: '#f0efec',
  chipSelectedText: '#0b0b0b',
  skeletonBase: '#242422',
  skeletonHighlight: '#2f2f2c',
  undoBg: '#2c2c2a',
  undoText: '#ffffff',
  undoAction: '#86b6ef',
};

export type ThemeMode = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'theme_mode';

interface ThemeContextValue {
  theme: Theme;
  resolved: 'light' | 'dark';
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
    });
  }, []);

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setMode]);

  const theme = resolved === 'dark' ? dark : light;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolved, mode, setMode, toggle }),
    [theme, resolved, mode, setMode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Devuelve el Theme resuelto (respeta la preferencia manual o el sistema). */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  return ctx ? ctx.theme : light;
}

/** Controles de tema para el botón de cambio claro/oscuro. */
export function useThemeControls(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: light,
      resolved: 'light',
      mode: 'system',
      setMode: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
