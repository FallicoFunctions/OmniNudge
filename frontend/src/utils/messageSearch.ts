import type { Message } from '../types/messages';

export interface MessageSearchFilters {
  conversationId?: number;
  senderId?: number;
  startDate?: Date;
  endDate?: Date;
  hasFiles?: boolean;
  hasLinks?: boolean;
}

export interface MessageSearchResult {
  message: Message;
  score: number;
  snippet: string;
}

export interface MessageSearchOptions {
  limit?: number;
  offset?: number;
  now?: Date;
}

const LINK_REGEX = /https?:\/\/\S+/i;
const SNIPPET_WINDOW = 48;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function hasLink(text: string): boolean {
  return LINK_REGEX.test(text);
}

function countOccurrences(text: string, term: string): number {
  if (!term) return 0;
  const pattern = new RegExp(escapeRegExp(term), 'gi');
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function createSnippet(text: string, terms: string[]): string {
  const normalized = text.trim();
  if (!normalized) return '';
  if (terms.length === 0) return normalized.slice(0, 120);

  const lower = normalized.toLowerCase();
  let firstMatch = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0 && (firstMatch === -1 || idx < firstMatch)) {
      firstMatch = idx;
    }
  }

  if (firstMatch < 0) {
    return normalized.slice(0, 120);
  }

  const start = Math.max(0, firstMatch - SNIPPET_WINDOW);
  const end = Math.min(normalized.length, firstMatch + SNIPPET_WINDOW + 32);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalized.length ? '…' : '';
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

function computeRecencyBoost(sentAt: string, now: Date): number {
  const sent = new Date(sentAt).getTime();
  if (!Number.isFinite(sent)) return 0;
  const ageHours = Math.max(0, (now.getTime() - sent) / (1000 * 60 * 60));
  if (ageHours <= 24) return 2.5;
  if (ageHours <= 24*7) return 1.5;
  if (ageHours <= 24*30) return 0.75;
  return 0;
}

function passesMetadataFilters(message: Message, filters: MessageSearchFilters): boolean {
  if (filters.conversationId && message.conversation_id !== filters.conversationId) return false;
  if (filters.senderId && message.sender_id !== filters.senderId) return false;
  if (filters.startDate && new Date(message.sent_at) < filters.startDate) return false;
  if (filters.endDate && new Date(message.sent_at) > filters.endDate) return false;
  if (filters.hasFiles && !message.media_url) return false;
  return true;
}

export function searchMessages(
  messages: Message[],
  decryptedContentMap: Map<number, string>,
  query: string,
  filters: MessageSearchFilters,
  options: MessageSearchOptions = {}
): { total: number; results: MessageSearchResult[] } {
  const terms = tokenizeQuery(query);
  const now = options.now ?? new Date();
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, options.limit ?? 50);

  const scored: MessageSearchResult[] = [];
  for (const message of messages) {
    if (!passesMetadataFilters(message, filters)) continue;

    const text = decryptedContentMap.get(message.id) ?? '';
    if (filters.hasLinks && !hasLink(text)) continue;

    if (terms.length > 0) {
      const lower = text.toLowerCase();
      let allTermsPresent = true;
      let relevance = 0;
      for (const term of terms) {
        const count = countOccurrences(lower, term);
        if (count === 0) {
          allTermsPresent = false;
          break;
        }
        relevance += count * 3;
      }
      if (!allTermsPresent) continue;

      scored.push({
        message,
        score: relevance + computeRecencyBoost(message.sent_at, now),
        snippet: createSnippet(text, terms),
      });
      continue;
    }

    scored.push({
      message,
      score: computeRecencyBoost(message.sent_at, now),
      snippet: createSnippet(text, terms),
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.message.sent_at).getTime() - new Date(a.message.sent_at).getTime();
  });

  const total = scored.length;
  const results = scored.slice(offset, offset + limit);
  return { total, results };
}
