import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface SettingsContextType {
  useRelativeTime: boolean;
  setUseRelativeTime: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_STORAGE_KEY = 'omninudge-settings';

interface StoredSettings {
  useRelativeTime?: boolean;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [useRelativeTime, setUseRelativeTimeState] = useState<boolean>(() => {
    // Load from localStorage on mount
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const settings: StoredSettings = JSON.parse(stored);
        return settings.useRelativeTime ?? true; // Default to true
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
    }
    return true; // Default to relative time
  });

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      const settings: StoredSettings = {
        useRelativeTime,
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [useRelativeTime]);

  const setUseRelativeTime = (value: boolean) => {
    setUseRelativeTimeState(value);
  };

  return (
    <SettingsContext.Provider
      value={{
        useRelativeTime,
        setUseRelativeTime,
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
