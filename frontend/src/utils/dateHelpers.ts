/**
 * Date and time helper utilities to eliminate redundant date conversion logic
 */

import i18n from '../i18n/config';
import { getBaseLanguage, resolveSupportedLanguage } from '../i18n/languageUtils';

function getCurrentLocale(): string {
  const rawLanguage = i18n.language || i18n.resolvedLanguage || 'en';
  const resolvedLanguage = i18n.resolvedLanguage || rawLanguage;
  return getBaseLanguage(rawLanguage) === resolveSupportedLanguage(resolvedLanguage)
    ? rawLanguage
    : resolveSupportedLanguage(resolvedLanguage);
}

/**
 * Convert local date input to ISO string
 * Used for date pickers and time range inputs
 *
 * @param value - Date string from input (e.g., "2024-01-15")
 * @returns ISO string or undefined if invalid
 */
export function convertInputToISO(value: string): string | undefined {
  if (!value) return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed.toISOString();
}

/**
 * Convert ISO string to local date input format (YYYY-MM-DD)
 * Used for populating date pickers
 *
 * @param isoString - ISO date string
 * @returns Local date string (YYYY-MM-DD) or empty string if invalid
 */
export function convertISOToInput(isoString: string): string {
  if (!isoString) return '';

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().split('T')[0];
}

/**
 * Get start of day in ISO format
 * @param date - Date object or ISO string
 */
export function getStartOfDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Get end of day in ISO format
 * @param date - Date object or ISO string
 */
export function getEndOfDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * Check if a date string is valid
 */
export function isValidDate(dateString: string): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
}

/**
 * Format date for display (localized short date)
 * @param date - Date object, ISO string, or timestamp
 */
export function formatDate(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(getCurrentLocale()).format(d);
}

/**
 * Format date and time for display
 * @param date - Date object, ISO string, or timestamp
 */
export function formatDateTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}
