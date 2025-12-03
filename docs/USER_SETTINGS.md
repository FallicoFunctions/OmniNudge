# User Settings System - Complete Documentation

**Status:** ✅ Complete and Production-Ready
**Last Updated:** December 3, 2025

---

## Overview

OmniNudge provides a user settings system for customizing the application experience. Settings are persisted to localStorage and apply globally across all pages. The system is designed to be extensible for future preferences.

---

## Table of Contents

1. [Current Settings](#current-settings)
2. [Settings Architecture](#settings-architecture)
3. [Time Format Setting](#time-format-setting)
4. [Implementation Details](#implementation-details)
5. [Future Settings](#future-settings)

---

## Current Settings

### Date & Time Display Preference

**Setting:** Toggle between relative and absolute time display

**Options:**
- **Relative Time** (default): "4 hours ago", "3 days ago", "2 months ago"
- **Absolute Date**: "12/3/2025", "11/30/2025"

**Applies To:**
- Reddit post timestamps
- Platform post timestamps
- Comment timestamps
- All date/time displays throughout the app

**Storage:** localStorage key `'omninudge-settings'`

---

## Settings Architecture

### File Locations

#### Frontend Components
- **Settings Page:** `frontend/src/pages/SettingsPage.tsx`
- **Settings Context:** `frontend/src/contexts/SettingsContext.tsx`
- **Time Utility:** `frontend/src/utils/timeFormat.ts`

#### Routes
- **URL:** `/settings`
- **Navigation:** Available in main navigation bar between username and "Logout"

### Context Provider

#### SettingsContext.tsx
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SettingsContextType {
  useRelativeTime: boolean;
  setUseRelativeTime: (value: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [useRelativeTime, setUseRelativeTime] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('omninudge-settings');
      if (stored) {
        const settings = JSON.parse(stored);
        return settings.useRelativeTime ?? true;
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return true; // Default to relative time
  });

  useEffect(() => {
    try {
      const settings = { useRelativeTime };
      localStorage.setItem('omninudge-settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [useRelativeTime]);

  return (
    <SettingsContext.Provider value={{ useRelativeTime, setUseRelativeTime }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
```

### App Integration

#### App.tsx
```typescript
import { SettingsProvider } from './contexts/SettingsContext';

function App() {
  return (
    <SettingsProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            {/* App routes */}
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SettingsProvider>
  );
}
```

---

## Time Format Setting

### Overview
Controls how timestamps are displayed throughout the application. Users can choose between human-readable relative time or precise absolute dates.

### Utility Functions

#### formatRelativeTime()
**File:** `frontend/src/utils/timeFormat.ts`

```typescript
export function formatRelativeTime(timestamp: number | Date): string {
  const now = Date.now();
  const then = typeof timestamp === 'number'
    ? timestamp < 10000000000 ? timestamp * 1000 : timestamp
    : timestamp.getTime();

  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  } else if (diffDay < 30) {
    return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  } else if (diffMonth < 12) {
    return `${diffMonth} month${diffMonth !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffYear} year${diffYear !== 1 ? 's' : ''} ago`;
  }
}
```

**Time Ranges:**
- < 60 seconds: "just now"
- < 60 minutes: "X minutes ago"
- < 24 hours: "X hours ago"
- < 30 days: "X days ago"
- < 12 months: "X months ago"
- ≥ 12 months: "X years ago"

#### formatAbsoluteDate()
```typescript
export function formatAbsoluteDate(timestamp: number | Date): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp)
    : timestamp;

  return date.toLocaleDateString();
}
```

**Format:** Uses browser's locale settings
- US: "12/3/2025"
- EU: "03/12/2025"
- Depends on user's system settings

#### formatTimestamp()
```typescript
export function formatTimestamp(
  timestamp: number | Date,
  useRelativeTime: boolean
): string {
  return useRelativeTime
    ? formatRelativeTime(timestamp)
    : formatAbsoluteDate(timestamp);
}
```

**Main Entry Point:**
- Switches based on user preference
- Used throughout the application

### Usage Example

#### In Components
```typescript
import { formatTimestamp } from '../utils/timeFormat';
import { useSettings } from '../contexts/SettingsContext';

function PostCard({ post }) {
  const { useRelativeTime } = useSettings();

  return (
    <div>
      <span>Posted {formatTimestamp(post.created_at, useRelativeTime)}</span>
    </div>
  );
}
```

#### Pages Using Time Format
- `RedditPage.tsx` - Post timestamps
- `RedditPostPage.tsx` - Post and comment timestamps
- `RedditUserPage.tsx` - Post timestamps
- `SavedPage.tsx` - Saved item timestamps
- `HiddenPage.tsx` - Hidden item timestamps
- `PostDetailPage.tsx` - Platform post timestamps
- `MessagesPage.tsx` - Message timestamps

---

## Implementation Details

### Settings Page UI

#### Layout
```
┌──────────────────────────────────────────┐
│  Settings                                 │
├──────────────────────────────────────────┤
│  Date & Time                              │
│                                           │
│  ○ Relative (4 hours ago)                │
│  ● Absolute (12/3/2025)                   │
│                                           │
│  Current setting: Absolute dates          │
│  Example: 12/3/2025, 10:30 AM            │
│                                           │
├──────────────────────────────────────────┤
│  Future Settings                          │
│  More customization options coming soon!  │
└──────────────────────────────────────────┘
```

#### Component Code
```typescript
export default function SettingsPage() {
  const { useRelativeTime, setUseRelativeTime } = useSettings();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Settings</h1>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">Date & Time</h2>

        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="radio"
              checked={useRelativeTime}
              onChange={() => setUseRelativeTime(true)}
            />
            <span>Relative (4 hours ago)</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="radio"
              checked={!useRelativeTime}
              onChange={() => setUseRelativeTime(false)}
            />
            <span>Absolute (12/3/2025)</span>
          </label>
        </div>

        <div className="mt-4 rounded bg-muted p-3">
          <p className="text-sm">
            Current setting: {useRelativeTime ? 'Relative time' : 'Absolute dates'}
          </p>
          <p className="text-sm text-muted-foreground">
            Example: {formatTimestamp(new Date(), useRelativeTime)}
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-xl font-semibold">Future Settings</h2>
        <p className="text-muted-foreground">
          More customization options coming soon!
        </p>
      </section>
    </div>
  );
}
```

### localStorage Schema

#### Storage Format
```json
{
  "useRelativeTime": true
}
```

**Key:** `'omninudge-settings'`

**Type:** JSON string

#### Default Values
```typescript
{
  useRelativeTime: true  // Default to relative time
}
```

### Error Handling

#### Load Error
```typescript
try {
  const stored = localStorage.getItem('omninudge-settings');
  if (stored) {
    const settings = JSON.parse(stored);
    return settings.useRelativeTime ?? true;
  }
} catch (error) {
  console.error('Failed to load settings:', error);
  return true; // Fallback to default
}
```

#### Save Error
```typescript
try {
  localStorage.setItem('omninudge-settings', JSON.stringify(settings));
} catch (error) {
  console.error('Failed to save settings:', error);
  // Continue without saving (non-critical failure)
}
```

**Common Causes:**
- localStorage disabled in browser
- Storage quota exceeded
- Private/incognito mode restrictions

---

## Future Settings

### Planned Settings

#### Display Preferences
- [ ] **Theme Mode:** Light, Dark, Auto
- [ ] **Compact Mode:** Reduce spacing for more content
- [ ] **Font Size:** Small, Medium, Large
- [ ] **Post Preview Size:** Thumbnail, Medium, Large
- [ ] **Comments Default View:** Expanded, Collapsed

#### Content Filters
- [ ] **NSFW Content:** Show, Hide, Blur
- [ ] **Spoiler Content:** Show, Hide, Blur
- [ ] **Autoplay Videos:** On, Off
- [ ] **Load Images:** Always, Wi-Fi Only, Never

#### Notification Settings
- [ ] **Email Notifications:** On, Off
- [ ] **Push Notifications:** On, Off
- [ ] **Reply Notifications:** On, Off
- [ ] **Mention Notifications:** On, Off

#### Privacy Settings
- [ ] **Profile Visibility:** Public, Private
- [ ] **Show Activity:** On, Off
- [ ] **Show Saved Posts:** Public, Private
- [ ] **Data Collection:** On, Off

#### Advanced Settings
- [ ] **Developer Mode:** On, Off
- [ ] **Debug Logging:** On, Off
- [ ] **Experimental Features:** On, Off
- [ ] **API Rate Limit Display:** On, Off

### Implementation Plan

#### Phase 1: Display Preferences
```typescript
interface Settings {
  useRelativeTime: boolean;
  themeMode: 'light' | 'dark' | 'auto';
  compactMode: boolean;
  fontSize: 'small' | 'medium' | 'large';
}
```

#### Phase 2: Content Filters
```typescript
interface Settings {
  // ... previous settings
  nsfwContent: 'show' | 'hide' | 'blur';
  spoilerContent: 'show' | 'hide' | 'blur';
  autoplayVideos: boolean;
  loadImages: 'always' | 'wifi' | 'never';
}
```

#### Phase 3: Notifications & Privacy
```typescript
interface Settings {
  // ... previous settings
  notifications: {
    email: boolean;
    push: boolean;
    replies: boolean;
    mentions: boolean;
  };
  privacy: {
    profileVisibility: 'public' | 'private';
    showActivity: boolean;
    showSavedPosts: 'public' | 'private';
    dataCollection: boolean;
  };
}
```

---

## Best Practices

### For Users

1. **Try Both Time Formats:**
   - Relative for recent content
   - Absolute for precise dates

2. **Settings Persist:**
   - Changes save automatically
   - Works across devices if logged in (future feature)

3. **Clear Browser Data:**
   - Clearing localStorage resets settings to defaults

### For Developers

1. **Always Use Context:**
   ```typescript
   const { useRelativeTime } = useSettings();
   const formatted = formatTimestamp(timestamp, useRelativeTime);
   ```

2. **Provide Defaults:**
   ```typescript
   return settings.useRelativeTime ?? true;
   ```

3. **Handle Errors Gracefully:**
   ```typescript
   try {
     localStorage.setItem('omninudge-settings', JSON.stringify(settings));
   } catch (error) {
     console.error('Settings save failed:', error);
     // Continue without showing error to user
   }
   ```

4. **Test Without localStorage:**
   - Ensure app works when localStorage unavailable
   - Provide in-memory fallback

5. **Document New Settings:**
   - Add to TypeScript interface
   - Update this documentation
   - Add to SettingsPage UI

---

## Technical Considerations

### Performance

#### Context Updates
- Settings changes trigger re-renders
- Use `useMemo` for expensive computations
- Consider debouncing rapid changes

#### localStorage I/O
- Read once on mount
- Write on change (debounce if needed)
- Minimal performance impact

### Browser Compatibility

#### localStorage Support
- Supported in all modern browsers
- Check availability:
  ```typescript
  const isSupported = typeof window !== 'undefined' && window.localStorage;
  ```

#### Fallback Strategy
```typescript
let settingsStorage: Settings;

if (typeof window !== 'undefined' && window.localStorage) {
  // Use localStorage
  settingsStorage = loadFromLocalStorage();
} else {
  // Use in-memory storage
  settingsStorage = defaultSettings;
}
```

### Security

#### XSS Protection
- JSON.parse() is safe for settings data
- No user-controlled code execution
- Settings don't contain sensitive data

#### Privacy
- Settings stored client-side only
- Not sent to backend
- User has full control

---

## Related Documentation

- [Reddit Integration](./REDDIT_INTEGRATION.md)
- [Frontend Setup](./FRONTEND_SETUP_COMPLETE.md)
- [Component Reference](./COMPONENT_REFERENCE.md)
