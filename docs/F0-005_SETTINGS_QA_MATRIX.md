# F0-005 Settings QA Matrix

Last updated: 2026-02-18

## Scope
- Settings tabs: General, Notifications, Privacy, Appearance, Audio/Video
- Server sync: `GET /api/v1/settings`, `PUT /api/v1/settings`
- Immediate apply behavior (optimistic UI update target: `<100ms`)

## Automated Evidence
- Frontend tests:
  - `tests/unit/settingsContext.test.tsx`
  - `src/pages/__tests__/SettingsPage.test.tsx`
  - `tests/unit/userSettingsService.test.ts`
- Backend tests:
  - `backend/internal/handlers/settings_test.go`
  - `backend/internal/integration/settings_integration_test.go`
  - `backend/internal/services/notification_service_test.go`

Current automated result snapshot:
- Frontend settings suite: pass (11/11)
- Frontend production build: pass
- Backend settings/quiet-hours suites: previously passing in recent F0-005 passes

## Manual QA Matrix
Legend: `PASS`, `FAIL`, `PENDING`

| Area | Desktop Web | iPhone Safari |
|---|---|---|
| Open `/settings` and switch all tabs | PENDING | PENDING |
| Toggle `read_receipts`, refresh, verify persisted | PENDING | PENDING |
| Toggle `typing_indicators`, refresh, verify persisted | PENDING | PENDING |
| Toggle `show_last_seen`, refresh, verify persisted | PENDING | PENDING |
| Change `profile_visibility` and verify persisted | PENDING | PENDING |
| Toggle push notifications setting and verify persisted | PENDING | PENDING |
| Configure quiet hours (valid range) and verify persisted | PENDING | PENDING |
| Quiet hours invalid config blocked (same start/end when enabled) | PENDING | PENDING |
| Toggle notification preference switches (replies/milestones/velocity/digest) and verify persisted | PENDING | PENDING |
| Change theme + font size and verify immediate apply + persistence | PENDING | PENDING |
| Change mic/camera/speaker device prefs and verify persisted | PENDING | PENDING |
| Toggle transcription opt-in and verify persisted | PENDING | PENDING |

## Sign-off
- Desktop manual pass: PENDING
- iPhone manual pass: PENDING
- F0-005 manual QA sign-off owner: PENDING
