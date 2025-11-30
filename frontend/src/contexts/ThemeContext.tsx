import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { themeService } from '../services/themeService';
import type { UserSettings, UserTheme } from '../types/theme';
import {
  applyCSSVariables,
  getStoredThemeId,
  hydrateThemeFromStorage,
  persistThemeSelection,
} from '../utils/theme';

interface ThemeContextValue {
  activeTheme: UserTheme | null;
  predefinedThemes: UserTheme[];
  customThemes: UserTheme[];
  cssVariables: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  selectTheme: (theme: UserTheme) => Promise<void>;
  selectThemeById: (themeId: number) => Promise<void>;
  refreshThemes: () => Promise<void>;
  userSettings: UserSettings | null;
  refreshSettings: () => Promise<void>;
  setAdvancedMode: (enabled: boolean) => Promise<void>;
}

type ThemeSelectionOptions = {
  notifyServer?: boolean;
  persist?: boolean;
};

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
ThemeContext.displayName = 'ThemeContext';

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [predefinedThemes, setPredefinedThemes] = useState<UserTheme[]>([]);
  const [customThemes, setCustomThemes] = useState<UserTheme[]>([]);
  const [activeTheme, setActiveTheme] = useState<UserTheme | null>(null);
  const [cssVariables, setCssVariables] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const selectionRequestId = useRef(0);

  // Hydrate immediately with cached CSS variables to avoid flashes
  useEffect(() => {
    const snapshot = hydrateThemeFromStorage();
    if (snapshot?.variables) {
      setCssVariables(snapshot.variables);
    }
  }, []);

  const selectTheme = useCallback(
    async (theme: UserTheme, options: ThemeSelectionOptions = {}) => {
      const { notifyServer = true, persist = true } = options;
      selectionRequestId.current += 1;
      const currentRequestId = selectionRequestId.current;
      setError(null);
      setActiveTheme(theme);

      const variables = theme.css_variables ?? {};
      applyCSSVariables(variables);
      setCssVariables(variables);

      if (persist) {
        persistThemeSelection(theme);
      }

      if (notifyServer) {
        try {
          await themeService.setActiveTheme(theme.id);
          if (currentRequestId === selectionRequestId.current) {
            setUserSettings((prev) =>
              prev ? { ...prev, active_theme_id: theme.id } : prev
            );
          }
        } catch (err) {
          console.error('Failed to sync theme selection', err);
          setError('Unable to sync theme selection with the server.');
        }
      }
    },
    []
  );

  const loadThemes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [predefined, myThemesResponse, settings] = await Promise.all([
        themeService.getPredefinedThemes(),
        themeService
          .getMyThemes()
          .then((response) => response.themes)
          .catch(() => [] as UserTheme[]),
        themeService.getUserSettings().catch(() => null),
      ]);

      const myThemes = myThemesResponse ?? [];
      setPredefinedThemes(predefined);
      setCustomThemes(myThemes);
      if (settings) {
        setUserSettings(settings);
      }

      const storedThemeId = getStoredThemeId();
      const targetId = settings?.active_theme_id ?? storedThemeId ?? null;
      const mergedThemes = [...predefined, ...myThemes];
      const targetTheme =
        (targetId ? mergedThemes.find((theme) => theme.id === targetId) : null) ??
        mergedThemes[0] ??
        null;

      if (targetTheme) {
        await selectTheme(targetTheme, { notifyServer: false });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load themes.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [selectTheme]);

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  const selectThemeById = useCallback(
    async (themeId: number) => {
      const mergedThemes = [...predefinedThemes, ...customThemes];
      const theme = mergedThemes.find((item) => item.id === themeId);
      if (!theme) {
        setError('Theme not found.');
        return;
      }
      await selectTheme(theme);
    },
    [customThemes, predefinedThemes, selectTheme]
  );

  const refreshThemes = useCallback(async () => {
    await loadThemes();
  }, [loadThemes]);

  const refreshSettings = useCallback(async () => {
    try {
      const settings = await themeService.getUserSettings();
      setUserSettings(settings);
    } catch (err) {
      console.error('Failed to refresh user settings', err);
    }
  }, []);

  const setAdvancedMode = useCallback(
    async (enabled: boolean) => {
      try {
        await themeService.setAdvancedMode(enabled);
        setUserSettings((prev) =>
          prev ? { ...prev, advanced_mode_enabled: enabled } : prev
        );
      } catch (err) {
        console.error('Failed to update advanced mode', err);
        throw err;
      }
    },
    []
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      activeTheme,
      predefinedThemes,
      customThemes,
      cssVariables,
      isLoading,
      error,
      userSettings,
      selectTheme,
      selectThemeById,
      refreshThemes,
      refreshSettings,
      setAdvancedMode,
    }),
    [
      activeTheme,
      predefinedThemes,
      customThemes,
      cssVariables,
      isLoading,
      error,
      userSettings,
      selectTheme,
      selectThemeById,
      refreshThemes,
      refreshSettings,
      setAdvancedMode,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
