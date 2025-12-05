import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

interface RedditBlockContextValue {
  blockedUsers: Set<string>;
  blockRedditUser: (username: string) => void;
  unblockRedditUser: (username: string) => void;
  isRedditUserBlocked: (username?: string | null) => boolean;
}

const RedditBlockContext = createContext<RedditBlockContextValue | undefined>(undefined);

const normalizeUsername = (username?: string | null) =>
  (username ?? '').trim().toLowerCase();

const loadFromStorage = (key: string): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function RedditBlockProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const storageKey = useMemo(() => {
    const suffix = user?.id ? String(user.id) : 'guest';
    return `reddit-blocked:${suffix}`;
  }, [user?.id]);

  const [blockedList, setBlockedList] = useState<string[]>(() => loadFromStorage(storageKey));

  useEffect(() => {
    setBlockedList(loadFromStorage(storageKey));
  }, [storageKey]);

  const persist = useCallback(
    (list: string[]) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(list));
      } catch {
        // ignore storage errors
      }
    },
    [storageKey]
  );

  const blockRedditUser = useCallback(
    (username: string) => {
      const normalized = normalizeUsername(username);
      if (!normalized) return;
      setBlockedList((prev) => {
        if (prev.includes(normalized)) return prev;
        const next = [...prev, normalized];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const unblockRedditUser = useCallback(
    (username: string) => {
      const normalized = normalizeUsername(username);
      if (!normalized) return;
      setBlockedList((prev) => {
        const next = prev.filter((u) => u !== normalized);
        if (next.length !== prev.length) {
          persist(next);
        }
        return next;
      });
    },
    [persist]
  );

  const blockedUsers = useMemo(() => new Set(blockedList), [blockedList]);

  const isRedditUserBlocked = useCallback(
    (username?: string | null) => blockedUsers.has(normalizeUsername(username)),
    [blockedUsers]
  );

  const value: RedditBlockContextValue = {
    blockedUsers,
    blockRedditUser,
    unblockRedditUser,
    isRedditUserBlocked,
  };

  return <RedditBlockContext.Provider value={value}>{children}</RedditBlockContext.Provider>;
}

export function useRedditBlocklist(): RedditBlockContextValue {
  const ctx = useContext(RedditBlockContext);
  if (!ctx) {
    throw new Error('useRedditBlocklist must be used within a RedditBlockProvider');
  }
  return ctx;
}
