# Internationalization (i18n)

## Current Locale Files

- `/public/locales/en.json` (fallback + source of key parity)
- `/public/locales/es.json`
- `/public/locales/ar.json`

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

## Translation Contribution Workflow

1. Add the new key in `/public/locales/en.json`.
2. Add the same key in `/public/locales/es.json` and `/public/locales/ar.json`.
3. Keep interpolation tokens identical across locales.
4. For plurals, use i18next suffix format:
   - `key_one`
   - `key_other`
5. Run checks:
   - `npm run i18n:check`
   - `npm run i18n:guard`
6. Run tests: `npm test`

## Adding a New Language

1. Copy `/public/locales/en.json` to `/public/locales/{lang}.json`.
2. Translate values while preserving key structure and interpolation tokens.
3. Register the language in `/src/i18n/languageUtils.ts`:
   - `SUPPORTED_LANGUAGES`
   - `LANGUAGE_OPTIONS`
4. If language is RTL, add it to the RTL set in `/src/i18n/languageUtils.ts`.
5. Verify with `npm run i18n:check`.

## Guardrails

- `npm run i18n:check`: validates locale key parity + interpolation parity.
- `npm run i18n:guard`: prevents regressions for hardcoded alert/confirm/toast patterns.
- Missing keys emit warnings in development mode from `/src/i18n/config.ts`.
