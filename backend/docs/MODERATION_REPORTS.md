# Moderation Reports Workflow

This document explains how user reports are handled and how moderators should review them.

## Report Creation

- Endpoint: `POST /api/v1/reports`
- Allowed `target_type`: `post`, `comment`, `user`, `message`, `reddit_comment`
- Allowed `reason`: `spam`, `harassment`, `illegal_content`, `csam`, `violence`, `hate_speech`, `other`
- Optional `description`: free-text context from reporter (max 1000 chars)
- User rate limit: max 10 reports per 24 hours
- Users cannot report themselves when `target_type=user`

## Auto-Suspend Rule

- If a user receives reports from 3+ distinct reporters within 24 hours, they are auto-suspended.
- Auto-suspend is implemented as a user ban (`banned=true`) with reason:
  - `Auto-suspended pending moderation review`
- This is system-triggered (`banned_by` remains `NULL`) and should be reviewed by moderators/admins.

## Moderator Queue

- Endpoint: `GET /api/v1/mod/reports`
- Query params:
  - `status` (default: `open`)
  - `sort` = `priority` (default) or `recent`
  - pagination: `limit`, `offset`, optional `cursor` for `sort=recent`

### Priority Sort Order

When `sort=priority`, reports are ordered by:

1. `csam`
2. `illegal_content`
3. `harassment`
4. `spam`
5. all others

Then by newest first.

## Report Resolution Statuses

- Endpoint: `POST /api/v1/mod/reports/:id/status`
- Recommended statuses:
  - `approved`: report validated, enforcement is correct
  - `rejected`: report invalid or abusive
  - `no_action`: report valid but no enforcement needed
- Legacy-compatible statuses still accepted:
  - `reviewed`, `dismissed`, `open`

## High-Priority Alerts

For `csam` or `illegal_content` reports:

- The system creates internal notifications for all users with role `admin` or `moderator`
- The system sends immediate WebSocket queue update events to connected moderators/admins:
  - `moderation_report_created`
  - `moderation_report_updated`
- The system attempts to send email alerts to moderator/admin emails (when email delivery is configured)
- Notification type:
  - `moderation_report_high_priority`
- Notification message:
  - `High-priority report received (<reason>)`

## Metrics and KPIs

Prometheus metrics emitted:

- `omninudge_moderation_reports_created_total{reason,target_type}`
- `omninudge_moderation_reports_resolved_total{status}`
- `omninudge_moderation_report_resolution_duration_seconds{status}`
- `omninudge_moderation_auto_suspensions_total`
- `omninudge_moderation_high_priority_alerts_total{reason,recipient_role}`

Admin stats endpoint (`GET /api/v1/admin/stats`) now includes:

- report status counts (`open_reports`, `approved_reports`, `rejected_reports`, `no_action_reports`, etc.)
- `false_report_rate_pct`
- `avg_report_resolution_hours`

## Suggested Review Procedure

1. Open Mod Tools -> Reports tab.
2. Keep `sort=priority`.
3. Review all `csam` and `illegal_content` reports first.
4. Set status to `approved`, `rejected`, or `no_action`.
5. For auto-suspended users, confirm whether suspension should remain or be reversed via admin tools.

## Realtime Event Runbook

Use this when validating that moderator queues update without page refresh.

### Event names

- `moderation_report_created`: emitted after `POST /api/v1/reports`
- `moderation_report_updated`: emitted after `POST /api/v1/mod/reports/:id/status`

### Expected payload shape

Both events include:

- `event` (string): event type
- `report_id` (int)
- `status` (string)
- `reason` (string)
- `target_type` (string)
- `target_id` (int)
- `created_at` (timestamp)
- `resolved_at` (timestamp, only when resolved)

### Client behavior

On either event, frontend invalidates:

- `['modReports']`
- `['adminStats']`

This forces immediate queue/stat refresh for connected moderators/admins.

### Quick verification checklist

1. Connect a moderator/admin session (WebSocket connected).
2. Submit a report from another user.
3. Confirm `moderation_report_created` appears in WebSocket logs.
4. Resolve the report from moderator tools.
5. Confirm `moderation_report_updated` appears in WebSocket logs.
6. Verify queue row/status changes without manual refresh.

### Common failure points

- Moderator is not connected via WebSocket (stale/offline tab).
- Reporter/moderator role permissions are incorrect.
- Report was created, but broadcaster wiring is missing in runtime setup.
- Client is connected but not processing event type in WebSocket handler.
