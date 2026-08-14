import type { ConversationSettings } from '../types/omnichat';
import type { UpdateUserSettingsRequest } from '../services/userSettingsService';
import type { UserSettings } from '../types/theme';

const OMNICHAT_GUEST_DEFAULTS_KEY = 'omnichat_guest_defaults';
const OMNICHAT_AUTH_DEFAULTS_KEY = 'omnichat_auth_defaults';
type OmniChatDefaultsScope = 'guest' | 'authenticated';

const EMPTY_DEFAULTS: ConversationSettings = {
  user_name: '',
  user_age: '',
  user_gender: '',
};

function getDefaultsStorageKey(scope: OmniChatDefaultsScope) {
  return scope === 'authenticated' ? OMNICHAT_AUTH_DEFAULTS_KEY : OMNICHAT_GUEST_DEFAULTS_KEY;
}

export function loadOmniChatDefaults(scope: OmniChatDefaultsScope = 'guest'): ConversationSettings {
  if (typeof localStorage === 'undefined') return EMPTY_DEFAULTS;

  try {
    const raw = localStorage.getItem(getDefaultsStorageKey(scope));
    if (!raw) return EMPTY_DEFAULTS;

    const parsed = JSON.parse(raw) as Partial<ConversationSettings>;
    return {
      user_name: typeof parsed.user_name === 'string' ? parsed.user_name : '',
      user_age: typeof parsed.user_age === 'string' ? parsed.user_age : '',
      user_gender: typeof parsed.user_gender === 'string' ? parsed.user_gender : '',
    };
  } catch {
    return EMPTY_DEFAULTS;
  }
}

export function saveOmniChatDefaults(
  settings: ConversationSettings,
  scope: OmniChatDefaultsScope = 'guest'
) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(getDefaultsStorageKey(scope), JSON.stringify(settings));
}

export function clearOmniChatDefaults(scope: OmniChatDefaultsScope = 'guest') {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(getDefaultsStorageKey(scope));
}

export function mapUserSettingsToOmniChatDefaults(
  settings?: Partial<
    Pick<
      UserSettings,
      'omnichat_default_user_name' | 'omnichat_default_user_age' | 'omnichat_default_user_gender'
    >
  > | null
): ConversationSettings {
  return {
    user_name:
      typeof settings?.omnichat_default_user_name === 'string'
        ? settings.omnichat_default_user_name
        : '',
    user_age:
      typeof settings?.omnichat_default_user_age === 'string'
        ? settings.omnichat_default_user_age
        : '',
    user_gender:
      typeof settings?.omnichat_default_user_gender === 'string'
        ? settings.omnichat_default_user_gender
        : '',
  };
}

export function mapOmniChatDefaultsToUserSettings(
  settings: ConversationSettings
): Pick<
  UpdateUserSettingsRequest,
  'omnichat_default_user_name' | 'omnichat_default_user_age' | 'omnichat_default_user_gender'
> {
  return {
    omnichat_default_user_name: settings.user_name,
    omnichat_default_user_age: settings.user_age,
    omnichat_default_user_gender: settings.user_gender,
  };
}

export function mergeConversationSettingsWithDefaults(
  defaults: ConversationSettings,
  overrides?: ConversationSettings
): ConversationSettings {
  if (!overrides) return defaults;

  return {
    user_name: overrides.user_name || defaults.user_name,
    user_age: overrides.user_age || defaults.user_age,
    user_gender: overrides.user_gender || defaults.user_gender,
  };
}
