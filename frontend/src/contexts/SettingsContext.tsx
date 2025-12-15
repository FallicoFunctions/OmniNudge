import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface SettingsContextType {
  useRelativeTime: boolean;
  setUseRelativeTime: (value: boolean) => void;
  autoCloseThemeSelector: boolean;
  setAutoCloseThemeSelector: (value: boolean) => void;
  notifyRemovedSavedPosts: boolean;
  setNotifyRemovedSavedPosts: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_STORAGE_KEY = 'omninudge-settings';

interface StoredSettings {
  useRelativeTime?: boolean;
  autoCloseThemeSelector?: boolean;
  notifyRemovedSavedPosts?: boolean;
}

const getStoredSettings = (): StoredSettings => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error);
  }
  return {};
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [useRelativeTime, setUseRelativeTimeState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.useRelativeTime ?? true; // Default to true
  });
  const [autoCloseThemeSelector, setAutoCloseThemeSelectorState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.autoCloseThemeSelector ?? false; // Default to keeping the dropdown open
  });
  const [notifyRemovedSavedPosts, setNotifyRemovedSavedPostsState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.notifyRemovedSavedPosts ?? true;
  });

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      const settings: StoredSettings = {
        useRelativeTime,
        autoCloseThemeSelector,
        notifyRemovedSavedPosts,
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [useRelativeTime, autoCloseThemeSelector, notifyRemovedSavedPosts]);

  const setUseRelativeTime = (value: boolean) => {
    setUseRelativeTimeState(value);
  };

  const setAutoCloseThemeSelector = (value: boolean) => {
    setAutoCloseThemeSelectorState(value);
  };

  const setNotifyRemovedSavedPosts = (value: boolean) => {
    setNotifyRemovedSavedPostsState(value);
  };

  return (
    <SettingsContext.Provider
      value={{
        useRelativeTime,
        setUseRelativeTime,
        autoCloseThemeSelector,
        setAutoCloseThemeSelector,
        notifyRemovedSavedPosts,
        setNotifyRemovedSavedPosts,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
