# Soundbooth follow-up evidence review

Scope: changes since the September 18 review: queue guidance and late preparation entry/replacement; preview boot, refresh and recovery; disabled sky-capacity limits and removed instructional text. Includes their authoritative world/socket, HUD, renderer/audio and local-fixture boundaries. Unrelated avatar, account, database and venue art changes are excluded.

Prior evidence: read `2026-09-18-soundbooth-controls.md` and the evidence protocol completely before this pass. That review predates the changes above; its earlier budget/lifetime results do not establish behavior with capacity disabled.

Artifacts: `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/soundbooth-followup-evidence-20260921-cm9rs74f`. Initial source hashes and dirty-worktree inventory are in `initial-manifest.json` and `initial-status.txt`.

Controlled inputs: fixed epoch 2026-09-17T20:00:00Z, player IDs a/b/p, seed 42; early versus late entry; prepared versus live; capacity disabled versus positive configured caps; one versus dense overlapping shells; fresh versus refreshed/failed entry. UUIDs may be retained in raw frames but excluded from semantic comparisons.

Process/build stamps: both passes rebuilt the Go fixture and restarted preview processes before live evidence. The final executable hash and process IDs are in `pass2-build-stamp.json`; 22 scoped source hashes were unchanged throughout the final pass (`pass2-source-stability.json`).

## Pass 1

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Inventoried changed files and direct consumers in initial-manifest.json; in-memory world and socket state, shared catalogue, HUD markup/local visibility preference, WebGL preview and full-venue renderer/audio, HTML boot entry and Vite output. |
| A2 | applied | Read previous complete soundbooth ledger and known limitations first; user now explicitly disables capacity, while cooldowns, turn lengths and queue contracts remain. |

| B1 | applied | b1-commands.json captures fully serialized prepare/live commands with fixed request, player and turn IDs; only action differs. |
| B2 | applied | b2-markup.json has prep guidance and a hidden empty live hint; both removed lines absent. b2-density.json: single effects sum to 43,502 quads. Legal repeated-shell overlap exposes SF-001: 90,971 requested versus 66,940 rendered. |
| B3 | applied | b3-wire.json captures actual Gorilla frames: late preparation, one four-shell group, and 84 surviving shells of 88 accepted (cost 226). All groups accepted with capacity disabled; expired shells are pruned. |
| B4 | applied | b4-storage.json records queue preference absent/default-visible versus true/hidden, followed by new HUD instance readback. No queue membership or credentials persisted. |
| B5 | applied | Fresh Go executable e88ff5201ed5fee2099d06497fa8549a316ef754c977b7448d345b26e979885d; fresh Vite sessions 53433/57457. Real WebGL dense output after SF-001 fix draws all 90,971 quads without logged errors. One/dense screenshots captured with fixed seed/time/camera; live fast fixture opens Fireworks Live with removed instructions absent. |

| C1 | applied | c1-go-rules.json compares exactly with the browser-imported catalogue: 150000/10000ms, 25 IDs, cooldown/duration/cost metadata, both capacity limits zero. |
| C2 | applied | c2-decoded.json: actual preparation, one-group and many-group frames all accepted by isShowState. Optional/null turns and positive per-shell cost metadata remain consistent while admission is disabled. |
| C3 | applied | pass1-c3.log: shared-clock drone parity and camera/controller integration pass. Renderer per-entry sum versus combined output is compared under B2/B5 at identical seeds/times. |
| C4 | applied | Inspected request/turn/session ownership, bounded 4096-request result cache, explicit transport-rate rejection and bank/design reservations. Actual accepted groups in B3 remain atomic, no delayed live launches. |
| C5 | applied | Traced maxCost/maxOpeningCost from embedded/shared JSON through all three server checks; zero intentionally bypasses cost admission only. Traced late join → prepare → snapshot → HUD, and recovery port through both credential cleanup paths. |
| D1 | applied | pass1-d1-d2 logs: late joins in both event halves, full turns, saved openings, two operators, cooldowns and large accepted groups pass. |
| D2 | applied | Wrong owner, stale session/turn, duplicate group, malformed snapshots/results and malformed recovery destinations are rejected by focused world/protocol/location tests. Invalid real session reveals SF-003 under E3. |
| D3 | applied | d3-boundaries.json: empty opening clears; groups 1/4 pass, 5 fails; banks -1/7 fail and 0/6 pass; joins -10s/-1ms prepare and 0/+1ms wait. Zero cost caps accept and positive 18/8 caps reject the same costs. |
| E1 | applied | Compared single-firework and shared-show renderer callers, standard/fast fixture recovery, preparing/live hints and disconnect/dispose paths. Same growing renderer serves both consumers; no restored removed text. |
| E2 | applied | Positive capacity checks intentionally remain unreachable under current zero settings; positive-cap probe proves configurable branches still work. Prep/live and open/closed recovery branches exercised. |
| E3 | applied | SF-003 confirmed by real invalid-token UI: module loaded but connection closed with no recovery link. Now status-driven entry remains actionable on failure/retry and hides on successful open. |
| E4 | applied | Authentication/Origin/session/turn ownership and request size/rate gates unchanged; recovery destination restricted to validated loopback port. No client toggle re-enables capacity or bypasses cooldowns. |
| E5 | applied | Shared catalogue remains the timing source; new showReviewLocation centralizes both cleanup paths and preserves only non-secret fixture metadata. No duplicated new budget or second renderer algorithm. |
| F1 | applied | Fresh uncached Go race suite passed world/server; result in pass1-f1-race.log. |
| F2 | applied | World validation and group mutation stay under one mutex; snapshot copies remain lock-protected. Socket writes serialized and latest pending snapshots coalesced; renderer growth replaces buffers before frame publication. |
| F3 | na | No reviewed show change has a database model or migration; room state is in memory, visibility preference is localStorage, recovery port is URL metadata. Unrelated avatar migrations excluded. |
| F4 | applied | pass1-f4.log exercises render growth/shrink/empty/dispose, sound lifecycle, shared drone disconnect/reconnect and recovery error/closed/open. Real reload preserves port 4177 and returns the picker. |

| G1 | applied | Five isolated controls compile and fail intended assertions without the fix, then pass restored: SF-001..003 and prior late-join/capacity changes. Narrow reverse patches, negative/restored logs and control-results.json retained under artifact directory. |
| G2 | applied | Explicit paired branches: 18/8 versus zero budgets, pre-boundary versus boundary joins, valid versus corrupt wire state, connected versus failed/retrying entry, one versus dense graphics. Valid paths remain usable. |
| H1 | applied | 72 focused frontend tests pass; TypeScript and production Vite gates recorded in pass1-h1 logs. Fresh Go race world/server suites pass. Unrelated avatar asset regeneration excluded; no in-scope lint command configured. |
| Z1 | applied | No new general technique beyond the protocol. Dense legal launch sequences, real-wire captures and status/refresh differentials fit existing instruments. |

Findings: SF-001, SF-002, SF-003 (fixed; controls verified)
Controls: all three new findings and prior late-join/capacity regressions have compiling assertion-failure controls and passing restored runs

## Additional techniques

None identified across either complete pass.

SF-001 — P1; B2; accepted launch → graphics batch. A legal 88-shell sequence (two groups on disjoint banks per 700ms; seed 42, sample 7.5s) needs 90,971 quads but renders only 66,940. Fixed-size light/smoke buffers silently discard remaining quads after sky admission is disabled. Fix: grow render buffers to preserve accepted geometry. Regression: fireworkRenderer.test.ts dense accepted-shell case. Control: SF-001-reverse.patch produces 66,940 versus 90,971 assertion failure; restored passes. Evidence: b2-dense-overlap.json.

SF-002 — P2; B5; refresh → local fixture recovery. A view entered through port 4177 loses its fixture when credentials are stripped; reload points the picker at 4176. Fix: retain only a validated non-secret reviewPort in the clean URL and use one resolver for both boot paths. Regression: showReviewLocation.test.ts compares first entry and reload for standard/fast fixtures, rejects external/malformed recovery destinations. Negative control: SF-002-reverse.patch restores bare-path cleanup; the expected 4177 picker becomes 4176 and the assertion fails. Restoring the fix passes, in both review passes.

SF-003 — P2; E3; rejected/dropped socket → preview recovery. Real invalid-token navigation produced “Connection: closed” plus empty controls and no recovery action, because module-load completion hid the entry card before connection success. Fix: connect the entry view to socket status, hide it only on open, show the player-picker action on error/closed and preserve it during retries. Regression: showReviewRecovery.test.ts; real invalid-link artifact pass1-rejected-session.txt. Negative control: SF-003-reverse.patch disables the error/closed recovery branch; the entry remains hidden and the visibility assertion fails. Restoring the fix passes, in both review passes.

## Pass 2

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Fresh source manifest and dirty-worktree inventory captured in pass2-start files. Reviewed new growing buffers, recovery resolver/status view and unchanged queue/capacity consumers; unrelated concurrent work excluded. |
| A2 | applied | Re-read Pass 1 findings and controls: three concrete defects fixed, five compiling removal/restoration pairs pass. Earlier fixed-size budget proof no longer used as a density guarantee. |

| B1 | applied | Fresh b1-commands.json reproduces fixed-ID prepare versus launch payloads; exact differential is action only. |
| B2 | applied | Fresh markup has removed lines absent and live hint hidden. Repeated dense geometry now equals the independent single-shell sum: 90,971/90,971 quads, with valid submesh bounds. |
| B3 | applied | Fresh actual socket capture accepts 88 scheduled shells and retains 84 at final sample, cost 226; preparation and one-group frames remain correct. pass2-b3.log and b3-wire.json. |
| B4 | applied | Fresh preference absent/visible versus written true/hidden survives new HUD instances in b4-storage.json. Only validated non-secret fixture port survives credential stripping/reload. |
| B5 | applied | Restarted Vite 52793/52840 and Go 53016/53032 from recorded build stamp. Fresh fixed-seed WebGL one/dense screenshots and pass2-gpu.json show 7,722 versus 90,971 quads without GPU errors. Live controls omit both instructions; refresh preserves 4177. |

| C1 | applied | Re-exported Go catalogue; fresh browser comparison agrees on all serialized constants, IDs, units, zero-cap settings and positive per-shell metadata. |
| C2 | applied | Re-decoded the newly received real socket frames: preparation, one-group and many-group states all accepted; c2-decoded.json. |
| C3 | applied | Fresh shared-show integration parity suite passes three tests; dense renderer independently summed versus batched counts still match under both NullEngine and real WebGL. |
| C4 | applied | Rechecked session/turn ownership, request deduplication, limiter refusal, short bank occupancy and callback subscription before socket connect. Recovery supports bounded transport backoff without dropping the visible retry route. |
| C5 | applied | Re-traced both zero-budget checks plus opening reservation check, immediate late preparation publication, recovery port cleanup→URL→reload→href, and socket status→entry visibility. No declared-only field or missing consumer. |

| D1 | applied | Fresh world/transport/HUD passing suites confirm large overlapping groups, late preparation in both halves, full turns and first-person handoffs. pass2-d1-d2 logs. |
| D2 | applied | Repeated wrong-owner, stale turn/session, malformed snapshot/result and recovery-host/port cases fail closed. Actual invalid-token page visibly offers the correct picker rather than empty controls. |
| D3 | applied | Fresh d3-boundaries.json reproduces 0/1/4/5 groups, -1/0/6/7 banks, -10s/-1ms/0/+1ms joins, zero versus positive capacity branches. All expectations unchanged. |
| E1 | applied | Rechecked both renderer consumers and both preview cleanup paths; dynamic reserve is shared, recovery resolver used in entry and scene startup, removed instructions absent. |
| E2 | applied | Intentional zero-budget bypass preserves cooldown/bank/ownership rejection; positive-cap controls, live/prep transitions and connected/disconnected recovery all remain reachable. |
| E3 | applied | Fresh rejected session and subsequent picker navigation captured in pass2-rejected-session.txt. Startup failure and transport failure keep recovery visible; successful open clears it. No lost command result or startup error found. |
| E4 | applied | Rechecked unchanged session/Origin/turn gates, four-shot and rate limits, loopback-only fixture, validated port and credential-free cleaned URL. |
| E5 | applied | One shared catalogue, one renderer algorithm, one recovery-port resolver and one status view; repeated comparisons find no drifting new constants or duplicate validators. |
| F1 | applied | Fresh uncached Go race run for world/server recorded in pass2-f1-race.log; completion checked before termination. |
| F2 | applied | Re-inspected world mutex, group publication, snapshot copying, per-connection writer and bounded pending delivery. No network drain occurs under the world lock; scene buffer replacement stays within one render call. |
| F3 | na | Reviewed feature has no database migrations: show state is ephemeral, preference is localStorage and fixture port is URL metadata. Unrelated avatar/database work excluded. |
| F4 | applied | Fresh lifecycle suite covers grown-buffer reset/disposal, sound cleanup, drone disconnect/reconnect and recovery retries. Actual reload and browser Back return to a usable player picker with port 4177 (pass2-history-return.txt). |

| G1 | applied | Repeated all five isolated removal/restoration controls: SF-001..003 and prior capacity/late-join changes. Each negative run compiled and failed its intended assertion (exit 1); each restored run passed (exit 0). Inspected negative logs and control-results.json. |
| G2 | applied | Repeated paired checks keep guards meaningful: positive/zero capacity, before/at turn boundary, valid/malformed payload, connected/rejected entry and single/dense graphics. Controls prove the regression assertions detect removal of their fixes. |
| H1 | applied | 72 frontend tests in 11 files pass; TypeScript and production Vite build exit 0. Fresh world/server Go race checks pass; git diff --check passes. pass2-h1 and pass2-f1 logs retained. All 22 scoped source hashes unchanged since pass start. No in-scope lint command configured. |
| Z1 | applied | No additional general technique discovered. Legal dense sequences, real wire artifacts, browser recovery and paired controls fit the existing protocol; no protocol amendment required. |

Findings: none
Controls: all five repeated negative controls compiled and failed the intended assertions; all five restored controls passed

## Completion and limits

Two full passes completed; the second found no new issues. Real WebGL checks verify retained geometry and visible recovery behavior, not a performance guarantee across all devices. Headless integration tests emit the known jsdom canvas-unavailable message; real WebGL was checked separately. Temporary fast/density fixtures are stopped after review; the standard playtest remains available at http://127.0.0.1:4176/review.
