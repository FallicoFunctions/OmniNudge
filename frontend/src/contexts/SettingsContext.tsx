import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { SETTINGS_STORAGE_KEY } from '../constants/storageKeys';
import { userSettingsService } from '../services/userSettingsService';

const hasAuthToken = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token'));
};

interface SettingsContextType {
  useRelativeTime: boolean;
  setUseRelativeTime: (value: boolean) => void;
  autoCloseThemeSelector: boolean;
  setAutoCloseThemeSelector: (value: boolean) => void;
  useInfiniteScrollHome: boolean;
  setUseInfiniteScrollHome: (value: boolean) => void;
  useInfiniteScrollHubs: boolean;
  setUseInfiniteScrollHubs: (value: boolean) => void;
  useInfiniteScrollSubs: boolean;
  setUseInfiniteScrollSubs: (value: boolean) => void;
  notifyArchivedMessages: boolean;
  setNotifyArchivedMessages: (value: boolean) => void;
  notifyRemovedSavedPosts: boolean;
  setNotifyRemovedSavedPosts: (value: boolean) => void;
  defaultOmniPostsOnly: boolean;
  setDefaultOmniPostsOnly: (value: boolean) => void;
  stayOnPostAfterHide: boolean;
  setStayOnPostAfterHide: (value: boolean) => void;
  useInfiniteScroll: boolean;
  setUseInfiniteScroll: (value: boolean) => void;
  searchIncludeNsfwByDefault: boolean;
  setSearchIncludeNsfwByDefault: (value: boolean) => void;
  blockAllNsfw: boolean;
  setBlockAllNsfw: (value: boolean) => void;
  blockNsfwThumbnails: boolean;
  setBlockNsfwThumbnails: (value: boolean) => void;
  accessRequestCooldownDisplay: 'days' | 'date' | 'both';
  setAccessRequestCooldownDisplay: (value: 'days' | 'date' | 'both') => void;
  readReceipts: boolean;
  setReadReceipts: (value: boolean) => void;
  typingIndicators: boolean;
  setTypingIndicators: (value: boolean) => void;
  showLastSeen: boolean;
  setShowLastSeen: (value: boolean) => void;
  notificationSound: boolean;
  setNotificationSound: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface StoredSettings {
  useRelativeTime?: boolean;
  autoCloseThemeSelector?: boolean;
  useInfiniteScrollHome?: boolean;
  useInfiniteScrollHubs?: boolean;
  useInfiniteScrollSubs?: boolean;
  notifyArchivedMessages?: boolean;
  notifyRemovedSavedPosts?: boolean;
  defaultOmniPostsOnly?: boolean;
  stayOnPostAfterHide?: boolean;
  useInfiniteScroll?: boolean;
  searchIncludeNsfwByDefault?: boolean;
  blockAllNsfw?: boolean;
  blockNsfwThumbnails?: boolean;
  accessRequestCooldownDisplay?: 'days' | 'date' | 'both';
  readReceipts?: boolean;
  typingIndicators?: boolean;
  showLastSeen?: boolean;
  notificationSound?: boolean;
  settingsVersion?: number;
}

const CURRENT_SETTINGS_VERSION = 6;

const getStoredSettings = (): StoredSettings => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as StoredSettings;
      const storedVersion = parsed.settingsVersion ?? 1;
      if (storedVersion < CURRENT_SETTINGS_VERSION) {
        const migrated: StoredSettings = {
          ...parsed,
          useInfiniteScrollHome: false,
          useInfiniteScrollHubs: false,
          useInfiniteScrollSubs: false,
          useInfiniteScroll: false,
          accessRequestCooldownDisplay: parsed.accessRequestCooldownDisplay ?? 'days',
          blockNsfwThumbnails: parsed.blockNsfwThumbnails ?? true,
          readReceipts: parsed.readReceipts ?? true,
          typingIndicators: parsed.typingIndicators ?? true,
          showLastSeen: parsed.showLastSeen ?? true,
          notificationSound: parsed.notificationSound ?? true,
          settingsVersion: CURRENT_SETTINGS_VERSION,
        };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return parsed;
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
  const [useInfiniteScrollHome, setUseInfiniteScrollHomeState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.useInfiniteScrollHome ?? false;
  });
  const [useInfiniteScrollHubs, setUseInfiniteScrollHubsState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.useInfiniteScrollHubs ?? false;
  });
  const [useInfiniteScrollSubs, setUseInfiniteScrollSubsState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.useInfiniteScrollSubs ?? false;
  });
  const [notifyArchivedMessages, setNotifyArchivedMessagesState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.notifyArchivedMessages ?? false; // Default: no notifications for archived chats
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
    return settings.useInfiniteScroll ?? false;
  });
  const [searchIncludeNsfwByDefault, setSearchIncludeNsfwByDefaultState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.searchIncludeNsfwByDefault ?? false;
  });
  const [blockAllNsfw, setBlockAllNsfwState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.blockAllNsfw ?? false;
  });
  const [blockNsfwThumbnails, setBlockNsfwThumbnailsState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.blockNsfwThumbnails ?? true;
  });
  const [accessRequestCooldownDisplay, setAccessRequestCooldownDisplayState] = useState<
    'days' | 'date' | 'both'
  >(() => {
    const settings = getStoredSettings();
    return settings.accessRequestCooldownDisplay ?? 'days';
  });
  const [readReceipts, setReadReceiptsState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.readReceipts ?? true;
  });
  const [typingIndicators, setTypingIndicatorsState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.typingIndicators ?? true;
  });
  const [showLastSeen, setShowLastSeenState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.showLastSeen ?? true;
  });
  const [notificationSound, setNotificationSoundState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.notificationSound ?? true;
  });

  // Hydrate messaging privacy settings from server when authenticated.
  useEffect(() => {
    if (!hasAuthToken()) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const settings = await userSettingsService.get();
        if (cancelled) return;

        setReadReceiptsState(settings.show_read_receipts ?? true);
        setTypingIndicatorsState(settings.show_typing_indicators ?? true);
        setShowLastSeenState(settings.show_last_seen ?? true);
        setNotificationSoundState(settings.notification_sound ?? true);
      } catch (error) {
        // Best-effort: fall back to localStorage snapshot.
        console.warn('[Settings] Failed to load server settings, using local settings:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      const settings: StoredSettings = {
        useRelativeTime,
        autoCloseThemeSelector,
        useInfiniteScrollHome,
        useInfiniteScrollHubs,
        useInfiniteScrollSubs,
        notifyArchivedMessages,
        notifyRemovedSavedPosts,
        defaultOmniPostsOnly,
        stayOnPostAfterHide,
        useInfiniteScroll,
        searchIncludeNsfwByDefault,
        blockAllNsfw,
        blockNsfwThumbnails,
        accessRequestCooldownDisplay,
        readReceipts,
        typingIndicators,
        showLastSeen,
        notificationSound,
        settingsVersion: CURRENT_SETTINGS_VERSION,
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  }, [
    useRelativeTime,
    autoCloseThemeSelector,
    useInfiniteScrollHome,
    useInfiniteScrollHubs,
    useInfiniteScrollSubs,
    notifyArchivedMessages,
    notifyRemovedSavedPosts,
    defaultOmniPostsOnly,
    stayOnPostAfterHide,
    useInfiniteScroll,
    searchIncludeNsfwByDefault,
    blockAllNsfw,
    blockNsfwThumbnails,
    accessRequestCooldownDisplay,
    readReceipts,
    typingIndicators,
    showLastSeen,
    notificationSound,
  ]);

  const setUseRelativeTime = (value: boolean) => {
    setUseRelativeTimeState(value);
  };

  const setAutoCloseThemeSelector = (value: boolean) => {
    setAutoCloseThemeSelectorState(value);
  };

  const setUseInfiniteScrollHome = (value: boolean) => {
    setUseInfiniteScrollHomeState(value);
  };
  const setUseInfiniteScrollHubs = (value: boolean) => {
    setUseInfiniteScrollHubsState(value);
  };
  const setUseInfiniteScrollSubs = (value: boolean) => {
    setUseInfiniteScrollSubsState(value);
  };

  const setNotifyRemovedSavedPosts = (value: boolean) => {
    setNotifyRemovedSavedPostsState(value);
  };

  const setNotifyArchivedMessages = (value: boolean) => {
    setNotifyArchivedMessagesState(value);
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
  const setSearchIncludeNsfwByDefault = (value: boolean) => {
    setSearchIncludeNsfwByDefaultState(value);
  };
  const setBlockAllNsfw = (value: boolean) => {
    setBlockAllNsfwState(value);
  };
  const setBlockNsfwThumbnails = (value: boolean) => {
    setBlockNsfwThumbnailsState(value);
  };
  const setAccessRequestCooldownDisplay = (value: 'days' | 'date' | 'both') => {
    setAccessRequestCooldownDisplayState(value);
  };

  const setReadReceipts = (value: boolean) => {
    const previous = readReceipts;
    setReadReceiptsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService
      .update({ show_read_receipts: value })
      .catch((error) => {
        console.error('[Settings] Failed to update read receipts setting:', error);
        setReadReceiptsState(previous);
      });
  };

  const setTypingIndicators = (value: boolean) => {
    const previous = typingIndicators;
    setTypingIndicatorsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService
      .update({ show_typing_indicators: value })
      .catch((error) => {
        console.error('[Settings] Failed to update typing indicators setting:', error);
        setTypingIndicatorsState(previous);
      });
  };

  const setShowLastSeen = (value: boolean) => {
    const previous = showLastSeen;
    setShowLastSeenState(value);
    if (!hasAuthToken()) return;
    void userSettingsService
      .update({ show_last_seen: value })
      .catch((error) => {
        console.error('[Settings] Failed to update last seen setting:', error);
        setShowLastSeenState(previous);
      });
  };

  const setNotificationSound = (value: boolean) => {
    const previous = notificationSound;
    setNotificationSoundState(value);
    if (!hasAuthToken()) return;
    void userSettingsService
      .update({ notification_sound: value })
      .catch((error) => {
        console.error('[Settings] Failed to update notification sound setting:', error);
        setNotificationSoundState(previous);
      });
  };

  return (
    <SettingsContext.Provider
      value={{
        useRelativeTime,
        setUseRelativeTime,
        autoCloseThemeSelector,
        setAutoCloseThemeSelector,
        useInfiniteScrollHome,
        setUseInfiniteScrollHome,
        useInfiniteScrollHubs,
        setUseInfiniteScrollHubs,
        useInfiniteScrollSubs,
        setUseInfiniteScrollSubs,
        notifyArchivedMessages,
        setNotifyArchivedMessages,
        notifyRemovedSavedPosts,
        setNotifyRemovedSavedPosts,
        defaultOmniPostsOnly,
        setDefaultOmniPostsOnly,
        stayOnPostAfterHide,
        setStayOnPostAfterHide,
        useInfiniteScroll,
        setUseInfiniteScroll,
        searchIncludeNsfwByDefault,
        setSearchIncludeNsfwByDefault,
        blockAllNsfw,
        setBlockAllNsfw,
        blockNsfwThumbnails,
        setBlockNsfwThumbnails,
        accessRequestCooldownDisplay,
        setAccessRequestCooldownDisplay,
        readReceipts,
        setReadReceipts,
        typingIndicators,
        setTypingIndicators,
        showLastSeen,
        setShowLastSeen,
        notificationSound,
        setNotificationSound,
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
