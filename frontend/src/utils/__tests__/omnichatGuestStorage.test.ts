import { beforeEach, describe, expect, it } from 'vitest';
import type { BotMessage } from '../../types/omnichat';
import {
  clearGuestMessages,
  getOmniChatAuthRedirectTarget,
  loadGuestMessages,
  saveGuestMessages,
} from '../omnichatGuestStorage';

const STORAGE_KEY = 'omnichat_guest_messages';

const sampleMessage = (id: number, content: string): BotMessage => ({
  id,
  conversation_id: 0,
  role: 'user',
  content,
  failed: false,
  created_at: '2026-07-02T10:00:00Z',
});

describe('omnichatGuestStorage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('scopes guest messages by persona id', () => {
    saveGuestMessages(11, [sampleMessage(1, 'persona one')]);
    saveGuestMessages(22, [sampleMessage(2, 'persona two')]);

    expect(loadGuestMessages(11)).toEqual([sampleMessage(1, 'persona one')]);
    expect(loadGuestMessages(22)).toEqual([sampleMessage(2, 'persona two')]);
  });

  it('removes only the targeted persona transcript', () => {
    saveGuestMessages(11, [sampleMessage(1, 'persona one')]);
    saveGuestMessages(22, [sampleMessage(2, 'persona two')]);

    clearGuestMessages(11);

    expect(loadGuestMessages(11)).toEqual([]);
    expect(loadGuestMessages(22)).toEqual([sampleMessage(2, 'persona two')]);
  });

  it('reads the legacy shared array format for the active persona', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([sampleMessage(1, 'legacy')]));

    expect(loadGuestMessages(33)).toEqual([sampleMessage(1, 'legacy')]);
  });

  it('preserves the query string in auth redirects', () => {
    expect(getOmniChatAuthRedirectTarget('/omnichat/c/guest', '?persona=17')).toBe(
      '/omnichat/c/guest?persona=17'
    );
  });
});
