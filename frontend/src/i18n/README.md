# Internationalization (i18n)

## Usage

### In Components

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('common.title')}</h1>
      <p>{t('messages.comment', { count: 5 })}</p>
    </div>
  );
}
```

### With Custom Hook

```tsx
import { useTranslations } from '../hooks/useTranslations';

function MyComponent() {
  const { t } = useTranslations();
  return <button>{t('common.save')}</button>;
}
```

## Adding Translations

1. Add key-value pairs to `src/i18n/locales/en.json`
2. Follow existing structure (nested objects for namespacing)
3. Use interpolation for dynamic values: `"Hello {{name}}"`
4. Use pluralization: `"comment_one": "{{count}} comment"`, `"comment_other": "{{count}} comments"`

## Adding New Languages

1. Create `src/i18n/locales/{lang}.json` (copy en.json structure)
2. Translate all strings
3. Add language to `config.ts` resources object:
   ```ts
   import fr from './locales/fr.json';
   const resources = {
     en: { translation: en },
     fr: { translation: fr },
   };
   ```
4. Add to LanguageSelector dropdown

## Translation Keys Structure

- `common.*` - Universal UI elements (buttons, labels)
- `nav.*` - Navigation items
- `messages.*` - Messaging feature
- `posts.*` - Posts and comments
- `settings.*` - Settings page
- `errors.*` - Error messages
- `validation.*` - Form validation

## Best Practices

- Never hardcode user-facing strings
- Use descriptive keys: `messages.typeMessage` not `msg1`
- Group related translations under same namespace
- Test with long translations (German) and RTL languages (Arabic)
