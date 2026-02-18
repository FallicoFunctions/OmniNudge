# User Settings System

**Status:** Active
**Last Updated:** February 18, 2026

## Overview

User settings are server-backed (`user_settings` table) and exposed via:
- `GET /api/v1/settings`
- `PUT /api/v1/settings`

The frontend keeps a local cache in `localStorage` (`omninudge-settings`) for fast hydration, then reconciles with server values after authentication.

## Architecture

Core files:
- Backend model: `backend/internal/models/user_settings.go`
- Backend handler: `backend/internal/handlers/settings.go`
- Frontend context: `frontend/src/contexts/SettingsContext.tsx`
- Frontend page: `frontend/src/pages/SettingsPage.tsx`
- Frontend API client: `frontend/src/services/userSettingsService.ts`

## Settings Categories

### Notifications
- `notification_sound` (`boolean`)
- `show_push_notifications` (`boolean`)
- `notify_archived_messages` (`boolean`)
- `notify_removed_saved_posts` (`boolean`)
- `quiet_hours_enabled` (`boolean`)
- `quiet_hours_start_minutes` (`0..1439`)
- `quiet_hours_end_minutes` (`0..1439`)
- `quiet_hours_timezone` (IANA TZ, e.g. `America/New_York`)
- `notify_comment_replies` (`boolean`)
- `notify_post_milestone` (`boolean`)
- `notify_post_velocity` (`boolean`)
- `notify_comment_milestone` (`boolean`)
- `notify_comment_velocity` (`boolean`)
- `daily_digest` (`boolean`)

Validation notes:
- If quiet hours are enabled, start and end must differ.
- Timezone must be valid per `time.LoadLocation`.

Per-conversation mute is stored separately in `conversation_notification_settings` and managed via:
- `PUT /api/v1/conversations/:id/mute`
- `PUT /api/v1/conversations/:id/unmute`

### Privacy
- `show_read_receipts` (`boolean`)
- `show_typing_indicators` (`boolean`)
- `show_last_seen` (`boolean`)
- `profile_visibility` (`public | friends_only | private`)

### Appearance
- `theme` (`light | dark | system`)
- API also accepts `auto` and normalizes it to `system`.
- `font_size` (`small | medium | large`)
- `use_relative_time` (`boolean`)
- `auto_close_theme_selector` (`boolean`)

### Audio / Video
- `mic_device_id` (string, max 255 chars)
- `camera_device_id` (string, max 255 chars)
- `speaker_device_id` (string, max 255 chars)

### Feed / Content Preferences
- `default_omni_posts_only` (`boolean`)
- `stay_on_post_after_hide` (`boolean`)
- `use_infinite_scroll_home` (`boolean`)
- `use_infinite_scroll_hubs` (`boolean`)
- `use_infinite_scroll_subs` (`boolean`)
- `use_infinite_scroll` (`boolean`)
- `search_include_nsfw_by_default` (`boolean`)
- `block_all_nsfw` (`boolean`)
- `block_nsfw_thumbnails` (`boolean`)
- `access_request_cooldown_display` (`days | date | both`)

### Messaging / Voice Foundation
- `transcription_opt_in` (`boolean`)

## Request / Response Shape

`GET /api/v1/settings` returns the full `UserSettings` object.

`PUT /api/v1/settings` accepts a partial payload; only provided fields are updated.

Example:

```json
{
  "show_read_receipts": false,
  "show_typing_indicators": true,
  "profile_visibility": "friends_only",
  "quiet_hours_enabled": true,
  "quiet_hours_start_minutes": 1320,
  "quiet_hours_end_minutes": 420,
  "quiet_hours_timezone": "America/New_York",
  "font_size": "large",
  "transcription_opt_in": true,
  "mic_device_id": "default-mic"
}
```

## Settings Page Tabs

Implemented tabs in `SettingsPage`:
- General
- Notifications
- Privacy
- Appearance
- Audio/Video

Updates apply immediately through `SettingsContext` setters and are persisted to the server.

## Testing Coverage

Backend:
- `backend/internal/handlers/settings_test.go`

Covers:
- enum validation (`font_size`, `profile_visibility`)
- timezone validation
- device ID length validation
- quiet-hours validity constraints
- persistence checks
