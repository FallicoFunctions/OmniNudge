const HEX_COLOR_REGEX = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const STRICT_HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const isValidHexColor = (value: string): boolean => {
  if (typeof value !== 'string') return false;
  return STRICT_HEX_COLOR_REGEX.test(value.trim());
};

export const looksLikeHexColor = (value: string): boolean => {
  if (typeof value !== 'string' || value.trim() === '') return false;
  return HEX_COLOR_REGEX.test(value.trim());
};

export const normalizeHexColor = (value: string): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed === '') return '';
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
};
