import { useTranslation } from 'react-i18next';
import { getBaseLanguage, resolveSupportedLanguage } from '../i18n/languageUtils';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * '2026-02-01' is a calendar date, not an instant. new Date() reads it as UTC
 * midnight, so anywhere west of UTC it formats as the day before -- which is
 * how the CCPA page came to print "Last Updated: January 2026" from the
 * constant 2026-02-01, and how the Terms page dated itself January 9 from
 * 2026-01-10. Build those in local time so the day that is written is the day
 * that is shown. Strings carrying a time are instants and are left alone.
 */
function toDate(value: Date | number | string): Date {
  if (typeof value !== 'string') {
    return new Date(value);
  }
  const parts = DATE_ONLY.exec(value);
  return parts
    ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
    : new Date(value);
}

/**
 * Hook for localized formatting of dates and numbers
 */
export function useFormat() {
  const { i18n } = useTranslation();
  const rawLanguage = i18n.language || i18n.resolvedLanguage || 'en';
  const resolvedLanguage = i18n.resolvedLanguage || rawLanguage;
  const locale =
    getBaseLanguage(rawLanguage) === resolveSupportedLanguage(resolvedLanguage)
      ? rawLanguage
      : resolveSupportedLanguage(resolvedLanguage);

  /**
   * Format a date based on the current locale
   */
  const formatDate = (date: Date | number | string, options?: Intl.DateTimeFormatOptions) => {
    return new Intl.DateTimeFormat(locale, options).format(toDate(date));
  };

  /**
   * Format a number based on the current locale
   */
  const formatNumber = (
    num: number | null | undefined,
    options?: Intl.NumberFormatOptions
  ): string => {
    if (num == null || !isFinite(num)) return '—';
    return new Intl.NumberFormat(locale, options).format(num);
  };

  /**
   * Format a currency based on the current locale
   */
  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount);
  };

  /**
   * Format a relative time (e.g., "2 hours ago")
   * Note: This uses a simple approximation as Intl.RelativeTimeFormat
   * requires numeric values and units.
   */
  const formatRelativeTime = (date: Date | number | string) => {
    const d = new Date(date);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

    if (diffInSeconds < 60) return rtf.format(-diffInSeconds, 'second');
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return rtf.format(-diffInMinutes, 'minute');
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return rtf.format(-diffInHours, 'hour');
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return rtf.format(-diffInDays, 'day');
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return rtf.format(-diffInMonths, 'month');
    const diffInYears = Math.floor(diffInMonths / 12);
    return rtf.format(-diffInYears, 'year');
  };

  return {
    formatDate,
    formatNumber,
    formatCurrency,
    formatRelativeTime,
    locale,
  };
}
