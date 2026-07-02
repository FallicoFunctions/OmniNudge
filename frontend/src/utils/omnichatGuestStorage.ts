import type { BotMessage } from '../types/omnichat';

const GUEST_STORAGE_KEY = 'omnichat_guest_messages';

type GuestStorageMap = Record<string, BotMessage[]>;

function parseStoredValue(raw: string | null): GuestStorageMap | BotMessage[] | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as GuestStorageMap | BotMessage[];
  } catch {
    return null;
  }
}

function isMessageArray(value: unknown): value is BotMessage[] {
  return Array.isArray(value);
}

function isStorageMap(value: unknown): value is GuestStorageMap {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getOmniChatAuthRedirectTarget(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

export function loadGuestMessages(personaId: number | null): BotMessage[] {
  if (!personaId || typeof sessionStorage === 'undefined') return [];

  const stored = parseStoredValue(sessionStorage.getItem(GUEST_STORAGE_KEY));
  if (!stored) return [];

  if (isMessageArray(stored)) {
    return stored;
  }

  if (!isStorageMap(stored)) {
    return [];
  }

  return stored[String(personaId)] ?? [];
}

export function saveGuestMessages(personaId: number | null, messages: BotMessage[]) {
  if (!personaId || typeof sessionStorage === 'undefined') return;

  const stored = parseStoredValue(sessionStorage.getItem(GUEST_STORAGE_KEY));
  const next: GuestStorageMap = isStorageMap(stored) ? { ...stored } : {};

  if (messages.length === 0) {
    delete next[String(personaId)];
  } else {
    next[String(personaId)] = messages;
  }

  sessionStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(next));
}

export function clearGuestMessages(personaId: number | null) {
  if (typeof sessionStorage === 'undefined') return;

  if (!personaId) {
    sessionStorage.removeItem(GUEST_STORAGE_KEY);
    return;
  }

  const stored = parseStoredValue(sessionStorage.getItem(GUEST_STORAGE_KEY));
  if (!isStorageMap(stored)) {
    sessionStorage.removeItem(GUEST_STORAGE_KEY);
    return;
  }

  const next = { ...stored };
  delete next[String(personaId)];

  if (Object.keys(next).length === 0) {
    sessionStorage.removeItem(GUEST_STORAGE_KEY);
    return;
  }

  sessionStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(next));
}
