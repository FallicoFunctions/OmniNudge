# Feedback Review Process

## Scope
- In-app feedback submissions from `POST /api/v1/bug-reports`
- Feedback types: `report`, `feedback`, `survey`, `nps`
- Categories: `bug`, `feature_request`, `other`, `survey`, `nps`

## Intake Channels
- Admin dashboard: `Admin > Bug Reports`
- Optional Slack webhook: `FEEDBACK_SLACK_WEBHOOK_URL`

## Daily Triage (Owner: Support/PM)
1. Filter new items (`status = new`) in admin dashboard.
2. Review by type and category.
3. Assign priority:
   - P0: production breakage, data loss, auth/payment failures
   - P1: high-impact feature regressions
   - P2: UX issues and low-risk requests
4. Update status:
   - `new` -> `investigating` when accepted
   - `investigating` -> `fixed` / `wont_fix` / `duplicate`

## Weekly Product Review (Owner: PM + Eng Lead)
1. Export/scan previous 7 days of feedback.
2. Group by recurring theme (feature requests, bugs, onboarding friction).
3. Rank by:
   - frequency
   - severity
   - strategic alignment
4. Create or update tickets for top themes.

## NPS and Survey Cadence
- Survey prompt cadence: approximately bi-weekly per user.
- NPS prompt cadence: quarterly per user (90-day cooldown).
- Both use the same feedback endpoint with distinct `feedback_type` and `feedback_category`.

## SLA Targets
- First triage of new feedback: within 24 hours.
- P0 acknowledgement: within 2 hours during active support window.
- Duplicate detection and merge: same-day.

## Operational Notes
- Screenshot is optional but strongly preferred for visual issues.
- Context payload includes client metadata (page title, user agent, viewport, language).
- Slack delivery is best-effort; database remains source of truth.
