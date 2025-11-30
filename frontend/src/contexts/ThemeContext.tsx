import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [error, setError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const selectionRequestId = useRef(0);
  const hasInitializedTheme = useRef(false);
  const queryClient = useQueryClient();

  // Only fetch themes if user is authenticated
  const isAuthenticated = !!localStorage.getItem('auth_token');

  const {
    data: themeLists,
    isLoading: isThemesLoading,
    isFetching: isFetchingThemes,
    refetch: refetchThemeLists,
    error: themeError,
  } = useQuery({
    queryKey: ['themes', 'lists'],
    queryFn: async () => {
      const [predefined, myThemesResponse] = await Promise.all([
        themeService.getPredefinedThemes(),
        themeService
          .getMyThemes()
          .then((response) => response.themes)
          .catch(() => [] as UserTheme[]),
      ]);
      return { predefined, custom: myThemesResponse ?? [] };
    },
    staleTime: 1000 * 60 * 5,
    enabled: isAuthenticated,
    retry: false,
  });

  const {
    data: settingsData,
    isLoading: isSettingsLoading,
    refetch: refetchSettingsQuery,
  } = useQuery({
    queryKey: ['user', 'settings'],
    queryFn: () => themeService.getUserSettings(),
    staleTime: 1000 * 60,
    enabled: isAuthenticated,
    retry: false,
  });

  const isLoading = isThemesLoading || isSettingsLoading || isFetchingThemes;

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

      // Add smooth transition animation (Section 13.1)
      document.body.classList.add('theme-transitioning');

      const variables = theme.css_variables ?? {};
      applyCSSVariables(variables);
      setCssVariables(variables);

      // Remove transition class after animation completes
      setTimeout(() => {
        document.body.classList.remove('theme-transitioning');
      }, 300);

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
            queryClient.setQueryData<UserSettings | undefined>(
              ['user', 'settings'],
              (prev) => (prev ? { ...prev, active_theme_id: theme.id } : prev)
            );
          }
        } catch (err) {
          console.error('Failed to sync theme selection', err);
          setError('Unable to sync theme selection with the server.');
        }
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (themeLists) {
      setPredefinedThemes(themeLists.predefined);
      setCustomThemes(themeLists.custom);
    }
  }, [themeLists]);

  useEffect(() => {
    if (settingsData) {
      setUserSettings(settingsData);
    }
  }, [settingsData]);

  useEffect(() => {
    if (hasInitializedTheme.current) return;
    if (!themeLists) return;

    const mergedThemes = [...themeLists.predefined, ...themeLists.custom];
    if (mergedThemes.length === 0) return;

    const storedThemeId = getStoredThemeId();
    const targetId = userSettings?.active_theme_id ?? storedThemeId ?? null;
    const targetTheme =
      (targetId ? mergedThemes.find((theme) => theme.id === targetId) : null) ??
      mergedThemes[0] ??
      null;

    if (targetTheme) {
      hasInitializedTheme.current = true;
      selectTheme(targetTheme, { notifyServer: false });
    }
  }, [themeLists, userSettings, selectTheme]);

  useEffect(() => {
    if (themeError instanceof Error) {
      setError(themeError.message);
    } else if (!themeError) {
      setError(null);
    }
  }, [themeError]);

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
    await refetchThemeLists();
  }, [refetchThemeLists]);

  const refreshSettings = useCallback(async () => {
    await refetchSettingsQuery();
  }, [refetchSettingsQuery]);

  const setAdvancedMode = useCallback(
    async (enabled: boolean) => {
      try {
        await themeService.setAdvancedMode(enabled);
        setUserSettings((prev) =>
          prev ? { ...prev, advanced_mode_enabled: enabled } : prev
        );
        queryClient.setQueryData<UserSettings | undefined>(['user', 'settings'], (prev) =>
          prev ? { ...prev, advanced_mode_enabled: enabled } : prev
        );
      } catch (err) {
        console.error('Failed to update advanced mode', err);
        throw err;
      }
    },
    [queryClient]
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
