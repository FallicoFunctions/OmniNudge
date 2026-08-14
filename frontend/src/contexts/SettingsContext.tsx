import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { SETTINGS_STORAGE_KEY } from '../constants/storageKeys';
import { userSettingsService } from '../services/userSettingsService';
import { hasBrowserSession } from '../services/authSession';

const hasAuthToken = (): boolean => {
  if (typeof window === 'undefined') return false;
  return hasBrowserSession();
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
  autoUnarchiveOnMessage: boolean;
  setAutoUnarchiveOnMessage: (value: boolean) => void;
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
  fontSize: 'small' | 'medium' | 'large';
  setFontSize: (value: 'small' | 'medium' | 'large') => void;
  transcriptionOptIn: boolean;
  setTranscriptionOptIn: (value: boolean) => void;
  micDeviceId: string;
  setMicDeviceId: (value: string) => void;
  cameraDeviceId: string;
  setCameraDeviceId: (value: string) => void;
  speakerDeviceId: string;
  setSpeakerDeviceId: (value: string) => void;
  quietHoursEnabled: boolean;
  setQuietHoursEnabled: (value: boolean) => void;
  quietHoursStartMinutes: number;
  setQuietHoursStartMinutes: (value: number) => void;
  quietHoursEndMinutes: number;
  setQuietHoursEndMinutes: (value: number) => void;
  quietHoursTimezone: string;
  setQuietHoursTimezone: (value: string) => void;
  batchNotifications: boolean;
  setBatchNotifications: (value: boolean) => void;
  readReceipts: boolean;
  setReadReceipts: (value: boolean) => void;
  typingIndicators: boolean;
  setTypingIndicators: (value: boolean) => void;
  showLastSeen: boolean;
  setShowLastSeen: (value: boolean) => void;
  profileVisibility: 'public' | 'private';
  setProfileVisibility: (value: 'public' | 'private') => void;
  wallPostPermission: 'all_friends' | 'requires_approval' | 'no_one';
  setWallPostPermission: (value: 'all_friends' | 'requires_approval' | 'no_one') => void;
  notificationSound: boolean;
  setNotificationSound: (value: boolean) => void;
  showPushNotifications: boolean;
  setShowPushNotifications: (value: boolean) => void;
  notifyCommentReplies: boolean;
  setNotifyCommentReplies: (value: boolean) => void;
  notifyPostMilestone: boolean;
  setNotifyPostMilestone: (value: boolean) => void;
  notifyPostVelocity: boolean;
  setNotifyPostVelocity: (value: boolean) => void;
  notifyCommentMilestone: boolean;
  setNotifyCommentMilestone: (value: boolean) => void;
  notifyCommentVelocity: boolean;
  setNotifyCommentVelocity: (value: boolean) => void;
  dailyDigest: boolean;
  setDailyDigest: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface StoredSettings {
  useRelativeTime?: boolean;
  autoCloseThemeSelector?: boolean;
  useInfiniteScrollHome?: boolean;
  useInfiniteScrollHubs?: boolean;
  useInfiniteScrollSubs?: boolean;
  notifyArchivedMessages?: boolean;
  autoUnarchiveOnMessage?: boolean;
  notifyRemovedSavedPosts?: boolean;
  defaultOmniPostsOnly?: boolean;
  stayOnPostAfterHide?: boolean;
  useInfiniteScroll?: boolean;
  searchIncludeNsfwByDefault?: boolean;
  blockAllNsfw?: boolean;
  blockNsfwThumbnails?: boolean;
  accessRequestCooldownDisplay?: 'days' | 'date' | 'both';
  fontSize?: 'small' | 'medium' | 'large';
  transcriptionOptIn?: boolean;
  micDeviceId?: string;
  cameraDeviceId?: string;
  speakerDeviceId?: string;
  quietHoursEnabled?: boolean;
  quietHoursStartMinutes?: number;
  quietHoursEndMinutes?: number;
  quietHoursTimezone?: string;
  batchNotifications?: boolean;
  readReceipts?: boolean;
  typingIndicators?: boolean;
  showLastSeen?: boolean;
  profileVisibility?: 'public' | 'private';
  wallPostPermission?: 'all_friends' | 'requires_approval' | 'no_one';
  notificationSound?: boolean;
  showPushNotifications?: boolean;
  notifyCommentReplies?: boolean;
  notifyPostMilestone?: boolean;
  notifyPostVelocity?: boolean;
  notifyCommentMilestone?: boolean;
  notifyCommentVelocity?: boolean;
  dailyDigest?: boolean;
  settingsVersion?: number;
}

const CURRENT_SETTINGS_VERSION = 13;

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
          autoUnarchiveOnMessage: parsed.autoUnarchiveOnMessage ?? true,
          accessRequestCooldownDisplay: parsed.accessRequestCooldownDisplay ?? 'days',
          blockNsfwThumbnails: parsed.blockNsfwThumbnails ?? true,
          fontSize: parsed.fontSize ?? 'medium',
          transcriptionOptIn: parsed.transcriptionOptIn ?? false,
          micDeviceId: parsed.micDeviceId ?? '',
          cameraDeviceId: parsed.cameraDeviceId ?? '',
          speakerDeviceId: parsed.speakerDeviceId ?? '',
          quietHoursEnabled: parsed.quietHoursEnabled ?? false,
          quietHoursStartMinutes: parsed.quietHoursStartMinutes ?? 1320,
          quietHoursEndMinutes: parsed.quietHoursEndMinutes ?? 420,
          quietHoursTimezone:
            parsed.quietHoursTimezone ??
            (typeof Intl !== 'undefined'
              ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC')
              : 'UTC'),
          batchNotifications: parsed.batchNotifications ?? true,
          readReceipts: parsed.readReceipts ?? true,
          typingIndicators: parsed.typingIndicators ?? true,
          showLastSeen: parsed.showLastSeen ?? true,
          profileVisibility:
            (parsed.profileVisibility as string) === 'friends_only'
              ? 'private'
              : (parsed.profileVisibility ?? 'public'),
          wallPostPermission: parsed.wallPostPermission ?? 'all_friends',
          notificationSound: parsed.notificationSound ?? true,
          notifyCommentReplies: parsed.notifyCommentReplies ?? true,
          notifyPostMilestone: parsed.notifyPostMilestone ?? true,
          notifyPostVelocity: parsed.notifyPostVelocity ?? true,
          notifyCommentMilestone: parsed.notifyCommentMilestone ?? true,
          notifyCommentVelocity: parsed.notifyCommentVelocity ?? true,
          dailyDigest: parsed.dailyDigest ?? false,
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
  const [autoUnarchiveOnMessage, setAutoUnarchiveOnMessageState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.autoUnarchiveOnMessage ?? true;
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
  const [fontSize, setFontSizeState] = useState<'small' | 'medium' | 'large'>(() => {
    const settings = getStoredSettings();
    return settings.fontSize ?? 'medium';
  });
  const [transcriptionOptIn, setTranscriptionOptInState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.transcriptionOptIn ?? false;
  });
  const [micDeviceId, setMicDeviceIdState] = useState<string>(() => {
    const settings = getStoredSettings();
    return settings.micDeviceId ?? '';
  });
  const [cameraDeviceId, setCameraDeviceIdState] = useState<string>(() => {
    const settings = getStoredSettings();
    return settings.cameraDeviceId ?? '';
  });
  const [speakerDeviceId, setSpeakerDeviceIdState] = useState<string>(() => {
    const settings = getStoredSettings();
    return settings.speakerDeviceId ?? '';
  });
  const [quietHoursEnabled, setQuietHoursEnabledState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.quietHoursEnabled ?? false;
  });
  const [quietHoursStartMinutes, setQuietHoursStartMinutesState] = useState<number>(() => {
    const settings = getStoredSettings();
    return settings.quietHoursStartMinutes ?? 1320;
  });
  const [quietHoursEndMinutes, setQuietHoursEndMinutesState] = useState<number>(() => {
    const settings = getStoredSettings();
    return settings.quietHoursEndMinutes ?? 420;
  });
  const [quietHoursTimezone, setQuietHoursTimezoneState] = useState<string>(() => {
    const settings = getStoredSettings();
    return (
      settings.quietHoursTimezone ??
      (typeof Intl !== 'undefined'
        ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC')
        : 'UTC')
    );
  });
  const [batchNotifications, setBatchNotificationsState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.batchNotifications ?? true;
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
  const [profileVisibility, setProfileVisibilityState] = useState<'public' | 'private'>(() => {
    const settings = getStoredSettings();
    return settings.profileVisibility ?? 'public';
  });
  const [wallPostPermission, setWallPostPermissionState] = useState<
    'all_friends' | 'requires_approval' | 'no_one'
  >(() => {
    const settings = getStoredSettings();
    return settings.wallPostPermission ?? 'all_friends';
  });
  const [notificationSound, setNotificationSoundState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.notificationSound ?? true;
  });
  const [showPushNotifications, setShowPushNotificationsState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.showPushNotifications ?? true;
  });
  const [notifyCommentReplies, setNotifyCommentRepliesState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.notifyCommentReplies ?? true;
  });
  const [notifyPostMilestone, setNotifyPostMilestoneState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.notifyPostMilestone ?? true;
  });
  const [notifyPostVelocity, setNotifyPostVelocityState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.notifyPostVelocity ?? true;
  });
  const [notifyCommentMilestone, setNotifyCommentMilestoneState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.notifyCommentMilestone ?? true;
  });
  const [notifyCommentVelocity, setNotifyCommentVelocityState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.notifyCommentVelocity ?? true;
  });
  const [dailyDigest, setDailyDigestState] = useState<boolean>(() => {
    const settings = getStoredSettings();
    return settings.dailyDigest ?? false;
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

        setUseRelativeTimeState(settings.use_relative_time ?? true);
        setAutoCloseThemeSelectorState(settings.auto_close_theme_selector ?? false);
        setNotifyArchivedMessagesState(settings.notify_archived_messages ?? false);
        setAutoUnarchiveOnMessageState(settings.auto_unarchive_on_message ?? true);
        setNotifyRemovedSavedPostsState(settings.notify_removed_saved_posts ?? true);
        setDefaultOmniPostsOnlyState(settings.default_omni_posts_only ?? false);
        setStayOnPostAfterHideState(settings.stay_on_post_after_hide ?? false);
        setUseInfiniteScrollHomeState(settings.use_infinite_scroll_home ?? false);
        setUseInfiniteScrollHubsState(settings.use_infinite_scroll_hubs ?? false);
        setUseInfiniteScrollSubsState(settings.use_infinite_scroll_subs ?? false);
        setUseInfiniteScrollState(settings.use_infinite_scroll ?? false);
        setSearchIncludeNsfwByDefaultState(settings.search_include_nsfw_by_default ?? false);
        setBlockAllNsfwState(settings.block_all_nsfw ?? false);
        setBlockNsfwThumbnailsState(settings.block_nsfw_thumbnails ?? true);
        setAccessRequestCooldownDisplayState(
          (settings.access_request_cooldown_display as 'days' | 'date' | 'both') ?? 'days'
        );
        setFontSizeState((settings.font_size as 'small' | 'medium' | 'large') ?? 'medium');
        setTranscriptionOptInState(settings.transcription_opt_in ?? false);
        setMicDeviceIdState(settings.mic_device_id ?? '');
        setCameraDeviceIdState(settings.camera_device_id ?? '');
        setSpeakerDeviceIdState(settings.speaker_device_id ?? '');
        setQuietHoursEnabledState(settings.quiet_hours_enabled ?? false);
        setQuietHoursStartMinutesState(settings.quiet_hours_start_minutes ?? 1320);
        setQuietHoursEndMinutesState(settings.quiet_hours_end_minutes ?? 420);
        setQuietHoursTimezoneState((current) => settings.quiet_hours_timezone ?? current);
        setBatchNotificationsState(settings.batch_notifications ?? true);
        setReadReceiptsState(settings.show_read_receipts ?? true);
        setTypingIndicatorsState(settings.show_typing_indicators ?? true);
        setShowLastSeenState(settings.show_last_seen ?? true);
        setProfileVisibilityState(
          (settings.profile_visibility as 'public' | 'private') ?? 'public'
        );
        setWallPostPermissionState(
          (settings.wall_post_permission as 'all_friends' | 'requires_approval' | 'no_one') ??
            'all_friends'
        );
        setNotificationSoundState(settings.notification_sound ?? true);
        setShowPushNotificationsState(settings.show_push_notifications ?? true);
        setNotifyCommentRepliesState(settings.notify_comment_replies ?? true);
        setNotifyPostMilestoneState(settings.notify_post_milestone ?? true);
        setNotifyPostVelocityState(settings.notify_post_velocity ?? true);
        setNotifyCommentMilestoneState(settings.notify_comment_milestone ?? true);
        setNotifyCommentVelocityState(settings.notify_comment_velocity ?? true);
        setDailyDigestState(settings.daily_digest ?? false);
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
        autoUnarchiveOnMessage,
        notifyRemovedSavedPosts,
        defaultOmniPostsOnly,
        stayOnPostAfterHide,
        useInfiniteScroll,
        searchIncludeNsfwByDefault,
        blockAllNsfw,
        blockNsfwThumbnails,
        accessRequestCooldownDisplay,
        fontSize,
        transcriptionOptIn,
        micDeviceId,
        cameraDeviceId,
        speakerDeviceId,
        quietHoursEnabled,
        quietHoursStartMinutes,
        quietHoursEndMinutes,
        quietHoursTimezone,
        batchNotifications,
        readReceipts,
        typingIndicators,
        showLastSeen,
        profileVisibility,
        wallPostPermission,
        notificationSound,
        showPushNotifications,
        notifyCommentReplies,
        notifyPostMilestone,
        notifyPostVelocity,
        notifyCommentMilestone,
        notifyCommentVelocity,
        dailyDigest,
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
    autoUnarchiveOnMessage,
    notifyRemovedSavedPosts,
    defaultOmniPostsOnly,
    stayOnPostAfterHide,
    useInfiniteScroll,
    searchIncludeNsfwByDefault,
    blockAllNsfw,
    blockNsfwThumbnails,
    accessRequestCooldownDisplay,
    fontSize,
    transcriptionOptIn,
    micDeviceId,
    cameraDeviceId,
    speakerDeviceId,
    quietHoursEnabled,
    quietHoursStartMinutes,
    quietHoursEndMinutes,
    quietHoursTimezone,
    batchNotifications,
    readReceipts,
    typingIndicators,
    showLastSeen,
    profileVisibility,
    wallPostPermission,
    notificationSound,
    showPushNotifications,
    notifyCommentReplies,
    notifyPostMilestone,
    notifyPostVelocity,
    notifyCommentMilestone,
    notifyCommentVelocity,
    dailyDigest,
  ]);

  // Apply font size immediately by adjusting the document root font-size.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const px = fontSize === 'small' ? 14 : fontSize === 'large' ? 18 : 16;
    document.documentElement.style.fontSize = `${px}px`;
  }, [fontSize]);

  const setUseRelativeTime = (value: boolean) => {
    const previous = useRelativeTime;
    setUseRelativeTimeState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ use_relative_time: value }).catch((error) => {
      console.error('[Settings] Failed to update relative time setting:', error);
      setUseRelativeTimeState(previous);
    });
  };

  const setAutoCloseThemeSelector = (value: boolean) => {
    const previous = autoCloseThemeSelector;
    setAutoCloseThemeSelectorState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ auto_close_theme_selector: value }).catch((error) => {
      console.error('[Settings] Failed to update theme selector behavior:', error);
      setAutoCloseThemeSelectorState(previous);
    });
  };

  const setUseInfiniteScrollHome = (value: boolean) => {
    const previous = useInfiniteScrollHome;
    setUseInfiniteScrollHomeState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ use_infinite_scroll_home: value }).catch((error) => {
      console.error('[Settings] Failed to update infinite scroll home setting:', error);
      setUseInfiniteScrollHomeState(previous);
    });
  };
  const setUseInfiniteScrollHubs = (value: boolean) => {
    const previous = useInfiniteScrollHubs;
    setUseInfiniteScrollHubsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ use_infinite_scroll_hubs: value }).catch((error) => {
      console.error('[Settings] Failed to update infinite scroll hubs setting:', error);
      setUseInfiniteScrollHubsState(previous);
    });
  };
  const setUseInfiniteScrollSubs = (value: boolean) => {
    const previous = useInfiniteScrollSubs;
    setUseInfiniteScrollSubsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ use_infinite_scroll_subs: value }).catch((error) => {
      console.error('[Settings] Failed to update infinite scroll subs setting:', error);
      setUseInfiniteScrollSubsState(previous);
    });
  };

  const setNotifyRemovedSavedPosts = (value: boolean) => {
    const previous = notifyRemovedSavedPosts;
    setNotifyRemovedSavedPostsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ notify_removed_saved_posts: value }).catch((error) => {
      console.error('[Settings] Failed to update removed saved posts notification setting:', error);
      setNotifyRemovedSavedPostsState(previous);
    });
  };

  const setNotifyArchivedMessages = (value: boolean) => {
    const previous = notifyArchivedMessages;
    setNotifyArchivedMessagesState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ notify_archived_messages: value }).catch((error) => {
      console.error('[Settings] Failed to update archived messages notification setting:', error);
      setNotifyArchivedMessagesState(previous);
    });
  };

  const setAutoUnarchiveOnMessage = (value: boolean) => {
    const previous = autoUnarchiveOnMessage;
    setAutoUnarchiveOnMessageState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ auto_unarchive_on_message: value }).catch((error) => {
      console.error('[Settings] Failed to update auto-unarchive-on-message setting:', error);
      setAutoUnarchiveOnMessageState(previous);
    });
  };

  const setDefaultOmniPostsOnly = (value: boolean) => {
    const previous = defaultOmniPostsOnly;
    setDefaultOmniPostsOnlyState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ default_omni_posts_only: value }).catch((error) => {
      console.error('[Settings] Failed to update omni-only default setting:', error);
      setDefaultOmniPostsOnlyState(previous);
    });
  };

  const setStayOnPostAfterHide = (value: boolean) => {
    const previous = stayOnPostAfterHide;
    setStayOnPostAfterHideState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ stay_on_post_after_hide: value }).catch((error) => {
      console.error('[Settings] Failed to update stay-on-post-after-hide setting:', error);
      setStayOnPostAfterHideState(previous);
    });
  };

  const setUseInfiniteScroll = (value: boolean) => {
    const previous = useInfiniteScroll;
    setUseInfiniteScrollState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ use_infinite_scroll: value }).catch((error) => {
      console.error('[Settings] Failed to update infinite scroll setting:', error);
      setUseInfiniteScrollState(previous);
    });
  };
  const setSearchIncludeNsfwByDefault = (value: boolean) => {
    const previous = searchIncludeNsfwByDefault;
    setSearchIncludeNsfwByDefaultState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ search_include_nsfw_by_default: value }).catch((error) => {
      console.error('[Settings] Failed to update search NSFW setting:', error);
      setSearchIncludeNsfwByDefaultState(previous);
    });
  };
  const setBlockAllNsfw = (value: boolean) => {
    const previous = blockAllNsfw;
    setBlockAllNsfwState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ block_all_nsfw: value }).catch((error) => {
      console.error('[Settings] Failed to update block-all-NSFW setting:', error);
      setBlockAllNsfwState(previous);
    });
  };
  const setBlockNsfwThumbnails = (value: boolean) => {
    const previous = blockNsfwThumbnails;
    setBlockNsfwThumbnailsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ block_nsfw_thumbnails: value }).catch((error) => {
      console.error('[Settings] Failed to update block-NSFW-thumbnails setting:', error);
      setBlockNsfwThumbnailsState(previous);
    });
  };
  const setAccessRequestCooldownDisplay = (value: 'days' | 'date' | 'both') => {
    const previous = accessRequestCooldownDisplay;
    setAccessRequestCooldownDisplayState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ access_request_cooldown_display: value }).catch((error) => {
      console.error('[Settings] Failed to update cooldown display setting:', error);
      setAccessRequestCooldownDisplayState(previous);
    });
  };

  const setFontSize = (value: 'small' | 'medium' | 'large') => {
    const previous = fontSize;
    setFontSizeState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ font_size: value }).catch((error) => {
      console.error('[Settings] Failed to update font size setting:', error);
      setFontSizeState(previous);
    });
  };

  const setTranscriptionOptIn = (value: boolean) => {
    const previous = transcriptionOptIn;
    setTranscriptionOptInState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ transcription_opt_in: value }).catch((error) => {
      console.error('[Settings] Failed to update transcription opt-in:', error);
      setTranscriptionOptInState(previous);
    });
  };

  const setMicDeviceId = (value: string) => {
    const trimmed = value.trim();
    const previous = micDeviceId;
    setMicDeviceIdState(trimmed);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ mic_device_id: trimmed }).catch((error) => {
      console.error('[Settings] Failed to update mic device setting:', error);
      setMicDeviceIdState(previous);
    });
  };

  const setCameraDeviceId = (value: string) => {
    const trimmed = value.trim();
    const previous = cameraDeviceId;
    setCameraDeviceIdState(trimmed);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ camera_device_id: trimmed }).catch((error) => {
      console.error('[Settings] Failed to update camera device setting:', error);
      setCameraDeviceIdState(previous);
    });
  };

  const setSpeakerDeviceId = (value: string) => {
    const trimmed = value.trim();
    const previous = speakerDeviceId;
    setSpeakerDeviceIdState(trimmed);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ speaker_device_id: trimmed }).catch((error) => {
      console.error('[Settings] Failed to update speaker device setting:', error);
      setSpeakerDeviceIdState(previous);
    });
  };

  const setQuietHoursEnabled = (value: boolean) => {
    const previous = quietHoursEnabled;
    setQuietHoursEnabledState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ quiet_hours_enabled: value }).catch((error) => {
      console.error('[Settings] Failed to update quiet hours enabled:', error);
      setQuietHoursEnabledState(previous);
    });
  };

  const setQuietHoursStartMinutes = (value: number) => {
    const clamped = Math.max(0, Math.min(1439, value));
    const previous = quietHoursStartMinutes;
    setQuietHoursStartMinutesState(clamped);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ quiet_hours_start_minutes: clamped }).catch((error) => {
      console.error('[Settings] Failed to update quiet hours start:', error);
      setQuietHoursStartMinutesState(previous);
    });
  };

  const setQuietHoursEndMinutes = (value: number) => {
    const clamped = Math.max(0, Math.min(1439, value));
    const previous = quietHoursEndMinutes;
    setQuietHoursEndMinutesState(clamped);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ quiet_hours_end_minutes: clamped }).catch((error) => {
      console.error('[Settings] Failed to update quiet hours end:', error);
      setQuietHoursEndMinutesState(previous);
    });
  };

  const setQuietHoursTimezone = (value: string) => {
    const trimmed = value.trim();
    const previous = quietHoursTimezone;
    setQuietHoursTimezoneState(trimmed);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ quiet_hours_timezone: trimmed }).catch((error) => {
      console.error('[Settings] Failed to update quiet hours timezone:', error);
      setQuietHoursTimezoneState(previous);
    });
  };

  const setBatchNotifications = (value: boolean) => {
    const previous = batchNotifications;
    setBatchNotificationsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ batch_notifications: value }).catch((error) => {
      console.error('[Settings] Failed to update batch notifications:', error);
      setBatchNotificationsState(previous);
    });
  };

  const setReadReceipts = (value: boolean) => {
    const previous = readReceipts;
    setReadReceiptsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ show_read_receipts: value }).catch((error) => {
      console.error('[Settings] Failed to update read receipts setting:', error);
      setReadReceiptsState(previous);
    });
  };

  const setTypingIndicators = (value: boolean) => {
    const previous = typingIndicators;
    setTypingIndicatorsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ show_typing_indicators: value }).catch((error) => {
      console.error('[Settings] Failed to update typing indicators setting:', error);
      setTypingIndicatorsState(previous);
    });
  };

  const setShowLastSeen = (value: boolean) => {
    const previous = showLastSeen;
    setShowLastSeenState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ show_last_seen: value }).catch((error) => {
      console.error('[Settings] Failed to update last seen setting:', error);
      setShowLastSeenState(previous);
    });
  };

  const setProfileVisibility = (value: 'public' | 'private') => {
    const previous = profileVisibility;
    setProfileVisibilityState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ profile_visibility: value }).catch((error) => {
      console.error('[Settings] Failed to update profile visibility setting:', error);
      setProfileVisibilityState(previous);
    });
  };

  const setWallPostPermission = (value: 'all_friends' | 'requires_approval' | 'no_one') => {
    const previous = wallPostPermission;
    setWallPostPermissionState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ wall_post_permission: value }).catch((error) => {
      console.error('[Settings] Failed to update wall post permission setting:', error);
      setWallPostPermissionState(previous);
    });
  };

  const setNotificationSound = (value: boolean) => {
    const previous = notificationSound;
    setNotificationSoundState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ notification_sound: value }).catch((error) => {
      console.error('[Settings] Failed to update notification sound setting:', error);
      setNotificationSoundState(previous);
    });
  };

  const setShowPushNotifications = (value: boolean) => {
    const previous = showPushNotifications;
    setShowPushNotificationsState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ show_push_notifications: value }).catch((error) => {
      console.error('[Settings] Failed to update push notifications setting:', error);
      setShowPushNotificationsState(previous);
    });
  };

  const setNotifyCommentReplies = (value: boolean) => {
    const previous = notifyCommentReplies;
    setNotifyCommentRepliesState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ notify_comment_replies: value }).catch((error) => {
      console.error('[Settings] Failed to update comment reply notifications:', error);
      setNotifyCommentRepliesState(previous);
    });
  };

  const setNotifyPostMilestone = (value: boolean) => {
    const previous = notifyPostMilestone;
    setNotifyPostMilestoneState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ notify_post_milestone: value }).catch((error) => {
      console.error('[Settings] Failed to update post milestone notifications:', error);
      setNotifyPostMilestoneState(previous);
    });
  };

  const setNotifyPostVelocity = (value: boolean) => {
    const previous = notifyPostVelocity;
    setNotifyPostVelocityState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ notify_post_velocity: value }).catch((error) => {
      console.error('[Settings] Failed to update post velocity notifications:', error);
      setNotifyPostVelocityState(previous);
    });
  };

  const setNotifyCommentMilestone = (value: boolean) => {
    const previous = notifyCommentMilestone;
    setNotifyCommentMilestoneState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ notify_comment_milestone: value }).catch((error) => {
      console.error('[Settings] Failed to update comment milestone notifications:', error);
      setNotifyCommentMilestoneState(previous);
    });
  };

  const setNotifyCommentVelocity = (value: boolean) => {
    const previous = notifyCommentVelocity;
    setNotifyCommentVelocityState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ notify_comment_velocity: value }).catch((error) => {
      console.error('[Settings] Failed to update comment velocity notifications:', error);
      setNotifyCommentVelocityState(previous);
    });
  };

  const setDailyDigest = (value: boolean) => {
    const previous = dailyDigest;
    setDailyDigestState(value);
    if (!hasAuthToken()) return;
    void userSettingsService.update({ daily_digest: value }).catch((error) => {
      console.error('[Settings] Failed to update daily digest setting:', error);
      setDailyDigestState(previous);
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
        autoUnarchiveOnMessage,
        setAutoUnarchiveOnMessage,
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
        fontSize,
        setFontSize,
        transcriptionOptIn,
        setTranscriptionOptIn,
        micDeviceId,
        setMicDeviceId,
        cameraDeviceId,
        setCameraDeviceId,
        speakerDeviceId,
        setSpeakerDeviceId,
        quietHoursEnabled,
        setQuietHoursEnabled,
        quietHoursStartMinutes,
        setQuietHoursStartMinutes,
        quietHoursEndMinutes,
        setQuietHoursEndMinutes,
        quietHoursTimezone,
        setQuietHoursTimezone,
        batchNotifications,
        setBatchNotifications,
        readReceipts,
        setReadReceipts,
        typingIndicators,
        setTypingIndicators,
        showLastSeen,
        setShowLastSeen,
        profileVisibility,
        setProfileVisibility,
        wallPostPermission,
        setWallPostPermission,
        notificationSound,
        setNotificationSound,
        showPushNotifications,
        setShowPushNotifications,
        notifyCommentReplies,
        setNotifyCommentReplies,
        notifyPostMilestone,
        setNotifyPostMilestone,
        notifyPostVelocity,
        setNotifyPostVelocity,
        notifyCommentMilestone,
        setNotifyCommentMilestone,
        notifyCommentVelocity,
        setNotifyCommentVelocity,
        dailyDigest,
        setDailyDigest,
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
