import { useCallback, useEffect, useState } from 'react';
import { messagesService } from '../services/messagesService';
import type { Message, WsThreadUpdateEvent } from '../types/messages';

interface UseThreadOptions {
  rootMessageId: number | null;
  open: boolean;
  pageSize?: number;
}

interface ThreadCacheEntry {
  rootMessage: Message | null;
  replies: Message[];
  replyCount: number;
  muted: boolean;
}

const MAX_THREAD_CACHE_ENTRIES = 100;
const threadCache = new Map<number, ThreadCacheEntry>();

function getThreadCacheEntry(rootMessageId: number): ThreadCacheEntry | undefined {
  const cached = threadCache.get(rootMessageId);
  if (!cached) return undefined;
  // Refresh insertion order for simple LRU behavior.
  threadCache.delete(rootMessageId);
  threadCache.set(rootMessageId, cached);
  return cached;
}

function setThreadCacheEntry(rootMessageId: number, entry: ThreadCacheEntry) {
  if (threadCache.has(rootMessageId)) {
    threadCache.delete(rootMessageId);
  }
  threadCache.set(rootMessageId, entry);
  if (threadCache.size > MAX_THREAD_CACHE_ENTRIES) {
    const oldestKey = threadCache.keys().next().value;
    if (oldestKey !== undefined) {
      threadCache.delete(oldestKey);
    }
  }
}

export function __resetThreadCacheForTests() {
  threadCache.clear();
}

export function useThread({ rootMessageId, open, pageSize = 20 }: UseThreadOptions) {
  const [rootMessage, setRootMessage] = useState<Message | null>(null);
  const [replies, setReplies] = useState<Message[]>([]);
  const [replyCount, setReplyCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMore = replies.length < replyCount;

  const applyCache = useCallback((entry: ThreadCacheEntry) => {
    setRootMessage(entry.rootMessage);
    setReplies(entry.replies);
    setReplyCount(entry.replyCount);
    setMuted(entry.muted);
  }, []);

  const loadInitial = useCallback(
    async (force = false) => {
      if (!open || !rootMessageId) return;
      setError(null);

      const cached = getThreadCacheEntry(rootMessageId);
      if (!force && cached) {
        applyCache(cached);
        return;
      }

      setLoading(true);
      try {
        const response = await messagesService.getMessageThread(rootMessageId, pageSize, 0);
        const entry: ThreadCacheEntry = {
          rootMessage: response.root_message,
          replies: response.replies,
          replyCount: response.reply_count,
          muted: response.muted ?? false,
        };
        setThreadCacheEntry(rootMessageId, entry);
        applyCache(entry);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load thread');
      } finally {
        setLoading(false);
      }
    },
    [applyCache, open, pageSize, rootMessageId]
  );

  const loadMore = useCallback(async () => {
    if (!open || !rootMessageId || !hasMore || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await messagesService.getMessageThread(rootMessageId, pageSize, replies.length);
      const mergedReplies = [...replies, ...response.replies];
      const entry: ThreadCacheEntry = {
        rootMessage: response.root_message,
        replies: mergedReplies,
        replyCount: response.reply_count,
        muted: response.muted ?? false,
      };
      setThreadCacheEntry(rootMessageId, entry);
      applyCache(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setLoadingMore(false);
    }
  }, [applyCache, hasMore, loadingMore, open, pageSize, replies, rootMessageId]);

  useEffect(() => {
    if (!open || !rootMessageId) return;
    void loadInitial();
  }, [open, rootMessageId, loadInitial]);

  useEffect(() => {
    if (!open || !rootMessageId) return;
    const handleThreadReplyAdded = (event: Event) => {
      const payload = (event as CustomEvent<WsThreadUpdateEvent>).detail;
      if (!payload || payload.thread_root !== rootMessageId) return;

      const cached = getThreadCacheEntry(rootMessageId);
      if (cached) {
        if (!cached.replies.some((msg) => msg.id === payload.message.id)) {
          cached.replies = [...cached.replies, payload.message];
        }
        cached.replyCount = payload.reply_count;
        setThreadCacheEntry(rootMessageId, cached);
        applyCache(cached);
        return;
      }

      setReplies((prev) => {
        if (prev.some((msg) => msg.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
      setReplyCount(payload.reply_count);
    };

    window.addEventListener('thread-reply-added', handleThreadReplyAdded);
    return () => window.removeEventListener('thread-reply-added', handleThreadReplyAdded);
  }, [applyCache, open, rootMessageId]);

  return {
    rootMessage,
    replies,
    replyCount,
    muted,
    setMuted,
    loading,
    loadingMore,
    hasMore,
    error,
    loadInitial,
    loadMore,
  };
}
