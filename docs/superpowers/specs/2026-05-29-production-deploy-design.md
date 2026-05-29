# Production Deploy and Rollback Redesign

## Summary

OmniNudge does not have a staging environment. Production deployment therefore needs to be safe enough to act as its own gate: fail closed before touching the server, back itself up before making changes, surface raw failures clearly, and give the operator an immediate rollback choice if post-deploy verification fails.

The current deployment surface is close, but it has drifted. Some docs no longer match the code, rollback behavior is brittle, and deploy and rollback logic are duplicated across scripts. That creates operational risk for a user who is not deeply familiar with the stack.

This redesign consolidates deployment and rollback around one shared shell library, one beginner-safe deploy command, and one reliable manual rollback command.

## Goals

- Make `bash scripts/deploy-on.sh` the only normal production deployment command.
- Make deploy fail closed before touching production when preflight checks fail.
- Keep the script understandable for a non-expert operator.
- Print plain-English failures and raw technical evidence together so failures can be pasted into Codex or Claude Code.
- Apply database migrations explicitly during deploy rather than relying on implicit startup behavior.
- Keep a manual rollback command current and trustworthy.
- Remove deploy/rollback tech debt by centralizing shared shell logic.

## Non-Goals

- Adding staging, preview environments, or canary infrastructure.
- Building a GUI deployment tool.
- Solving external service reliability, including Reddit availability.
- Designing a generalized release platform for multiple hosts.

## User-Facing Commands

### Normal deploy

The standard production deploy command remains:

```bash
bash scripts/deploy-on.sh
```

This command is run from the local Mac terminal and is the only day-to-day production deployment command the operator should need.

### Manual rollback

The standard manual rollback command remains:

```bash
bash scripts/rollback.sh
```

Optional backup-specific rollback remains available:

```bash
bash scripts/rollback.sh <backup-name>
```

The operator should never need to invoke internal helper scripts directly.

## Script Architecture

### `scripts/deploy-lib.sh`

This file will contain shared deployment functions and must not be run directly. Its purpose is to keep deploy and rollback behavior consistent and eliminate duplicate shell logic.

Expected responsibilities:

- colored logging helpers
- structured step runner
- failure reporting helpers
- prompt helpers
- local preflight checks
- remote preflight checks
- backup creation helpers
- upload helpers
- backend build/restart helpers
- migration helpers
- health verification helpers
- rollback helpers

### `scripts/deploy-on.sh`

This remains the single production deploy entrypoint. It should be short and orchestration-focused, delegating operational details to `deploy-lib.sh`.

### `scripts/rollback.sh`

This remains the manual rollback entrypoint. It should use the same shared backup, restore, restart, and verification helpers from `deploy-lib.sh` so the rollback path cannot drift from the deploy path.

### `scripts/safe-deploy.sh`

This should remain retired. It should not contain an alternate deployment implementation. It may remain as a compatibility stub that clearly tells the operator to use `bash scripts/deploy-on.sh`.

## Deploy UX

The deploy script should behave like an interactive guided command without requiring deployment knowledge.

### Preflight behavior

The script runs preflight first. If any preflight check fails:

- no files are uploaded
- no services are restarted
- no migrations are applied
- no production state is changed

The script prints:

- a plain-English description of what failed
- the exact command that failed
- the exit code when available
- the captured stdout/stderr block
- a suggested follow-up command when applicable

If preflight passes, deploy begins automatically without a second confirmation prompt.

### Post-deploy failure behavior

If deployment reaches the verification stage and one or more health checks fail, the script must stop and print:

- which verification step failed
- the raw command output for that check
- the backup name created earlier in the deploy
- the exact manual rollback command

It then prompts:

```text
Deployment verification failed. Roll back now? (yes/no):
```

If the operator answers `yes`, the script performs rollback immediately.

If the operator answers `no`, the script exits without further changes.

### Success behavior

If deployment succeeds, the script prints:

- deployment succeeded
- backup name
- current deployed version or commit hash
- exact manual rollback command
- exact log command to inspect the backend

## Failure Reporting Format

Each failing step should output two layers:

### 1. Operator summary

A short human-readable summary, for example:

```text
Preflight failed: could not build the frontend locally.
```

### 2. Raw diagnostic block

Immediately after the summary, print a raw evidence block, for example:

```text
Failed command:
npm run build

Exit code:
1

Raw output:
<captured stdout/stderr here>
```

When a remote service is involved, the script should also print a suggested follow-up command, for example:

```bash
ssh root@77.42.47.79 'journalctl -u omninudge-backend -n 100 --no-pager'
```

This keeps the scripts beginner-friendly while preserving the exact technical evidence needed for an AI debugging workflow.

## Preflight Scope

Preflight should block deploy when any of the following fail.

### Local checks

- repository is on `main`
- working tree is clean
- required local tools exist:
  - `ssh`
  - `rsync`
  - `git`
  - `npm`
  - `go`
  - `curl`
- frontend build succeeds locally
- backend build succeeds locally

### Remote checks

- production host is reachable over SSH
- required services are currently active:
  - `omninudge-backend`
  - `nginx`
  - `postgresql@16-main`
- required deployment paths exist:
  - `/var/www/omninudge/backend`
  - `/var/www/omninudge/frontend/dist`
  - `/var/www/omninudge/backend/.env`
- `APP_ENV=production` in the backend `.env`
- `/var/www/omninudge/backups` exists or can be created
- production database backup prerequisites are readable from `.env`

### Explicit exclusions

Preflight should not fail the deploy for:

- Reddit upstream health
- optional degraded services unless the app is hard-dependent on them at boot
- public frontend asset contract before deploy begins

Those would create false negatives or conflate external incidents with deploy readiness.

## Deployment Flow

After preflight passes, deploy should proceed in this order:

1. create file and database backup on the server
2. upload frontend build artifacts
3. upload backend code
4. build backend binary on the server
5. apply pending database migrations explicitly
6. restart the backend service
7. verify production health contract

Each step should be isolated, named, and logged clearly.

## Database Migration Strategy

Schema changes must be explicit. The production-safe rule is:

- code changes alone do not modify the database schema
- every schema change must ship with a numbered SQL migration in `/Users/Nick_1/Documents/Personal_Projects/OmniNudge/backend/internal/database/migrations`
- the deploy script must run pending migrations as its own explicit step

### Best practice for this repo

The deploy path should not rely on implicit migration behavior during ordinary server startup. Instead, deployment should deliberately invoke the application’s embedded migration logic during the deploy sequence.

The intended effect is:

- migrations run once, intentionally
- failure happens before the service restart is declared successful
- migration logs are visible in the deploy output

### Rollback and schema

Database rollback should not depend primarily on down-migrations.

The primary rollback method should be:

- restore files from the deploy backup
- restore the matching database backup
- rebuild or restart as needed
- re-run health verification

Down-migrations may still exist in the codebase, but the operator-facing rollback path should prefer backup restore because it is simpler and safer for a non-expert.

## Production Health Contract

Deployment verification should use one canonical health contract shared by both deploy and rollback:

- server-local backend check: `http://127.0.0.1:8080/health`
- public site check: `https://omninudge.com`
- public API smoke check: `https://api.omninudge.com/api/v1/ping`
- public boot asset contract:
  - fetched public `index.html` references the same boot-critical asset set as the local build
  - every referenced boot asset returns HTTP `200`

This contract should live in one place and be consumed by both deploy and rollback logic.

## Rollback Design

### Manual rollback

The manual rollback script should be brought fully in line with the deploy flow.

Expected behavior:

- identify the backup to restore
- restore backend/frontend files from that backup
- restore the matching database backup
- restart backend
- verify the same canonical health contract used by deploy

### Interactive rollback from failed deploy

The deploy script should call the same rollback helper used by `scripts/rollback.sh` after the operator confirms `yes`.

That keeps the automated prompt path and the manual path functionally identical.

## Documentation Strategy

The deployment runbook must be updated to match the new script behavior exactly.

Required outcomes:

- `RUNBOOK.md` becomes accurate and reflects the current production flow
- stale claims are removed, including outdated Reddit prewarm notes if they no longer describe current behavior
- any archived deploy docs should point back to the runbook rather than maintaining conflicting instructions

The documentation must describe:

- what command to run
- what preflight checks mean
- what happens on success
- what happens on failure
- how to perform manual rollback
- what logs to inspect

## Acceptance Criteria

This redesign is complete when all of the following are true:

- `bash scripts/deploy-on.sh` is the single normal production deploy command
- deploy aborts before touching production when preflight fails
- deploy applies pending migrations explicitly
- deploy prints both beginner-friendly summaries and raw technical failures
- post-deploy verification failure prompts the user for rollback
- answering `yes` performs rollback in the same flow
- answering `no` exits cleanly without additional changes
- `bash scripts/rollback.sh` is current and uses the same shared operational logic
- runbook and deploy docs match the actual deploy behavior
- there is no second live deploy implementation path drifting from the primary one

## Risks and Mitigations

### Risk: rollback script remains more fragile than deploy

Mitigation:

- force rollback to reuse shared functions instead of maintaining separate restore logic

### Risk: migration step is still implicit or inconsistent

Mitigation:

- make migration execution a named deploy step with visible output and fail-fast behavior

### Risk: docs drift again

Mitigation:

- reduce the number of authoritative deploy docs
- keep one runbook and archive the rest as pointers

### Risk: health checks produce false failures

Mitigation:

- keep the health contract narrow and relevant
- avoid blocking on external best-effort systems like Reddit

## Implementation Notes

The implementation plan should focus on:

- refactoring scripts into shared helpers without changing the user-facing command surface
- adding robust output capture and error printing
- validating migration execution strategy against the current embedded migration implementation
- updating docs and verifying them against the real script behavior

No production deployment should be run until the updated scripts are implemented and reviewed.
