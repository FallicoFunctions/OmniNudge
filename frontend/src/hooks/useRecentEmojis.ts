import { useState, useCallback } from 'react';

const DEFAULT_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏'];
const MAX_RECENT = 5;

const storageKey = (userId: number) => `omninudge_recent_emojis_${userId}`;

export function useRecentEmojis(userId: number) {
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey(userId));
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, MAX_RECENT);
        }
      }
    } catch {
      // ignore parse/storage errors
    }
    return DEFAULT_EMOJIS;
  });

  const addRecentEmoji = useCallback(
    (emoji: string) => {
      setRecentEmojis((prev) => {
        const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, MAX_RECENT);
        try {
          localStorage.setItem(storageKey(userId), JSON.stringify(next));
        } catch {
          // ignore storage quota errors (e.g. private browsing)
        }
        return next;
      });
    },
    [userId]
  );

  return { recentEmojis, addRecentEmoji };
}
