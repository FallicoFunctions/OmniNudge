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

function createParser(text) {
  let index = 0;
  let line = 1;
  let column = 1;

  function currentChar() {
    return text[index];
  }

  function advance() {
    const char = text[index];
    index += 1;
    if (char === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    return char;
  }

  function skipWhitespace() {
    while (index < text.length) {
      const char = currentChar();
      if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
        advance();
      } else {
        break;
      }
    }
  }

  function parseString() {
    if (currentChar() !== '"') {
      throw new Error(`Expected string at ${line}:${column}`);
    }
    advance(); // opening quote

    let raw = '';
    while (index < text.length) {
      const char = advance();
      if (char === '"') {
        try {
          return JSON.parse(`"${raw}"`);
        } catch (error) {
          throw new Error(
            `Invalid string escape at ${line}:${column}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      if (char === '\\') {
        const escaped = advance();
        if (escaped === undefined) {
          throw new Error(`Unterminated escape sequence at ${line}:${column}`);
        }
        raw += `\\${escaped}`;
        if (escaped === 'u') {
          for (let i = 0; i < 4; i += 1) {
            const hex = advance();
            if (!/[0-9a-fA-F]/.test(hex ?? '')) {
              throw new Error(`Invalid unicode escape at ${line}:${column}`);
            }
            raw += hex;
          }
        }
        continue;
      }
      raw += char;
    }

    throw new Error(`Unterminated string at ${line}:${column}`);
  }

  function parseLiteral(literal) {
    for (const char of literal) {
      if (currentChar() !== char) {
        throw new Error(`Expected "${literal}" at ${line}:${column}`);
      }
      advance();
    }
  }

  function parseNumber() {
    if (currentChar() === '-') advance();

    if (currentChar() === '0') {
      advance();
    } else {
      while (/[0-9]/.test(currentChar() ?? '')) {
        advance();
      }
    }

    if (currentChar() === '.') {
      advance();
      while (/[0-9]/.test(currentChar() ?? '')) {
        advance();
      }
    }

    const exponent = currentChar();
    if (exponent === 'e' || exponent === 'E') {
      advance();
      const sign = currentChar();
      if (sign === '+' || sign === '-') advance();
      while (/[0-9]/.test(currentChar() ?? '')) {
        advance();
      }
    }
  }

  function parseArray(path, duplicates) {
    if (currentChar() !== '[') {
      throw new Error(`Expected "[" at ${line}:${column}`);
    }
    advance();
    skipWhitespace();

    if (currentChar() === ']') {
      advance();
      return;
    }

    let itemIndex = 0;
    while (index < text.length) {
      parseValue(`${path}[${itemIndex}]`, duplicates);
      itemIndex += 1;
      skipWhitespace();
      if (currentChar() === ',') {
        advance();
        skipWhitespace();
        continue;
      }
      if (currentChar() === ']') {
        advance();
        return;
      }
      throw new Error(`Expected "," or "]" at ${line}:${column}`);
    }

    throw new Error(`Unterminated array at ${line}:${column}`);
  }

  function parseObject(path, duplicates) {
    if (currentChar() !== '{') {
      throw new Error(`Expected "{" at ${line}:${column}`);
    }
    advance();
    skipWhitespace();

    const keySet = new Set();
    if (currentChar() === '}') {
      advance();
      return;
    }

    while (index < text.length) {
      skipWhitespace();
      const keyLine = line;
      const keyColumn = column;
      const key = parseString();
      if (keySet.has(key)) {
        duplicates.push({
          path: path || '<root>',
          key,
          line: keyLine,
          column: keyColumn,
        });
      } else {
        keySet.add(key);
      }

      skipWhitespace();
      if (currentChar() !== ':') {
        throw new Error(`Expected ":" at ${line}:${column}`);
      }
      advance();
      skipWhitespace();
      const nextPath = path ? `${path}.${key}` : key;
      parseValue(nextPath, duplicates);

      skipWhitespace();
      if (currentChar() === ',') {
        advance();
        skipWhitespace();
        continue;
      }
      if (currentChar() === '}') {
        advance();
        return;
      }
      throw new Error(`Expected "," or "}" at ${line}:${column}`);
    }

    throw new Error(`Unterminated object at ${line}:${column}`);
  }

  function parseValue(path, duplicates) {
    skipWhitespace();
    const char = currentChar();

    if (char === '"') {
      parseString();
      return;
    }
    if (char === '{') {
      parseObject(path, duplicates);
      return;
    }
    if (char === '[') {
      parseArray(path, duplicates);
      return;
    }
    if (char === '-' || /[0-9]/.test(char ?? '')) {
      parseNumber();
      return;
    }
    if (char === 't') {
      parseLiteral('true');
      return;
    }
    if (char === 'f') {
      parseLiteral('false');
      return;
    }
    if (char === 'n') {
      parseLiteral('null');
      return;
    }

    throw new Error(`Unexpected token "${char ?? '<eof>'}" at ${line}:${column}`);
  }

  return {
    parseRoot() {
      const duplicates = [];
      skipWhitespace();
      if (currentChar() !== '{') {
        throw new Error(`Locale root must be an object at ${line}:${column}`);
      }
      parseValue('', duplicates);
      skipWhitespace();
      if (index !== text.length) {
        throw new Error(`Unexpected trailing token at ${line}:${column}`);
      }
      return duplicates;
    },
  };
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
    const source = fs.readFileSync(fullPath, 'utf8');
    const parser = createParser(source);
    const duplicateKeys = parser.parseRoot();
    for (const duplicate of duplicateKeys) {
      errors.push(
        `[${lang}] duplicate key "${duplicate.key}" at ${duplicate.path} (${duplicate.line}:${duplicate.column})`
      );
    }

    const parsed = JSON.parse(source);
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
