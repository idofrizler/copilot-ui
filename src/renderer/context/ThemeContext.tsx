import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Theme, ThemeColors } from '../themes';
import { builtInThemes, darkTheme, lightTheme } from '../themes';

interface ThemeContextValue {
  /** Current theme preference ('system' or a theme id) */
  themePreference: string;
  /** The currently active theme object */
  activeTheme: Theme;
  /** All available themes (built-in + external) */
  availableThemes: Theme[];
  /** Set the theme preference */
  setTheme: (themeId: string) => void;
  /** Import a new theme from file */
  importTheme: () => Promise<{ success: boolean; error?: string }>;
  /** List of external theme files that failed to load */
  invalidThemeFiles: string[];
  /** Whether themes are still loading */
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Apply a theme's colors as CSS variables on the document root
 */
function applyThemeToDocument(theme: Theme): void {
  const root = document.documentElement;
  const colors = theme.colors;

  // Map theme color keys to CSS variable names
  const cssVarMap: Record<keyof ThemeColors, string> = {
    bg: '--copilot-bg',
    surface: '--copilot-surface',
    surfaceHover: '--copilot-surface-hover',
    border: '--copilot-border',
    borderHover: '--copilot-border-hover',
    accent: '--copilot-accent',
    accentHover: '--copilot-accent-hover',
    accentMuted: '--copilot-accent-muted',
    text: '--copilot-text',
    textMuted: '--copilot-text-muted',
    textInverse: '--copilot-text-inverse',
    success: '--copilot-success',
    successMuted: '--copilot-success-muted',
    warning: '--copilot-warning',
    warningMuted: '--copilot-warning-muted',
    error: '--copilot-error',
    errorMuted: '--copilot-error-muted',
    scrollbarThumb: '--copilot-scrollbar-thumb',
    scrollbarThumbHover: '--copilot-scrollbar-thumb-hover',
    selection: '--copilot-selection',
    shadow: '--copilot-shadow',
    shadowStrong: '--copilot-shadow-strong',
    terminalBg: '--copilot-terminal-bg',
    terminalText: '--copilot-terminal-text',
    terminalCursor: '--copilot-terminal-cursor',
  };

  // Apply each color as a CSS variable
  for (const [key, cssVar] of Object.entries(cssVarMap)) {
    const colorKey = key as keyof ThemeColors;
    if (colors[colorKey]) {
      root.style.setProperty(cssVar, colors[colorKey]);
    }
  }

  // Set data-theme attribute for any CSS that needs it
  root.setAttribute('data-theme', theme.type);
}

/**
 * Convert CSS color (rgb/rgba/hex) to hex string for Win32 titleBarOverlay API
 */
function cssColorToHex(color: string): string {
  // Already hex
  if (color.startsWith('#'))
    return color.length === 4 || color.length === 7 ? color : color.slice(0, 7);

  // Parse rgb/rgba
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  return '#2d2d2d'; // fallback
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps): React.ReactElement {
  const [themePreference, setThemePreference] = useState<string>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('dark');
  const [externalThemes, setExternalThemes] = useState<Theme[]>([]);
  const [invalidThemeFiles, setInvalidThemeFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // All available themes
  const availableThemes = useMemo(() => {
    return [...builtInThemes, ...externalThemes];
  }, [externalThemes]);

  // Resolve the active theme based on preference and system theme
  const activeTheme = useMemo(() => {
    if (themePreference === 'system') {
      return systemTheme === 'dark' ? darkTheme : lightTheme;
    }

    const found = availableThemes.find((t) => t.id === themePreference);
    return found || darkTheme;
  }, [themePreference, systemTheme, availableThemes]);

  // Load saved preference and external themes on mount
  useEffect(() => {
    async function init() {
      // Disable transitions during initial load
      document.documentElement.classList.add('no-transitions');

      try {
        // Wait for electronAPI to be available (should be immediate in production)
        if (!window.electronAPI?.theme) {
          console.warn('electronAPI.theme not available yet, waiting...');
          // Wait a bit and retry once in case of race condition
          await new Promise((resolve) => setTimeout(resolve, 100));

          if (!window.electronAPI?.theme) {
            console.error('electronAPI.theme still not available after waiting');
            return;
          }
        }

        // Load saved preference
        const savedPreference = await window.electronAPI.theme.get();
        if (savedPreference) {
          setThemePreference(savedPreference);
        }

        // Get current system theme
        const sysTheme = await window.electronAPI.theme.getSystemTheme();
        setSystemTheme(sysTheme);

        // Load external themes
        const { themes, invalidFiles } = await window.electronAPI.theme.listExternal();
        setExternalThemes(themes as unknown as Theme[]);
        setInvalidThemeFiles(invalidFiles);
      } catch (err) {
        console.error('Failed to initialize themes:', err);
      } finally {
        setIsLoading(false);

        // Re-enable transitions after a brief delay
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document.documentElement.classList.remove('no-transitions');
          });
        });
      }
    }

    init();
  }, []);

  // Subscribe to system theme changes
  useEffect(() => {
    if (!window.electronAPI?.theme?.onSystemChange) return;

    const unsubscribe = window.electronAPI.theme.onSystemChange(({ systemTheme: newTheme }) => {
      setSystemTheme(newTheme);
    });

    return unsubscribe;
  }, []);

  // Apply theme whenever activeTheme changes
  useEffect(() => {
    applyThemeToDocument(activeTheme);

    // On Windows, update native title bar overlay colors to match theme
    if (window.electronAPI?.platform === 'win32') {
      const surface = cssColorToHex(activeTheme.colors.surface);
      const text = cssColorToHex(activeTheme.colors.text);
      window.electronAPI.window.updateTitleBarOverlay({
        color: surface,
        symbolColor: text,
      });
    }
  }, [activeTheme]);

  // Set theme and persist
  const setTheme = useCallback(async (themeId: string) => {
    setThemePreference(themeId);
    await window.electronAPI.theme.set(themeId);
  }, []);

  // Import a theme
  const importTheme = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    const result = await window.electronAPI.theme.import();

    if (result.success && result.theme) {
      // Reload external themes
      const { themes, invalidFiles } = await window.electronAPI.theme.listExternal();
      setExternalThemes(themes as unknown as Theme[]);
      setInvalidThemeFiles(invalidFiles);

      // Automatically select the imported theme
      await setTheme(result.theme.id);

      return { success: true };
    }

    if (result.canceled) {
      return { success: false };
    }

    return { success: false, error: result.error || 'Theme file is not valid' };
  }, [setTheme]);

  const value: ThemeContextValue = {
    themePreference,
    activeTheme,
    availableThemes,
    setTheme,
    importTheme,
    invalidThemeFiles,
    isLoading,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access theme context
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
