import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { SETTINGS_STORAGE_KEY } from '../constants/storageKeys';

interface SettingsContextType {
  useRelativeTime: boolean;
  setUseRelativeTime: (value: boolean) => void;
  autoCloseThemeSelector: boolean;
  setAutoCloseThemeSelector: (value: boolean) => void;
  notifyRemovedSavedPosts: boolean;
  setNotifyRemovedSavedPosts: (value: boolean) => void;
  defaultOmniPostsOnly: boolean;
  setDefaultOmniPostsOnly: (value: boolean) => void;
  stayOnPostAfterHide: boolean;
  setStayOnPostAfterHide: (value: boolean) => void;
  useInfiniteScroll: boolean;
  setUseInfiniteScroll: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface StoredSettings {
  useRelativeTime?: boolean;
  autoCloseThemeSelector?: boolean;
  notifyRemovedSavedPosts?: boolean;
  defaultOmniPostsOnly?: boolean;
  stayOnPostAfterHide?: boolean;
  useInfiniteScroll?: boolean;
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
  const [defaultOmniPostsOnly, setDefaultOmniPostsOnlyState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.defaultOmniPostsOnly ?? false;
  });
  const [stayOnPostAfterHide, setStayOnPostAfterHideState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.stayOnPostAfterHide ?? false;
  });
  const [useInfiniteScroll, setUseInfiniteScrollState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.useInfiniteScroll ?? true; // Default to infinite scroll
  });

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      const settings: StoredSettings = {
        useRelativeTime,
        autoCloseThemeSelector,
        notifyRemovedSavedPosts,
        defaultOmniPostsOnly,
        stayOnPostAfterHide,
        useInfiniteScroll,
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [useRelativeTime, autoCloseThemeSelector, notifyRemovedSavedPosts, defaultOmniPostsOnly, stayOnPostAfterHide, useInfiniteScroll]);

  const setUseRelativeTime = (value: boolean) => {
    setUseRelativeTimeState(value);
  };

  const setAutoCloseThemeSelector = (value: boolean) => {
    setAutoCloseThemeSelectorState(value);
  };

  const setNotifyRemovedSavedPosts = (value: boolean) => {
    setNotifyRemovedSavedPostsState(value);
  };

  const setDefaultOmniPostsOnly = (value: boolean) => {
    setDefaultOmniPostsOnlyState(value);
  };

  const setStayOnPostAfterHide = (value: boolean) => {
    setStayOnPostAfterHideState(value);
  };

  const setUseInfiniteScroll = (value: boolean) => {
    setUseInfiniteScrollState(value);
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
        defaultOmniPostsOnly,
        setDefaultOmniPostsOnly,
        stayOnPostAfterHide,
        setStayOnPostAfterHide,
        useInfiniteScroll,
        setUseInfiniteScroll,
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
