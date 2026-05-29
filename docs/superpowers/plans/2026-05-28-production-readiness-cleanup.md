# Production Readiness Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deployment trustworthy again by consolidating to one deploy script and one runbook, removing clearly stale test coverage, and fixing the remaining failing release-gate tests so pre-deploy verification is meaningful.

**Architecture:** Keep `scripts/deploy-on.sh` as the single deployment entrypoint and align every script/doc to the same health contract. Treat failing tests in three categories: duplicate stale coverage to merge/remove, brittle assertions to rewrite, and ambiguous failures to investigate and stabilize without deleting behavior coverage.

**Tech Stack:** Bash, SSH, rsync, Go, React, Vitest, React Testing Library, PostgreSQL

---

### Task 1: Canonicalize Deployment Verification

**Files:**
- Modify: `scripts/deploy-on.sh:22-145`
- Modify: `scripts/rollback.sh:1-169`
- Modify: `scripts/safe-deploy.sh:1-152`
- Reference: `backend/cmd/server/main.go:669-759`

- [ ] **Step 1: Write the failing deployment assumptions down in code comments and script output**

Add explicit health contract comments and verification output to `deploy-on.sh` and `rollback.sh` so they stop silently checking different things.

```bash
# Canonical health contract:
# - server-local backend check: http://127.0.0.1:8080/health
# - public site check: https://omninudge.com
# - public asset check: deployed JS/CSS referenced by frontend/dist/index.html
```

- [ ] **Step 2: Replace weak homepage-only verification in `deploy-on.sh`**

Update the verification block to:

```bash
echo -e "${YELLOW}Step 6: Verifying deployment...${NC}"

ssh "$SERVER" bash << 'EOF'
  set -eo pipefail
  curl -fsS http://127.0.0.1:8080/health >/tmp/omninudge-health.json
  systemctl is-active --quiet omninudge-backend
EOF

HTTP_STATUS=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "https://omninudge.com" 2>/dev/null || true)
ASSET_PATH=$(sed -n 's#.*src="/assets/\([^"]*\.js\)".*#/assets/\1#p' "$PROJECT_ROOT/frontend/dist/index.html" | head -n 1)
ASSET_STATUS=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "https://omninudge.com${ASSET_PATH}" 2>/dev/null || true)
```

Expected behavior:
- fail hard if server-local `/health` fails
- fail hard if `omninudge.com` is not `200`
- fail hard if the deployed asset URL is not `200`

- [ ] **Step 3: Replace broken API rollback check**

Change the rollback verification from:

```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://api.omninudge.com/api/v1/health || echo "000")
```

to:

```bash
HTTP_CODE=$(ssh "$SERVER" 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/health || echo "000"')
```

and keep the failure path pointed at backend logs.

- [ ] **Step 4: Retire `safe-deploy.sh` as an entrypoint**

Replace the operational body with a guard that exits immediately:

```bash
#!/bin/bash
set -euo pipefail
echo "scripts/safe-deploy.sh is retired. Use bash scripts/deploy-on.sh"
exit 1
```

This preserves backwards discoverability without keeping a second deploy path alive.

- [ ] **Step 5: Run targeted script sanity checks**

Run:

```bash
bash -n scripts/deploy-on.sh
bash -n scripts/rollback.sh
bash -n scripts/safe-deploy.sh
```

Expected:
- all commands exit `0`
- no syntax errors

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy-on.sh scripts/rollback.sh scripts/safe-deploy.sh
git commit -m "ops: consolidate deployment health checks"
```

### Task 2: Rewrite the Runbook to Match the Single Deploy Path

**Files:**
- Modify: `RUNBOOK.md:1-260`
- Modify: `docs/guides/DEPLOYMENT_GUIDE.md:1-220`
- Modify: `docs/BEGINNER_DEPLOYMENT_GUIDE.md:1-220`

- [ ] **Step 1: Rewrite the deployment section of `RUNBOOK.md`**

Replace the current deployment section with one that states:

```md
## Deployment

Canonical deploy command:

```bash
bash scripts/deploy-on.sh
```

What it verifies:
1. local frontend build succeeds
2. backup is created on server
3. backend rebuild succeeds on server
4. server-local `http://127.0.0.1:8080/health` returns 200
5. public `https://omninudge.com` returns 200
6. current built asset URL from `frontend/dist/index.html` returns 200
```
```

- [ ] **Step 2: Remove stale references to retired scripts and endpoints**

Search and replace any references to:

```text
safe-deploy.sh
deploy-app.sh
/api/v1/health
```

with either:
- `bash scripts/deploy-on.sh`
- server-local `/health`
- a short note that a file is bootstrap-only

- [ ] **Step 3: Convert legacy deployment guides into pointers, not parallel instructions**

Replace the tops of the two older docs with short notices:

```md
# Deployment Guide (Archived)

This file is no longer the source of truth for production deployment.
Use [`RUNBOOK.md`](../../RUNBOOK.md) and `bash scripts/deploy-on.sh`.
```

Do not leave step-by-step deploy commands in those files after the banner.

- [ ] **Step 4: Verify no stale deploy references remain**

Run:

```bash
rg -n "safe-deploy\\.sh|deploy-app\\.sh|/api/v1/health" RUNBOOK.md docs scripts
```

Expected:
- only acceptable matches are the retirement notice in `scripts/safe-deploy.sh`

- [ ] **Step 5: Commit**

```bash
git add RUNBOOK.md docs/guides/DEPLOYMENT_GUIDE.md docs/BEGINNER_DEPLOYMENT_GUIDE.md
git commit -m "docs: align deployment docs to deploy-on"
```

### Task 3: Remove Duplicate Stale CreatePost Coverage

**Files:**
- Modify: `frontend/src/pages/__tests__/CreatePostPage.test.tsx:1-244`
- Delete: `frontend/tests/unit/createPostPage.test.tsx`
- Reference: `frontend/src/pages/CreatePostPage.tsx:23-140`

- [ ] **Step 1: Compare old-only assertions and move any missing coverage into the newer suite**

Before deleting the old test file, preserve any useful scenarios that are not already covered in `src/pages/__tests__/CreatePostPage.test.tsx`.

Useful assertions worth keeping if missing:

```tsx
expect(screen.getByText(/choose where to post/i)).toBeInTheDocument();
expect(screen.getByRole('button', { name: /^link$/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /^text$/i })).toBeInTheDocument();
```

Add them to the newer suite if absent.

- [ ] **Step 2: Run only the page-level suite**

Run:

```bash
cd frontend
npm run test -- run src/pages/__tests__/CreatePostPage.test.tsx
```

Expected:
- PASS

- [ ] **Step 3: Delete the stale duplicate test file**

Remove:

```text
frontend/tests/unit/createPostPage.test.tsx
```

Reason:
- it uses a different, older harness
- it duplicates active coverage
- it is the direct source of the `useAuth must be used within AuthProvider` failure

- [ ] **Step 4: Run the full frontend suite to verify that failure count drops**

Run:

```bash
cd frontend
npm run test -- run
```

Expected:
- the four `CreatePostPage hub defaults` failures are gone
- remaining failures are limited to the other known files

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/__tests__/CreatePostPage.test.tsx frontend/tests/unit/createPostPage.test.tsx
git commit -m "test: remove stale duplicate create post coverage"
```

### Task 4: Rewrite QuickReactButton Test to Match the Current UI Contract

**Files:**
- Modify: `frontend/tests/unit/quickReactButton.test.tsx:1-67`
- Reference: `frontend/src/components/messages/QuickReactButton.tsx:19-130`
- Reference: `frontend/src/components/messages/EmojiPicker.tsx:20-138`

- [ ] **Step 1: Write the updated failing assertion with scoped queries**

Change the interaction to target the picker dialog instead of global `screen.getByRole()` for the emoji button:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Add reaction' }));
const picker = screen.getByRole('dialog', { name: 'Emoji picker' });
fireEvent.click(within(picker).getByRole('button', { name: 'React with 👍' }));
```

Also add the missing import:

```tsx
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
```

- [ ] **Step 2: Run the focused test first**

Run:

```bash
cd frontend
npm run test -- run tests/unit/quickReactButton.test.tsx
```

Expected:
- PASS

- [ ] **Step 3: Re-run message reaction-related tests**

Run:

```bash
cd frontend
npm run test -- run tests/unit/quickReactButton.test.tsx tests/unit/messageReactions.test.tsx tests/unit/useMessageReactions.test.tsx
```

Expected:
- PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/unit/quickReactButton.test.tsx
git commit -m "test: scope quick reaction picker assertions"
```

### Task 5: Stabilize Hub AI Design Renderer Feed Test

**Files:**
- Modify: `frontend/src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx:1-180`
- Reference: `frontend/src/components/hubDesign/HubAIDesignRenderer.tsx:109-233`
- Reference: `frontend/src/components/hubDesign/HubFeedSlotContent.tsx:17-45`
- Reference: `frontend/src/components/hubDesign/HubDesignSlots.tsx:177-190`

- [ ] **Step 1: Prove whether the failure is timing-only or logic-related**

Add an explicit assertion that the feed query resolves:

```tsx
await waitFor(() => {
  expect(mockGetHubPosts).toHaveBeenCalledWith('testHub', 'hot', 25);
});
```

Place this before checking for `"Rendered through slot"`.

- [ ] **Step 2: If the query resolves, wait on rendered post content instead of bundling all UI checks into one `waitFor`**

Split the current combined block into:

```tsx
await waitFor(() => {
  expect(within(heroSection as HTMLElement).getByRole('button', { name: 'Join' })).toBeInTheDocument();
});

expect(within(container).getByRole('button', { name: /\+ Create Post/i })).toBeInTheDocument();
expect(within(container).getByRole('button', { name: 'Mod Tools' })).toBeInTheDocument();

await waitFor(() => {
  expect(within(container).getByText('Rendered through slot')).toBeInTheDocument();
});
```

This avoids conflating portal mount timing with query resolution timing.

- [ ] **Step 3: If the query is not resolving, inspect the mock boundary instead of weakening the test**

If Step 1 still fails, trace:

```tsx
vi.mock('../../../services/hubsService', () => ({
  hubsService: {
    getHubPosts: (...args: unknown[]) => mockGetHubPosts(...args),
  },
}));
```

and adjust only the mock plumbing needed to restore the real feed rendering path.

- [ ] **Step 4: Run the focused AI renderer tests**

Run:

```bash
cd frontend
npm run test -- run src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx src/components/hubDesign/__tests__/HubAIDesignLayout.test.tsx
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/hubDesign/__tests__/HubAIDesignRenderer.test.tsx
git commit -m "test: stabilize hub ai renderer feed assertions"
```

### Task 6: Fix Audit Test DB Isolation So `go test ./...` Is Trustworthy

**Files:**
- Modify: `backend/internal/database/migrate.go:17-115`
- Modify: `backend/internal/testutil/database.go:21-49`
- Test: `backend/internal/audit/audit_logger_test.go:147-200`

- [ ] **Step 1: Make migration recording idempotent under repeated test setup**

Change the migration inserts from:

```go
if _, err := tx.Exec(ctx, "INSERT INTO public.schema_migrations (version) VALUES ($1)", version); err != nil {
```

and:

```go
if _, err := db.Pool.Exec(ctx, "INSERT INTO public.schema_migrations (version) VALUES ($1)", version); err != nil {
```

to:

```go
if _, err := tx.Exec(ctx, `
  INSERT INTO public.schema_migrations (version)
  VALUES ($1)
  ON CONFLICT (version) DO NOTHING
`, version); err != nil {
```

and the corresponding non-transactional form.

- [ ] **Step 2: Re-read applied migrations after setup or skip duplicate logging noise**

Keep the `applied` map authoritative and ensure the helper does not fail if another test process already inserted the version before this connection records it.

The behavior target is:
- migrations still run once when pending
- duplicate inserts do not abort the suite

- [ ] **Step 3: Run the focused failing audit tests**

Run:

```bash
cd backend
TEST_DATABASE_URL="postgres://postgres@localhost:5432/omninudge_test?sslmode=disable" GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./internal/audit -run 'TestAuditLogger_Log_NilMetadata|TestAuditLogger_Log_MetadataSanitization' -count=1
```

Expected:
- PASS

- [ ] **Step 4: Run the full backend suite**

Run:

```bash
cd backend
TEST_DATABASE_URL="postgres://postgres@localhost:5432/omninudge_test?sslmode=disable" GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./...
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/database/migrate.go backend/internal/testutil/database.go
git commit -m "test: harden audit migration setup"
```

### Task 7: Final Release-Gate Verification Before Manual Site Testing

**Files:**
- No code changes

- [ ] **Step 1: Run frontend release gates**

Run:

```bash
cd frontend
npx tsc -b --pretty false
npm run lint
npm run i18n:verify
npm run test -- run
npm run build
```

Expected:
- all commands exit `0`

- [ ] **Step 2: Run backend release gates**

Run:

```bash
cd backend
TEST_DATABASE_URL="postgres://postgres@localhost:5432/omninudge_test?sslmode=disable" GOCACHE=/private/tmp/omninudge-gocache GOTMPDIR=/private/tmp go test ./...
go build ./cmd/server
```

Expected:
- all commands exit `0`

- [ ] **Step 3: Prepare the manual QA checklist for the user**

After the code changes are complete, hand off these pages/areas for manual testing because they are directly affected:

```text
1. Create Post page:
   /posts/create
   /posts/create?hub=<hubName>

2. Messaging reactions:
   any conversation with message quick reactions + emoji picker

3. AI-designed hub page:
   /h/<hubName> with active AI design
   verify Join, Create Post, Mod Tools, and feed cards render inside slots

4. Deployment path:
   dry-run style verification of scripts, then post-change deploy script output review
```

- [ ] **Step 4: Commit any final cleanup if needed**

```bash
git status --short
```

Expected:
- clean working tree after the last intentional commit
