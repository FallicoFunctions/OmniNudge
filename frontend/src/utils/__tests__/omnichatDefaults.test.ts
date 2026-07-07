import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearOmniChatDefaults,
  loadOmniChatDefaults,
  mapOmniChatDefaultsToUserSettings,
  mapUserSettingsToOmniChatDefaults,
  mergeConversationSettingsWithDefaults,
  saveOmniChatDefaults,
} from '../omnichatDefaults';

describe('omnichatDefaults', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty defaults when nothing is saved', () => {
    expect(loadOmniChatDefaults('guest')).toEqual({
      user_name: '',
      user_age: '',
      user_gender: '',
    });
  });

  it('loads saved defaults', () => {
    saveOmniChatDefaults({
      user_name: 'Riley',
      user_age: '28',
      user_gender: 'F',
    }, 'guest');

    expect(loadOmniChatDefaults('guest')).toEqual({
      user_name: 'Riley',
      user_age: '28',
      user_gender: 'F',
    });
  });

  it('clears defaults', () => {
    saveOmniChatDefaults({
      user_name: 'Riley',
      user_age: '28',
      user_gender: 'F',
    }, 'guest');
    clearOmniChatDefaults('guest');

    expect(loadOmniChatDefaults('guest')).toEqual({
      user_name: '',
      user_age: '',
      user_gender: '',
    });
  });

  it('keeps guest and authenticated defaults separate', () => {
    saveOmniChatDefaults(
      {
        user_name: 'Guest Riley',
        user_age: '22',
        user_gender: 'F',
      },
      'guest'
    );
    saveOmniChatDefaults(
      {
        user_name: 'Member Riley',
        user_age: '28',
        user_gender: 'F',
      },
      'authenticated'
    );

    expect(loadOmniChatDefaults('guest')).toEqual({
      user_name: 'Guest Riley',
      user_age: '22',
      user_gender: 'F',
    });
    expect(loadOmniChatDefaults('authenticated')).toEqual({
      user_name: 'Member Riley',
      user_age: '28',
      user_gender: 'F',
    });
  });

  it('merges explicit overrides over defaults', () => {
    expect(
      mergeConversationSettingsWithDefaults(
        { user_name: 'Riley', user_age: '28', user_gender: 'F' },
        { user_name: '', user_age: '33', user_gender: '' }
      )
    ).toEqual({
      user_name: 'Riley',
      user_age: '33',
      user_gender: 'F',
    });
  });

  it('maps user settings into OmniChat defaults', () => {
    expect(
      mapUserSettingsToOmniChatDefaults({
        omnichat_default_user_name: 'Riley',
        omnichat_default_user_age: '28',
        omnichat_default_user_gender: 'F',
      })
    ).toEqual({
      user_name: 'Riley',
      user_age: '28',
      user_gender: 'F',
    });
  });

  it('maps OmniChat defaults into user settings updates', () => {
    expect(
      mapOmniChatDefaultsToUserSettings({
        user_name: 'Riley',
        user_age: '28',
        user_gender: 'F',
      })
    ).toEqual({
      omnichat_default_user_name: 'Riley',
      omnichat_default_user_age: '28',
      omnichat_default_user_gender: 'F',
    });
  });
});
