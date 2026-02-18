# Profile System

This document describes the current user profile implementation for OmniNudge.

## Data Model

Profile fields are stored in a dedicated `user_profiles` table:
- `user_id` (PK, FK to `users.id`)
- `avatar_url`
- `bio`
- `status_text`
- `created_at`
- `updated_at`

Migration `066_user_profiles_table` backfills existing `users.avatar_url` and `users.bio` into `user_profiles`.
For compatibility, profile updates currently mirror to both locations while reads prefer `user_profiles` when available.

## API Endpoints

### Public profile reads
- `GET /api/v1/users/:username`
- `GET /api/v1/users/id/:id/profile`

Both endpoints return the same `UserProfileResponse` shape:
- `id`
- `username`
- `avatar_url`
- `bio`
- `karma`
- `public_key`
- `created_at`
- `last_seen` (conditionally included)
- `moderated_hubs` (when applicable)

### Authenticated self profile
- `GET /api/v1/users/me/profile`

### Profile updates
- `PUT /api/v1/users/me/profile`
- `PUT /api/v1/users/profile` (legacy alias, still supported)

Accepted payload:
- `bio` (`null` to clear, max 500 chars)
- `avatar_url` (`null` to clear, must be `http://` or `https://` when set)
- `status_text` (`null` to clear, max 500 chars)

## Privacy Controls

Profile visibility and last-seen behavior are backed by `user_settings`:
- `profile_visibility`: `public | friends_only | private`
- `show_last_seen`: `true | false`

Current enforcement:
- `public`: profile visible to everyone
- `private`: profile hidden from non-owner
- `friends_only`: profile visible only to accepted friends

`last_seen` exposure:
- shown when `show_last_seen=true`
- always shown to the profile owner
- hidden for others when `show_last_seen=false`

When settings lookup fails, visibility fails closed.

## Frontend Behavior

### Profile page
- Route: `/users/:username`
- Own profile shows an **Edit Profile** action.
- Edit flow uses `usersService.updateProfile()` and refreshes profile data on success.

### Messaging action menu
- Message options include **View Profile** for non-own messages.
- Navigates to `/users/:username`.

## Caching

- Profile responses are cached for 5 minutes (`TTLUserProfile`).
- Cache scope is privacy-safe:
  - owner-scoped response cache for self views
  - public-scoped response cache for non-owner views
- Visibility and `show_last_seen` are evaluated before serving cached data, so a private profile is never returned from cache to non-owners.
- Profile cache is invalidated on:
  - `PUT /api/v1/users/me/profile`
  - `PUT /api/v1/users/profile` (legacy alias)
  - `POST /api/v1/users/me/ping` (refreshes last-seen views)

## Test Coverage

Backend:
- Settings validation/persistence for `profile_visibility`.
- Visibility enforcement for `public/private/friends_only`.
- Authenticated `/users/me/profile` profile read.

Frontend:
- `EditProfileModal` validation and submit behavior.

## Notes / Remaining Work

- Avatar upload pipeline (storage + thumbnails) is separate and currently out of scope here.
- During transition, profile writes are mirrored to legacy `users.avatar_url` / `users.bio` for compatibility.
