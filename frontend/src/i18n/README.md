# Internationalization (i18n)

## Current Locale Files

- `/public/locales/en.json`

English is the only locale. Spanish and Arabic files were removed: nobody asked
for them, and the key-parity gate they created meant every English copy fix was
a three-file edit.

## Component Usage

```tsx
import { useTranslation } from 'react-i18next';

export function Example() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('common.loading')}</h1>
      <p>{t('posts.comment', { count: 3, formattedCount: '3' })}</p>
    </div>
  );
}
```

## Formatting Usage

```tsx
import { useFormat } from '../hooks/useFormat';

export function ExampleStats({ count }: { count: number }) {
  const { formatNumber } = useFormat();
  return <span>{formatNumber(count)}</span>;
}
```

## Adding Copy

1. Add the new key in `/public/locales/en.json`.
2. Never pass the English as a second argument to `t()`. A
   `parseMissingKeyHandler` returns the key and overrides i18next's
   `defaultValue`, so `t('a.key', 'Some text')` renders `a.key` to the user.
   `TranslationKeysExist.test.ts` fails on any key that is not in en.json.
3. For plurals, use i18next suffix format:
   - `key_one`
   - `key_other`
4. Run checks:
   - `npm run i18n:check`
   - `npm run i18n:guard`
5. Run tests: `npm test`

## Adding a New Language

Only do this if somebody actually asks for the language.

1. Copy `/public/locales/en.json` to `/public/locales/{lang}.json`.
2. Translate values while preserving key structure and interpolation tokens.
3. Register the language in `/src/i18n/languageUtils.ts`:
   - `SUPPORTED_LANGUAGES`
   - `LANGUAGE_OPTIONS`
4. If language is RTL, add it to the RTL set in `/src/i18n/languageUtils.ts`.
5. Verify with `npm run i18n:check`.

## Guardrails

- `npm run i18n:check`: validates locale key parity + interpolation parity.
- `npm run i18n:check` also fails on duplicate keys inside the same JSON object (source-level detection before JSON parse overwrite behavior).
- `npm run i18n:guard`: prevents regressions for hardcoded alert/confirm/toast patterns.
- `npm run i18n:verify`: runs both checks together (`i18n:check` + `i18n:guard`).
- Pre-commit (`frontend/.husky/pre-commit`) runs `npm run i18n:verify`.
- CI workflow (`.github/workflows/i18n-verify.yml`) runs `npm run i18n:verify` for locale/i18n changes.
- Missing keys emit warnings in development mode from `/src/i18n/config.ts`.

## RTL Best Practices

- Prefer logical CSS properties over physical ones:
  - `padding-inline-start` instead of `padding-left`
  - `margin-inline-start` instead of `margin-left`
  - `border-inline-start` instead of `border-left`
  - `text-align: start` instead of `text-align: left`
- Avoid hardcoded `left`/`right` positioning when possible; use logical inset properties.
- Direction is applied globally via `syncDocumentLanguageAttributes()` in `/src/i18n/config.ts`.
- In development, use Settings -> General -> "Dev RTL Direction Override" to force `LTR`/`RTL` without changing language.
