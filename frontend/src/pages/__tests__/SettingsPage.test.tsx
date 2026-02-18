import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../SettingsPage';

const setShowPushNotifications = vi.fn();
const enablePush = vi.fn();
const disablePush = vi.fn();

const buildSettingsMock = (showPushNotifications: boolean) => ({
  useRelativeTime: true,
  setUseRelativeTime: vi.fn(),
  autoCloseThemeSelector: false,
  setAutoCloseThemeSelector: vi.fn(),
  notifyArchivedMessages: false,
  setNotifyArchivedMessages: vi.fn(),
  notifyRemovedSavedPosts: true,
  setNotifyRemovedSavedPosts: vi.fn(),
  defaultOmniPostsOnly: false,
  setDefaultOmniPostsOnly: vi.fn(),
  stayOnPostAfterHide: false,
  setStayOnPostAfterHide: vi.fn(),
  useInfiniteScrollHome: false,
  setUseInfiniteScrollHome: vi.fn(),
  useInfiniteScrollHubs: false,
  setUseInfiniteScrollHubs: vi.fn(),
  useInfiniteScrollSubs: false,
  setUseInfiniteScrollSubs: vi.fn(),
  searchIncludeNsfwByDefault: false,
  setSearchIncludeNsfwByDefault: vi.fn(),
  blockAllNsfw: false,
  setBlockAllNsfw: vi.fn(),
  blockNsfwThumbnails: true,
  setBlockNsfwThumbnails: vi.fn(),
  accessRequestCooldownDisplay: 'days' as const,
  setAccessRequestCooldownDisplay: vi.fn(),
  fontSize: 'medium' as const,
  setFontSize: vi.fn(),
  transcriptionOptIn: false,
  setTranscriptionOptIn: vi.fn(),
  micDeviceId: '',
  setMicDeviceId: vi.fn(),
  cameraDeviceId: '',
  setCameraDeviceId: vi.fn(),
  speakerDeviceId: '',
  setSpeakerDeviceId: vi.fn(),
  quietHoursEnabled: false,
  setQuietHoursEnabled: vi.fn(),
  quietHoursStartMinutes: 1320,
  setQuietHoursStartMinutes: vi.fn(),
  quietHoursEndMinutes: 420,
  setQuietHoursEndMinutes: vi.fn(),
  quietHoursTimezone: 'UTC',
  readReceipts: true,
  setReadReceipts: vi.fn(),
  typingIndicators: true,
  setTypingIndicators: vi.fn(),
  showLastSeen: true,
  setShowLastSeen: vi.fn(),
  profileVisibility: 'public' as const,
  setProfileVisibility: vi.fn(),
  notificationSound: true,
  setNotificationSound: vi.fn(),
  showPushNotifications,
  setShowPushNotifications,
});

const useSettingsMock = vi.fn(() => buildSettingsMock(false));

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => useSettingsMock(),
}));

vi.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    isSupported: true,
    isPermissionGranted: false,
    isRegistered: false,
    requestPermission: enablePush,
    unregister: disablePush,
  }),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'test@example.com', email_verified: true },
    refreshUser: vi.fn(),
  }),
}));

vi.mock('../../hooks/useFeatureFlag', () => ({
  useFeatureFlag: () => false,
}));

vi.mock('../../services/keyManagementService', () => ({
  getOwnPublicKeyBase64: () => null,
}));

vi.mock('../../services/usersService', () => ({
  usersService: {
    updateEmail: vi.fn(),
    resendVerification: vi.fn(),
  },
}));

vi.mock('../../services/accountService', () => ({
  accountService: {
    requestDataExport: vi.fn(),
  },
}));

vi.mock('../../components/themes/ThemeSelector', () => ({
  default: () => <div>ThemeSelector</div>,
}));

vi.mock('../../components/themes/ThemeEditor', () => ({
  default: () => <div>ThemeEditor</div>,
}));

vi.mock('../../components/settings/LanguageSelector', () => ({
  LanguageSelector: () => <div>LanguageSelector</div>,
}));

vi.mock('../../components/common/Panel', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

vi.mock('../../i18n/languageUtils', () => ({
  getForcedDocumentDirection: () => null,
  setForcedDocumentDirection: vi.fn(),
  syncDocumentLanguageAttributes: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { returnObjects?: boolean }) =>
      options?.returnObjects ? [] : key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));

describe('SettingsPage push toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables push setting when currently enabled and unregister succeeds', async () => {
    useSettingsMock.mockReturnValue(buildSettingsMock(true));
    disablePush.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabs.notifications' }));
    fireEvent.click(screen.getByRole('switch', { name: 'common.accessibility.togglePushNotifications' }));

    await waitFor(() => {
      expect(disablePush).toHaveBeenCalledTimes(1);
      expect(setShowPushNotifications).toHaveBeenCalledWith(false);
    });
  });

  it('enables push setting only when permission flow succeeds', async () => {
    useSettingsMock.mockReturnValue(buildSettingsMock(false));
    enablePush.mockResolvedValue(true);

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabs.notifications' }));
    fireEvent.click(screen.getByRole('switch', { name: 'common.accessibility.togglePushNotifications' }));

    await waitFor(() => {
      expect(enablePush).toHaveBeenCalledTimes(1);
      expect(setShowPushNotifications).toHaveBeenCalledWith(true);
    });
  });

  it('keeps push setting unchanged when unregister fails', async () => {
    useSettingsMock.mockReturnValue(buildSettingsMock(true));
    disablePush.mockResolvedValue(false);

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabs.notifications' }));
    fireEvent.click(screen.getByRole('switch', { name: 'common.accessibility.togglePushNotifications' }));

    await waitFor(() => {
      expect(disablePush).toHaveBeenCalledTimes(1);
    });
    expect(setShowPushNotifications).not.toHaveBeenCalledWith(false);
  });
});
