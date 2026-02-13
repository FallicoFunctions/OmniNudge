#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const localesDir = path.resolve(cwd, 'public/locales');
const fallbackLanguage = 'en';

const interpolationRegex = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

function flattenObject(input, prefix = '', output = {}) {
  for (const [key, value] of Object.entries(input)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flattenObject(value, nextKey, output);
    } else {
      output[nextKey] = value;
    }
  }

  return output;
}

function extractInterpolationTokens(value) {
  if (typeof value !== 'string') {
    return [];
  }

  const tokens = [];
  let match = interpolationRegex.exec(value);
  while (match) {
    tokens.push(match[1]);
    match = interpolationRegex.exec(value);
  }

  interpolationRegex.lastIndex = 0;
  return [...new Set(tokens)].sort();
}

function readLocaleFile(filepath) {
  const file = fs.readFileSync(filepath, 'utf8');
  return JSON.parse(file);
}

if (!fs.existsSync(localesDir)) {
  console.error(`[i18n-check] Missing locales directory: ${localesDir}`);
  process.exit(1);
}

const localeFiles = fs
  .readdirSync(localesDir)
  .filter((name) => name.endsWith('.json'))
  .sort();

if (localeFiles.length === 0) {
  console.error(`[i18n-check] No locale files found in ${localesDir}`);
  process.exit(1);
}

if (!localeFiles.includes(`${fallbackLanguage}.json`)) {
  console.error(`[i18n-check] Missing fallback locale: ${fallbackLanguage}.json`);
  process.exit(1);
}

const localeKeyMap = new Map();
const flatValueMap = new Map();
const errors = [];

for (const filename of localeFiles) {
  const lang = path.basename(filename, '.json');
  const fullPath = path.join(localesDir, filename);

  try {
    const parsed = readLocaleFile(fullPath);
    const flat = flattenObject(parsed);
    localeKeyMap.set(lang, new Set(Object.keys(flat)));
    flatValueMap.set(lang, flat);
  } catch (error) {
    errors.push(`[${lang}] failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const fallbackFlat = flatValueMap.get(fallbackLanguage) ?? {};
const fallbackKeys = Object.keys(fallbackFlat);

for (const [lang, keySet] of localeKeyMap.entries()) {
  const langKeys = [...keySet];
  const missingKeys = fallbackKeys.filter((key) => !keySet.has(key));
  const extraKeys = langKeys.filter((key) => !(key in fallbackFlat));

  if (missingKeys.length > 0) {
    errors.push(`[${lang}] missing keys (${missingKeys.length}): ${missingKeys.slice(0, 10).join(', ')}`);
  }

  if (extraKeys.length > 0) {
    errors.push(`[${lang}] extra keys (${extraKeys.length}): ${extraKeys.slice(0, 10).join(', ')}`);
  }

  const flatValues = flatValueMap.get(lang) ?? {};
  for (const key of fallbackKeys) {
    if (!(key in flatValues)) {
      continue;
    }

    const fallbackValue = fallbackFlat[key];
    const localizedValue = flatValues[key];
    if (Array.isArray(localizedValue)) {
      if (!Array.isArray(fallbackValue)) {
        errors.push(`[${lang}] key "${key}" must match fallback type`);
        continue;
      }

      if (localizedValue.length !== fallbackValue.length) {
        errors.push(
          `[${lang}] key "${key}" array length mismatch: expected ${fallbackValue.length}, got ${localizedValue.length}`
        );
      }

      localizedValue.forEach((item, index) => {
        if (typeof item !== 'string' || item.trim().length === 0) {
          errors.push(`[${lang}] key "${key}[${index}]" must be a non-empty string`);
        }
      });
      continue;
    }

    if (typeof localizedValue !== 'string' || typeof fallbackValue !== 'string') {
      errors.push(`[${lang}] key "${key}" must be a string`);
      continue;
    }

    if (localizedValue.trim().length === 0) {
      errors.push(`[${lang}] key "${key}" is empty`);
    }

    const fallbackTokens = extractInterpolationTokens(fallbackValue);
    const localizedTokens = extractInterpolationTokens(localizedValue);
    if (fallbackTokens.join('|') !== localizedTokens.join('|')) {
      errors.push(
        `[${lang}] key "${key}" interpolation mismatch: expected [${fallbackTokens.join(', ')}], got [${localizedTokens.join(', ')}]`
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`[i18n-check] Found ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`[i18n-check] OK (${localeFiles.length} locale files validated)`);
