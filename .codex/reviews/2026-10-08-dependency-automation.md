# Dependency automation evidence review

Scope: the permanent dependency automation rollout through GitHub `main`
`2be38c070df09d0e21741346b6748a587a67e314`: the npm audit repair publisher,
GitHub App integration, authenticated merge policy, complete Python worker
locks and their generator/guards/CI/container contract, and the deployment
documentation. Application changes unrelated to those boundaries are excluded.

Workspace: the restored, isolated `dependabot-reliability` worktree on
`codex/dependency-evidence-review`. The user's dirty application checkout is
untouched. All negative controls use disposable copies outside the checkout.

Prior evidence read before source inspection: the existing skill and prevention
review ledgers; the completed rollout's recorded incidents (Actions-token PR
workflow approval, native pip-compile dropping the unsafe setuptools footer,
and the WebSocket test's join-order race); successful native worker PRs
151–155 and App-created verification PR 158; the final protected merge 159.
There is no previous dependency-specific ledger in `.codex/reviews`.

Controlled inputs: deterministic repository/actor IDs, fixed commit SHAs,
fixed timestamps, ordered file lists, and disposable Git repositories. Paired
cases will include clean/vulnerable npm graphs, native/App/untrusted PRs,
complete/missing worker pins, fresh/stale heads, and first-run/retry publication.
Actual boundary artifacts and exact commands will be recorded as instruments run.

Process/build stamps: baseline commit above; each Node/Python/Git probe starts
a fresh process. No long-running application server is used as review evidence.
Local probe runtimes: Node 23.6.0, Python 3.13.1, Git 2.39.5. Registry replay
uses the same pinned npm 11.12.1 as maintenance. Review artifacts are retained
under `/tmp/omninudge-dependency-review.QiX9tf`; fixtures use a fixed
`2026-10-08T00:00:00Z` Git clock and disposable repository identities.

## Pass 1

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | `git diff --name-only 16a76d28d..2be38c070` enumerated 38 files. Traced both npm projects through prepare/publish, the App/Actions token split, signed commit/PR/check/merge APIs, native refresh bookkeeping, all three requirements input/lock pairs, the Python generator/installed-graph guard, CPU CI and digest-pinned CUDA images, and the WebSocket test ordering fix. |
| A2 | applied | Read `.codex/reviews/2026-09-04-evidence-review-loop.md` and `2026-09-04-build-prevention.md`; searched all existing ledgers for this area and found none covering dependency automation. Read the rollout incident records and current dependency runbook before boundary probes. |
| B1 | applied | Printed complete GraphQL and PR JSON for one-lock and two-lock publications at fixed base `4eb668fd4ef7ed569f283832487db992d9c35b22`; fingerprints, addition counts, base64 contents and expected head differ as intended (`publish-pair.json`). Printed complete/missing-transitive worker lock and normalized audit payload pairs (`worker-pair.json`). |
| B2 | applied | Inspected real disposable filesystem state after `prepare`: clean graphs retained all four input byte hashes; vulnerable cases changed only source-map-js 1.2.1 to 1.2.2 in both locks and retained libc/cpu/os metadata (`prepare-pair.json`). The loaded worker graph accepted the complete lock and identified the exact missing setuptools edge. |
| B3 | applied | Captured the exact stdin JSON and argv received by the instrumented gh transport for both publication cases. Only PR creation used the fixture App credential; signed-commit requests used Actions and carried the expected-head guard. Decoded every base64 addition and compared it to the produced lock bytes. Raw records are in `publish-pair.json`; no live credentials were recorded. |
| B4 | applied | Materialized each publication's Git tree/commit in disposable Git storage and read each added file back with `git show`, matching the submitted bytes. Independently retrieved real GitHub PR/file/commit records for App verification 158 and native update 155: both retain verified bot-authored commits and a github-actions[bot] merge; 158 stores one trailing newline, 155 stores the filelock 3.32.3 to 4.0.11 update (`github-*-158.json`, `github-*-155.json`). |
| B5 | applied | Fresh npm 11.12.1/public-registry runs on full actual project graphs preserved clean bytes and repaired only source-map-js 1.2.1 to 1.2.2; both audits changed 1 to 0 (`real-npm-pair.json`). Real uv 0.11.19/Python 3.12-Linux resolution retained all 97 avatar pins for matching Pydantic/core inputs; changing only core 2.46.5 to 2.46.6 failed with the exact parent constraint and preserved the original lock bytes (`real-worker-pair.json`). Baseline-stamped CI 37813079041 freshly built all three actual CUDA images and ran CPU pipeline/import contracts inside them; retained logs show clean pip checks/audits and 95/95/4 runtime tests. Local Docker daemon is unavailable; these are real Linux CI container runs, not a claim of local or GPU execution. |
| C1 | applied | Compared all 15 required names against expanded workflow matrix names and live strict branch-protection contexts/provider ID 15368. Compared App bot ID 339450602, Python 3.12, Torch 2.13.0/torchvision 0.28.0 input/lock/matrix pins, and the identical CUDA 13 image digest across all workers (`contracts.json`). |
| C2 | applied | GitHub's live GraphQL schema and official gh query builder expose the CheckRun/StatusContext union. The actual gate accepted 15 successful check runs but rejected the same records plus a successful StatusContext. Confirmed DA-001; normalized legacy contexts separately from required Actions jobs and added unit plus full-merger regressions. |
| C3 | applied | Fed identical success/pending/error/failure legacy statuses through native and App merger paths; all eight cases agree on eligibility (`merger-parity.json`). Compared the compiled Python input/lock roots and CPU/CUDA upstream-release mapping against actual matrix/container observations; expected differences are build tags and image-owned CUDA packages. |
| C4 | applied | Inspected owner identity, token ownership/revocation, expected-head writes, immutable branch identities, native refresh markers, 30-minute backoff, job/registry timeouts and error propagation. Paired lost-close-response and concurrent-human-closure cases exposed DA-002: immediate recovery reopened both. Fixed recovery to authenticate the latest closure before reopening; legitimate automation recovery still succeeds (`merger-ownership-before.json`). |
| C5 | applied | Traced verification input to prepare output, token condition, App identity check, signed commit, immutable branch, PR author/head, both check representations, and merge SHA. Tracing requirements.in extras through the stripped compiled lock exposed DA-003: direct extras never reached installed-graph traversal. Added explicit propagation from validated roots; entrypoint regression covers inactive, missing, complete and version-incompatible extra dependencies (`root-extras-before.json`). |
| D1 | applied | Six focused passing controls exercised exact-head merge, clean/repair preparation, the actual prepare CLI output used to gate App credentials, immutable branch retry identities, and signed publication (`d1-passing.log`). Root-extra inactive/complete cases pass through the real worker entrypoint. |
| D2 | applied | Eight focused hostile controls rejected wrong owners/IDs, unsigned commits, forbidden paths, renamed/truncated file lists, missing PR rollups, wrong check provider/head, malformed audit reports, source/manifest edits, direct majors, pending/error statuses and required-check substitution (`d2-hostile.log`). |
| D3 | applied | Numeric maximum/one-beyond probes confirmed DA-004: Number rounding accepted an apparent same-major comparison between distinct huge majors and hid a downgrade, including Python post releases (`version-boundaries-before.json`). Added exact-integer bounds for every compared numeric component; the largest safely represented patch still succeeds. Counts 0/1/2/3 permit only the one/two allowed lockfiles; 0/1/14/15 check counts permit only all 15; the refresh retries at exactly 30 minutes but not one millisecond earlier (`count-boundaries.json`, focused stalled-refresh test). |
| E1 | applied | Enumerated every verify_worker/verify_lock/verify_inputs caller and all three worker CI/container/input siblings. Shared entrypoint now carries direct extras for every worker. Compared native/App check paths, refresh recovery entrypoints and publication paths; no sibling-only omission found beyond the recorded fixes. |
| E2 | applied | Exercised clean versus repaired prepare output, explicit whitespace verification, native stale refresh versus immutable maintenance wait, open versus closed recovery and terminal versus pending statuses. Inspected workflow conditions and the job selection contract; expected branches remain reachable. |
| E3 | applied | Seven focused tests in `e-gates-errors.log` observe missing App identity, audit corruption, lost close/reopen responses and interrupted recovery. Transport failures reach exitCode 1; optional App lookup failure still allows authenticated native candidates; malformed audits cannot proceed to publication. |
| E4 | applied | Re-read both privileged workflow permission/checkout/token conditions and the publisher credential checks. Tested missing/mismatched App credentials before any mutation, dry runs with no writes, native PR approval rollup and exact-head/provider gates. Registry processes receive no write-token environment and the App token is minted only after changed=true. |
| E5 | applied | Compared policy allowlists to all active manifests and Dependabot entries, 15 job names to expanded CI matrix and live protection, and three duplicated runtime pins/digests. Existing workflow-contracts tests cover these drift-prone boundaries; WORKFLOWS is consumed by that contract even though dispatch is no longer the publication path. |
| F1 | applied | Ran 200 real Go race-detector iterations of the changed WebSocket join-order regression, plus 800 deterministic main/head interleavings through both merger paths. No stale merge occurred. A paired interrupted refresh with only the head changed exposed DA-005 (`merger-stress-before-da005.json`); recovery now follows the authenticated closure cycle and both cases reopen. |
| F2 | applied | Stateful provider replay persists real Git objects and injects lost ref/commit/PR responses and expected-head races. Retries publish exactly one commit and one PR; stale main/head failures create no PR. DA-006 exposed that an extra allowed lock on an existing head bypassed the content fingerprint; both locks must now match the audited snapshot before reuse (`publisher-lifecycle-before-da006.json`, `publisher-lifecycle.json`). |
| F3 | applied | Started fresh PostgreSQL 16.15 on a temporary data directory and random loopback port, built the actual migration CLI, applied all 203 migrations, ran the full down ladder and reapplied to 203. Historical migration 029 fails after 175 successful downs because 033 already removed auto_rollback; 28 migrations remain at that point (`migration-ladder.json`). Confirmed database sources/runner/driver are byte-identical to baseline. Recorded X-001 outside this dependency scope. Temporary server stopped cleanly. |
| F4 | applied | Ten persisted provider scenarios cover first/retry, lost ref/commit/PR responses, human-closed decisions, advanced main, concurrent head, exact orphan and altered orphan/published heads. Seven focused lifecycle tests cover timeout/backoff, lost reopen response, next-run cleanup, dry run, recovery and extra-lock denial (`publisher-lifecycle.json`, `f4-lifecycle.log`). Real uv failure leaves the old lock intact and its temporary output is removed. |
| G1 | applied | Reran all six controls from fresh disposable copies of the final Pass 1 state. Each fixed/restored test passes; each reverse patch compiles and triggers its intended assertion. JSON records and the individual removed logs were personally inspected. No reversal touched the review or user checkout. |
| G2 | applied | Compared native/App status success versus pending/failure, human versus automation closure, unchanged versus moved head, inactive versus missing direct extras, maximum safe versus unsafe numbers, and exact versus extra-lock snapshots. Passing counterparts remain reachable; hostile counterparts execute the new guards (`merger-parity.json`, `merger-stress.json`, `root-extras-pair.json`, `count-boundaries.json`, `publisher-lifecycle.json`). |
| H1 | applied | Fresh local processes passed all 55 Node tests, 12 worker-lock tests and 16 Codex guard tests, JSON/shell syntax and git diff whitespace checks. The WebSocket server package passed a full race run after its 200-iteration targeted stress. Actual Linux container/import/audit gates are stamped to baseline CI 37813079041; local Docker remains unavailable and the new revision will require protected PR CI. |
| Z1 | applied | Reconsidered the completed boundary/race/control observations. No reusable instrument beyond the existing protocol was needed: the stateful lost-response/real-Git replay is covered by persistence, atomics and lifecycle. No protocol/schema change. |

Findings: DA-001 through DA-006 fixed; unrelated historical rollback issue X-001 recorded below; this pass cannot terminate
Controls: DA-001 through DA-006 each compile, pass fixed, fail by the specific assertion with only its guard removed, and pass restored; all controls rerun on the final Pass 1 state

### DA-001 — Successful legacy statuses block automatic merging

Severity: medium. Instrument: C2. Boundary: `gh pr view` GraphQL rollup to the
merge gate. GitHub returns legacy statuses as `context/state`, while check runs
use `name/status/conclusion`. Treating both as check runs blocked even successful
legacy statuses and described terminal failures as pending. Fixed by normalizing
legacy statuses into a separate `status:` namespace, preserving the requirement
for all actual Actions check runs. Regression tests cover native and App PRs,
success, pending, error/failure, malformed states, and same-name substitution.
Control: `/tmp/omninudge-dependency-review.QiX9tf/control-da001-dwu2h1a3/remove-status-normalization.patch`.
The fixed and restored copies pass both focused tests. The copy without
normalization compiles and fails both required assertions (`0 !== 1` and
`false !== true`). Personally inspected the logs recorded in `control-da001.json`.

### DA-002 — Immediate recovery can undo a human PR closure

Severity: medium. Instrument: C4. Boundary: an ambiguous close request and its
`finally` recovery. If the close request fails before reaching GitHub and a
person closes the PR concurrently, the unconditional reopen undoes that
decision. Fixed by sharing the authenticated closure check between interrupted
and immediate recovery, re-reading current PR state, and preserving terminal
human closures while removing obsolete recovery bookkeeping. The original
transport error remains visible. The paired legitimate lost-response case still
reopens the automation-owned closure. Control:
`/tmp/omninudge-dependency-review.QiX9tf/control-da002-db6whtdz/remove-reopen-ownership-check.patch`.
The fixed/restored copies pass. Removing only the ownership gate still compiles
and fails the assertion that a failed automation request must not undo a human
closure (`control-da002.json`).

### DA-003 — Direct requirement extras disappear before installed-graph validation

Severity: medium. Instrument: C5. Boundary: `requirements.in` to compiled
`requirements.txt` to installed metadata. pip-compile intentionally strips
extras notation from the lock. The guard compared root versions but then
traversed only extras present in the lock or transitive Requires-Dist edges,
so a requested direct extra could omit a required pin or constraint unnoticed.
Fixed by returning validated roots and passing their extras into graph traversal.
Regression exercises the actual worker entrypoint with real requirement parsing
and controlled installed metadata. Control:
`/tmp/omninudge-dependency-review.QiX9tf/control-da003-_otyp5bh/remove-direct-extras-propagation.patch`.
Fixed/restored copies pass; removing propagation compiles and fails with
`AssertionError: ValueError not raised` (`control-da003.json`).

### DA-004 — Numeric rounding hides version changes

Severity: low. Instrument: D3. Boundary: version text to JavaScript numeric
comparison. Values beyond Number.MAX_SAFE_INTEGER can collapse distinct majors
or reverse-ordered minor/post values into equal numbers. Fixed by rejecting
numeric components that cannot be represented exactly, leaving such releases
for review. The focused regression preserves the maximum safe passing case and
rejects the next value, huge-major change, and hidden downgrades. Control:
`/tmp/omninudge-dependency-review.QiX9tf/control-da004-lmppttg9/remove-safe-integer-bounds.patch`.
Fixed/restored copies pass; removing the two numeric bounds still compiles and
fails the comparison assertion (`true !== false`) in the focused regression.
Personally inspected all three outcomes in `control-da004.json` and its logs.

### DA-005 — A head update strands interrupted refresh recovery

Severity: medium. Instrument: F1. Boundary: a queued Dependabot head update
between an authenticated close and retry. Recovery filtered markers only by the
current head, so moving that head left the automation-owned PR closed indefinitely.
Fixed recovery to recognize authenticated full-SHA markers from the same closure
cycle, even after a head change. Markers before the most recent reopen cannot
authorize a later close. The entrypoint regression covers both cases. Control:
`/tmp/omninudge-dependency-review.QiX9tf/control-da005-wr5nm2vp/remove-head-independent-recovery.patch`.
Fixed/restored copies pass; reverting only prior-head recognition compiles and
fails the required open-state assertion. Inspected `control-da005.json` and logs.

### DA-006 — Publication retries can reuse an unaudited extra lock change

Severity: medium. Instrument: F2. Boundary: orphan/existing signed branch to PR
creation/reuse. The old comparison inspected only locally changed locks. A signed
head containing the intended frontend repair plus a different Babylon lock was
accepted under the frontend-only fingerprint. Fixed recovery to compare every
allowed lock against the locally audited bytes; mismatches fail before mutation.
Exact retries still reuse the head and create only the missing PR. Regression
covers both orphan and published heads with exact and extra-lock cases. Control:
`/tmp/omninudge-dependency-review.QiX9tf/control-da006-_1a93qn9/remove-complete-snapshot-check.patch`.
Fixed/restored copies pass; removing the complete-snapshot guard compiles and
fails with Missing expected exception. Inspected `control-da006.json` and logs.

### X-001 — Existing historical rollback conflict (outside scope)

Severity: medium. Instrument: F3. Boundary: the historical SQL down ladder.
Fix: outside the declared dependency scope; no migration files were changed.
Control: no fix was applied, so no reverse-patch control is claimed. The repeated
real database execution and identical baseline files prove the existing failure.

The actual full down ladder fails at `029_feature_flag_rollouts.down.sql`:
`033_feature_flag_rollouts_safe.down.sql` has already dropped auto_rollback,
and 029 drops it again without IF EXISTS. All 203 up migrations succeed,
175 down steps succeed, and reapplying from the remaining 28 returns to 203.
These migration/runner/driver files have no changes in either the dependency
rollout or this review. This is a pre-existing database migration defect,
separate from the scoped dependency automation changes. It is not claimed fixed
or used as a passing rollback result. Logs are in the temporary migration-ladder
directory named by `migration-ladder.json`; the owned PostgreSQL server is stopped.

Additional techniques: none beyond the current protocol.

## Pass 2

Fresh complete review of the final eight source/test files from Pass 1, together
with the original 38-file rollout boundary. `pass2/build-stamp.json` records their
SHA-256 identities before probes. All executable evidence starts in new processes.

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried the original 38-file rollout and the final eight reviewed source/test files, callers and persisted forms. Recorded exact file hashes in `pass2/build-stamp.json`; scope and baseline remain unchanged. |
| A2 | applied | Re-read all Pass 1 findings, controls, lifecycle/registry/container results, X-001 limitation and the current dependency runbook before the new boundary probes. |
| B1 | applied | Printed fresh complete GraphQL/PR payloads for one and two locks and complete/missing worker/audit payloads; fixed base and byte hashes match Pass 1 (`pass2/publish-pair.json`, `pass2/worker-pair.json`). |
| B2 | applied | Fresh clean/vulnerable preparation retained all clean bytes and changed only the source-map-js pin, preserving platform metadata. Inspected the loaded complete/missing worker graph and exact error (`pass2/prepare-pair.json`). |
| B3 | applied | Read actual captured argv/stdin and decoded each base64 addition; both cases use Actions for commits and the App only for POST pulls. Expected-head and branch fingerprints agree with produced files (`pass2/publish-pair.json`). |
| B4 | applied | Read both disposable persisted Git commits back byte-for-byte, then freshly retrieved real GitHub PRs 155 and 158, their signed commits, stored file patches, merges and check rollups; both remain authenticated automatic merges. |
| B5 | applied | Fresh real npm 11.12.1 audits give 0/0 for unchanged graphs and 1-to-0 for each single-package repair. Real uv compatible/conflicting resolution preserves all 97 pins or fails without changing the lock. Added a disposable installed requests[socks] environment: actual metadata accepts inactive and complete extras but rejects a missing PySocks pin (`pass2/real-npm-pair.json`, `real-worker-pair.json`, `real-extras.json`). Existing GPU image contract is unchanged; fresh PR container execution remains a delivery gate. |
| C1 | applied | Fresh live protection and App lookup still match all 15 names/provider 15368 and bot ID 339450602. All three Python/Torch/torchvision/CPU/CUDA pins and image digests agree (`pass2/contracts.json`). |
| C2 | applied | Recompared the actual CheckRun/StatusContext union schema and gh field construction with both normalizers. Successful contexts pass, malformed/terminal/pending contexts block, and legacy contexts cannot replace required Actions checks; both focused regressions pass. |
| C3 | applied | Replayed all eight native/App legacy-status cases: success merges and pending/error/failure do not. Compared actual CPU pin normalization and installed-extra traversal to input intent; differences are only the documented Torch build tag and image-owned CUDA graph (`pass2/merger-parity.json`, `real-extras.json`). |
| C4 | applied | Re-exercised authenticated lost-response recovery, human closure preservation and all ten stateful publication scenarios. Re-read scoped token use, revocation, bounded waits, immutable heads and expected-head writes; observed outcomes satisfy ownership/idempotency contracts (`pass2/merger-ownership.json`, `publisher-lifecycle.json`). |
| C5 | applied | Traced allowPreviousHead through comment filtering and closure-cycle checks, normalized status fields through both gates, every lock through fingerprint comparison and PR creation, and root_extras from real inputs into installed metadata. Re-ran prepare CLI output/token-condition and root-extra entrypoint cases; no unwired fields. |
| D1 | applied | Six focused realistic passing controls succeed again: exact-head merge, clean and repaired preparation, CLI changed output, deterministic branch identity and native-CI publication (`pass2/d1-passing.log`). |
| D2 | applied | Seven focused hostile-control groups reject identity/provider/head mismatches, missing PR checks, malformed audits, source/config edits, forbidden paths, status substitution and extra-lock reuse. Worker entrypoint rejects missing/incompatible extras (`pass2/d2-hostile.log`, `real-extras.json`). |
| D3 | applied | Re-executed 0/1/2/3 lock counts, 0/1/14/15 checks, safe-integer limit and one-beyond, plus 30-minute backoff minus one millisecond and exact expiry. Only the expected boundary cases pass (`pass2/count-boundaries.json`, `d3-boundaries.log`). |
| E1 | applied | Enumerated every caller of the changed normalizer, refresh helper and worker input/graph functions. Both immediate and interrupted recovery share the ownership gate; all worker kinds use the entrypoint that carries extras; both published and orphan heads compare both locks. |
| E2 | applied | Re-exercised clean/repair/verification, no-token/token, open/closed recovery, old/new closure cycle and existing/new PR branches. Read all condition ordering against the captured provider traces; no branch became unintentionally unreachable or unconditional. |
| E3 | applied | Eight focused tests confirm error propagation and recovery cleanup on missing App identity, lost close/reopen responses, interrupted refresh and malformed audits. Provider replay preserves lost-response errors and failed expected-head writes never create a PR (`pass2/e-errors-gates.log`). |
| E4 | applied | Re-read workflow permission/timeout/checkout/concurrency gates and credential conditions; tested dry-run nonmutation and missing/mismatched App credentials. Required Actions provider, actual PR rollup, head/main identity and immutable-snapshot checks remain active. |
| E5 | applied | All seven workflow contracts pass against current active manifests, Dependabot entries, required-check names, locked runtimes and registry/token ownership. Fresh protection comparison confirms no drift (`pass2/e-drift.log`, `contracts.json`). |
| F1 | applied | Repeated the 800 main/head interleavings and both interrupted-refresh head cases, plus 200 real Go race-detector iterations. No stale merge, stranded valid recovery or Go race occurred (`pass2/merger-stress.json`, `f1-go-race.log`). |
| F2 | applied | Read persisted Git objects again for all eight applicable lifecycle scenarios. Exactly one commit/PR survives lost responses; exact orphan recovery publishes only the PR; altered orphan/published snapshots perform no mutation. Expected-head conflicts fail atomically (`pass2/publisher-lifecycle.json`). |
| F3 | applied | Fresh isolated PostgreSQL ladder repeats 203 up, 175 down before the already-recorded X-001 failure, then 203 after reapply. The failing legacy files and runner are unchanged. Server shut down after the run; no new migration finding (`pass2/migration-ladder.json`). |
| F4 | applied | Re-ran all seven lifecycle test groups and inspected the ten persisted provider cases: human-closed PRs stay closed, recoverable lost responses converge once, stale heads/main fail, and labels clear after recovery. Failed uv resolution preserves committed bytes; every owned temporary database was stopped. |
| G1 | applied | All six fresh Pass 2 disposable controls compile and show fixed=pass, removed=specific assertion failure, restored=pass. Inspected all outcomes and reverse patches in `pass2/control-da001.json` through `control-da006.json`. |
| G2 | applied | Passing and hostile counterparts in each control demonstrate that every new guard is reached and selective. Actual installed requests extras also prove entrypoint wiring beyond mocked metadata; native/App success and exact publication retry still proceed. |
| H1 | applied | Fresh final-state checks pass: 55 Node tests, 12 Python lock tests, 16 guard tests, full Go server race suite, shell/JSON syntax and diff whitespace. Recomputed all eight reviewed source hashes and they match the start-of-pass stamp. Linux container execution will run in protected PR CI; no local Docker/GPU execution is claimed. |
| Z1 | applied | No additional technique beyond the protocol was needed. All prior techniques were repeated and no implementation, test or product documentation changed during this pass. |

Findings: none
Controls: all six prior regressions were reproved with isolated compiling negative controls and passing counterparts

Additional techniques: none beyond the current protocol. X-001 remains an explicitly documented unrelated historical migration limitation.

## Pass 3

Integration pass after native automation independently merged PRs 160, 161 and
163 while the review ran. The review branch fast-forwarded to
`8868d0f0b6e46d10fc9967cfcaf23f10d061cb89`. Their five files change Redis
modules, frontend dependency versions and the video filelock pin. The eight
reviewed source/test hashes remain unchanged (`pass3/build-stamp.json`).

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Inventoried all five newly integrated dependency files and the eight review files. No automation, container, migration or runtime-contract code changed upstream; the changed Redis/frontend/video graphs receive a fresh boundary and gate pass. |
| A2 | applied | Re-read Pass 2 evidence and limitations and inspected the three merged dependency diffs before this integration pass. The six fixes, their controls and X-001 remain the relevant prior evidence. |
| B1 | applied | Materialized both complete publication payloads and worker/audit payload pairs again. Compared every field to Pass 2 at the fixed clock/base: GraphQL/PR bodies, fingerprints and addition counts are identical (`pass3/publish-pair.json`, `worker-pair.json`). |
| B2 | applied | Fresh prepare fixtures retain clean bytes and repair only source-map-js; loaded state and platform metadata equal the promised outputs. Complete/missing worker cases again separate correctly (`pass3/prepare-pair.json`). |
| B3 | applied | Captured fresh receiver-side stdin/argv for both lock counts. Exact JSON comparison against the previously inspected full messages confirms Actions/App separation, expected-head guard and decoded file bytes across the current source. |
| B4 | applied | Fresh disposable Git commits read back with the same content-addressed tree/commit IDs as Pass 2 for both inputs. New lifecycle provider storage independently exercises current retry behavior; real merged PR/signature records remain consistent. |
| B5 | applied | Real registry replays on the updated frontend graph still preserve 0-finding graphs and repair only source-map-js 1.2.1 to 1.2.2 with 1-to-0 audit results. uv compatible/conflicting runs retain 97 pins or the original bytes; real installed extras accept inactive/complete and reject the missing pin (`pass3/real-*-pair.json`, `real-extras.json`). |
| C1 | applied | Recompared all manifest allowlists, worker Python/Torch/torchvision/image constants and all 15 check names/provider IDs against the current tree and live records from Pass 2. The upstream version changes do not alter these cross-boundary contracts (`pass3/contracts.json`). |
| C2 | applied | Repeated both legacy-status regressions against the exact gh union shapes and inspected their results; required Actions jobs remain distinct from legacy contexts (`pass3/c2-shapes.log`). |
| C3 | applied | Repeated all eight native/App success/pending/error/failure cases and real CPU/extras normalization. Observable eligibility stays equal across merger implementations (`pass3/merger-parity.json`, `real-extras.json`). |
| C4 | applied | Fresh ownership and ten-case publication replays preserve human decisions, recover only authenticated attempts, reject mismatched snapshots and converge once after lost responses. Timeouts/backoff and token scope remain unchanged (`pass3/publisher-lifecycle.json`). |
| C5 | applied | Re-ran CLI changed-output and worker-root-extras entrypoints; compared every reviewed source hash to Pass 2 to confirm the integrated dependency updates did not sever field construction/serialization/consumption. All new fields remain exercised end to end. |
| D1 | applied | All six realistic passing cases still succeed on the integrated branch (`pass3/d1-passing.log`). |
| D2 | applied | All seven hostile-control groups pass, including malformed audits, owner/provider mismatches and altered snapshots; actual installed extras also reject the missing dependency (`pass3/d2-hostile.log`). |
| D3 | applied | Repeated count limits, numeric exactness boundaries and refresh expiry. JSON results exactly match Pass 2; both focused boundary regressions pass (`pass3/count-boundaries.json`, `d3-boundaries.log`). |
| E1 | applied | Compared worker input/lock siblings after the video filelock update, native/App merger paths, and both recovery entrypoints. All changed fields remain shared through the same reviewed helpers; no sibling omitted a required step. |
| E2 | applied | Followed the receiver traces through initial/retry, open/closed, old/new cycle, clean/repair and credential branches. Actual CLI and provider executions reach each intended alternative; no integrated dependency update changes branch selection. |
| E3 | applied | All eight focused error/recovery groups pass again; losing responses preserves failure reporting and the recoverable state. Inspected the real uv conflicting-pin error and old-byte preservation (`pass3/e-errors-gates.log`, `real-worker-pair.json`). |
| E4 | applied | Rechecked live-backed gate constants and workflow token/checkout permissions against the current branch. Successful real registry resolution still precedes token use; hostile owner/head/provider and dry-run cases execute the same denial gates. |
| E5 | applied | All seven drift contracts pass using the newly installed locked frontend parser; all 15 required jobs and three runtime/input/lock/container contracts remain aligned (`pass3/e-drift.log`, `contracts.json`). |
| F1 | applied | Repeated 800 deterministic head/main interleavings and 200 real race-detector iterations against the updated Go module graph. All pass; the authenticated changed-head recovery pair still converges (`pass3/merger-stress.json`, `f1-go-race.log`). |
| F2 | applied | Re-read real stored Git diffs for each lifecycle scenario: exact snapshots and one-time publication match expectations, altered extra-lock heads cause no mutation, and stale main/head cannot create a PR (`pass3/publisher-lifecycle.json`). |
| F3 | applied | Built the actual migration CLI with the integrated module graph in a new PostgreSQL 16.15 instance: 203 up, the known 029 down failure after 175 successful reversals, and 203 after reapply. The instance stopped cleanly; X-001 is unchanged (`pass3/migration-ladder.json`). |
| F4 | applied | Seven lifecycle groups pass again and every lost-response/closed/orphan provider result was inspected. Authenticated retries converge, human closures persist, failed resolvers keep original locks, and temporary database processes are stopped (`pass3/f4-lifecycle.log`). |
| G1 | applied | Reproved all six regression controls in fresh disposable copies; each compiles and passes/fails by its intended assertion/passes. Personally inspected all control outcomes and patch paths (`pass3/control-da001.json` through `control-da006.json`). |
| G2 | applied | All six paired passing/hostile regressions still execute the intended guard. Real installed extras and exact orphan retries supplement the assertion controls; no valid path is blocked. |
| H1 | applied | All 55 Node, 12 worker-lock and 16 guard tests pass using current dependencies. Full Go server race suite, Go module verification, shell syntax and diff whitespace checks pass. All eight reviewed source/test hashes still match the start of this pass. |
| Z1 | applied | Repeated all previously used techniques; no new instrument or protocol change is needed. The integrated dependency graph introduces no new finding. |

Findings: none
Controls: all six prior fixes again pass isolated compiling negative controls and their passing counterparts

Additional techniques: none beyond the current protocol. X-001 remains outside this dependency review.

## Pass 4

Final integration pass at `594bab02f81df84d3776aefe180e583f1eeafd19`, after
native automation merged PR 164. The only additional upstream change is the
image worker's transitive filelock 3.32.3 to 4.0.12 update. All eight reviewed
source/test file hashes still match (`pass4/build-stamp.json`).

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Re-inventoried the single new image lock change and its input, installed-graph and CI consumers; every reviewed source/test hash is unchanged. |
| A2 | applied | Read the completed Pass 3 results, the exact PR 164 lock diff, all six previous controls and the known X-001 limitation before final integration probes. |
| B1 | applied | Fresh one/two-lock and complete/missing-worker payloads were printed and compared in full to Pass 3; fixed-clock payloads are identical (`pass4/publish-pair.json`, `worker-pair.json`). |
| B2 | applied | Fresh clean/vulnerable preparation produces the same expected loaded filesystem state, pin-only repair and preserved platform metadata (`pass4/prepare-pair.json`). |
| B3 | applied | Fresh receiver-side raw stdin/argv and decoded additions exactly match the previously inspected full records for both materially different inputs. The App still receives only PR creation; Actions owns expected-head commits. |
| B4 | applied | Read fresh content-addressed Git objects for both publications and all lifecycle branches. Compared PR 164 tested and merged trees: both are ae38f365665e526618cdd46cee5e679d68ac5654 with all 15 required checks successful. |
| B5 | applied | Real npm clean/vulnerable runs preserve clean bytes and repair only source-map-js with audits 1-to-0. Real uv resolution retains 97 pins or preserves the old lock on conflict; installed requests extras pass inactive/complete and reject the missing pin. PR 164 supplies actual Linux CI evidence for the latest image lock (`pass4/real-*-pair.json`, `real-extras.json`, `merged-164.json`). |
| C1 | applied | Recompared current worker pins, digest, Python version, manifest coverage and all 15 required names/provider IDs against freshly read protection. All contracts agree (`pass4/contracts.json`). |
| C2 | applied | Both legacy-status shape regressions pass again against the real gh union contract; malformed/terminal statuses remain blocked and cannot substitute for required Actions jobs (`pass4/c2-shapes.log`). |
| C3 | applied | All eight native/App status scenarios retain matching eligibility; CPU audit normalization and actual installed-extra behavior match their declared input (`pass4/merger-parity.json`, `real-extras.json`). |
| C4 | applied | Fresh ownership and ten publication scenarios reproduce correct retry, timeout/backoff, human-decision and credential behavior. Signed altered snapshots are denied; exact interrupted publication converges once (`pass4/publisher-lifecycle.json`). |
| C5 | applied | Fresh CLI output and worker entrypoint probes exercise token-condition and root-extras wiring. Every reviewed source hash matches the already traced implementation; the new image pin adds no field or control path (`pass4/c5-cli.log`, `root-extras-pair.json`). |
| D1 | applied | All six realistic passing groups succeed on the final integrated branch (`pass4/d1-passing.log`). |
| D2 | applied | All seven hostile groups pass; identity, provider, audit shape, source changes, legacy substitution and mismatched snapshot cases fail closed (`pass4/d2-hostile.log`). |
| D3 | applied | Repeated file/check counts, exact numeric limits and refresh wait minus one millisecond/exact expiry. Results match the promised boundaries (`pass4/count-boundaries.json`, `d3-boundaries.log`). |
| E1 | applied | Compared all worker-kind callers and both native/App and immediate/interrupted recovery siblings against the final source. Shared guards still cover each path; the image lock change introduces no missing sibling step. |
| E2 | applied | Inspected current receiver traces and branch outcomes for clean/repair/verification, old/new heads, current/earlier closure cycles and first/retry publication. Intended success and denial alternatives remain reachable. |
| E3 | applied | All eight focused error/recovery groups pass; real resolver conflicts and provider lost-response errors remain visible, with no partial publication accepted (`pass4/e-errors-gates.log`, `real-worker-pair.json`). |
| E4 | applied | Checked current checkout, permission, timeout, credential, dry-run, exact-head and native PR approval preconditions. Their paired tests and live-backed constants remain active; no permission or branch-protection setting changed. |
| E5 | applied | All seven drift contracts pass with the installed current frontend parser, covering all active manifests, all 15 checks and all three worker runtime/input/lock/container contracts (`pass4/e-drift.log`). |
| F1 | applied | Ran another 800 deterministic main/head interleavings and 200 real Go race iterations on this baseline. Both moved/unchanged-head refresh cases recover correctly (`pass4/merger-stress.json`, `f1-go-race.log`). |
| F2 | applied | Inspected fresh actual Git diffs and mutation lists for all lifecycle cases. Lost responses leave one commit/PR; exact orphan recovery only creates the missing PR; extra-lock snapshots and optimistic-head conflicts create no PR (`pass4/publisher-lifecycle.json`). |
| F3 | applied | Fresh isolated PostgreSQL 16.15 repeats 203 up, the unchanged X-001 historical failure after 175 down steps, and 203 after reapply. The instance stops in cleanup; no new migration issue (`pass4/migration-ladder.json`). |
| F4 | applied | All seven lifecycle groups pass again; closures, retries, lost responses, dry runs, orphan labels and immutable publication behave as recorded. Real uv failures preserve old files; no owned database process remains running (`pass4/f4-lifecycle.log`). |
| G1 | applied | All six final-state controls compile and show pass/assertion failure/pass in fresh disposable copies. Personally inspected the outcomes and reverse-patch records (`pass4/control-da001.json` through `control-da006.json`). |
| G2 | applied | Compared all paired status, ownership, count and root-extra results to their expected outputs and inspected each control passing counterpart. Every guard executes for its hostile input while valid behavior still succeeds. |
| H1 | applied | Final local gates pass: 55 Node, 12 worker-lock and 16 guard tests, full Go server race suite, Go module verification, shell/JSON syntax and diff whitespace. All eight source/test hashes and baseline still match the beginning of this pass. The PR must additionally pass all protected GitHub checks before merge. |
| Z1 | applied | Every prior technique was repeated; no new instrument or protocol change was required. No source, test or product-documentation change was made during this final integration pass. |

Findings: none
Controls: all six fixes reproved with compiling isolated negative controls and passing counterparts

Additional techniques: none beyond the protocol. The unrelated historical rollback issue X-001 is explicitly retained and is not claimed fixed.
