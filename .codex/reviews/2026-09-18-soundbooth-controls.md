# Soundbooth controls evidence review

Scope: the 25-effect fireworks library and reviewer, multiplayer fireworks/drone controls, Go world scheduling and websocket transport, HUD, audio/render playback, stationary camera/controller, booth geometry, and local playtest fixture. Unrelated avatar, profile persistence and performance work is excluded.

Prior evidence: no existing soundbooth ledger. Read the 2026-09-04 skill-review ledger (different scope), fireworks-review.md, show-control-review.md, and the accepted requirements in show-control-mini-games.md before source review. Known limitations: procedural sound/smoke, manual art tuning, local fixture versus production hourly timing.

Artifacts: `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/soundbooth-evidence-20260918-by8lr2bw`. Initial source SHA-256 manifest: `initial-manifest.json`.

Controlled inputs: epoch 2026-09-17T20:00:00Z; player IDs a, b, d; seed 42 (and 104 for variation checks); valid owner versus spectator; empty versus prepared opening; one versus four shells; initial versus reloaded queue visibility; active versus disconnected client. Differential runs pin clock and seed and vary one input.

Process/build stamps: initial local servers 65555 (Vite) and 65808 (Go fixture) were replaced before Pass 1 live evidence. Per-pass build stamps appear below.

## Pass 1

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Captured initial source manifest and dirty-worktree inventory; consumers include full venue and isolated review, current-player and spectator sockets, renderer/audio, Go scheduler and movement lock, HUD preference storage, Vite outputs. |
| A2 | applied | Read the prior skill ledger and both implementation review guides before source inspection; accepted design identifies queue/turn/reservation/clock requirements and rendering limits. |

| B1 | applied | Printed two fully serialized HUD→worldSocket commands: identical design F01/bank 3/turn-a, prepare versus launch (`b1-commands.json`). |
| B2 | applied | Inspected two actual HUD markups and loaded booth world matrices/materials (`b2-hud.json`, `b2-scene.json`); one shell emits 494 quads, two emit 988. |
| B3 | applied | Fresh real Gorilla WebSocket test captures preparation frame, spectator-received launch/cooldown frame, and explicit non-owner rejection (`b3-peer-frames.json`). Fixed UTC clock and player IDs; runtime boot UUID is captured but excluded from semantic comparison. |
| B4 | applied | Observed queue visibility localStorage write and a fresh HUD instance reading it back; shown/default versus hidden/reloaded markup captured in B2/B4 artifacts. Queue membership remains server memory only. |
| B5 | applied | Restarted Vite and built/started fresh Go executable SHA256 83178df41b372419f634269fed60d49ec9efefd1673be593a0f51ad7dfc0f76c. Real WebGL screenshots `b5-ruby.png`/`b5-sapphire.png` hold seed 42, t=4, burst camera fixed: point sphere versus blue trailing sphere. Real renderer sweep at maximum cost stays below batch capacity (largest 40,788/67,200 quads); 12,500 seeded studies fit server lifetimes. |

| C1 | applied | Compared JSON catalogue with frontend imports, Go milliseconds/cost limits, 25 visual IDs and eight drone selectors. Server bank bounds are currently duplicated as 0–6; seven supplied banks match. |
| C2 | applied | Captured Go→browser state shape including nullable opening/active/preparing, numeric bank keys, unsigned seed and shared timestamps; response request IDs match sent commands. Deep malformed-state probes continue under D2. |
| C3 | applied | Renderer single-entry/multi-entry uses identical analytic sampler; seed replay and two-client drone history comparisons are exercised by showIntegration tests, with artifact comparisons queued for H1. |
| C4 | applied | Real socket rate-limit probe exposed SC-001: request over burst budget receives no result (`rate-before.log` assertion timeout). Added explicit refusal for bounded show request IDs; group retry already preserves selection. Ownership/idempotency remain world-mutex guarded. |

| C5 | applied | Traced ShowPanel/Revision into snapshots, worldSocket, camera lock/restoration; shared launch positions enter both audio and geometry; drone state enters analytic rig. Found SC-002 acknowledgement/snapshot ordering and SC-003 gesture-unmute through concrete HUD probes. Both fixed; initial assertion failures retained in `hud-before.log`. |
| D1 | applied | Real owner preparation starts at fixed boundary and peers receive identical launch; current HUD tests cover group retry, phase change and repeat selection. |
| D2 | applied | SC-004: partial/corrupt states passed the shallow decoder; nine malformed branch inputs and a malformed result reached consumers. Added nested type/value checks and required textual error messages; `protocol-before.log` contains assertion failures. Cross-owner wire command is explicitly refused. |

| D3 | applied | Materialized queue lengths 1/100/101, groups 0/1/4/5, banks -1/6/7, duplicates and opening-cost overflow; inspected exact results in `d3-limits.json`. |
| E1 | applied | Compared world/full-venue/review cleanup and shared-vs-single audio. Runtime cleared its snapshot on disconnect but left the drone rig holding a frozen clock (SC-005); isolated actual-rig regression failed wave-versus-cube, now fixed by releasing shared control on disconnect/disposal. |
| E2 | applied | Reviewed human/fallback source exclusion, prep/live and active/queued drone branches. D1/D3 and preparation/group HUD tests reach both success/refusal and boundary branches. |
| E3 | applied | Traced JSON parse, world rejection, rate limit, write failure/disconnect, async sound unlock, and HUD toast/draft rollback; SC-001/002 close confirmed lost-result paths. |
| E4 | applied | Checked authenticated session identity, request/turn ownership, loopback-only fixture, Origin and input-size/rate gates, no-world debug-only previews and browser audio gesture gates. |
| E5 | applied | Shared catalogue owns 25 effect costs/deadlines and eight clip durations. Seven-bank numeric bounds and 2.5s drone blend constants match across consumers; no current mismatch. Old firework/audio callers are absent. |

| F1 | applied | Go race detector passed world/server/review-command packages (`pass1-race.log`); snapshot delivery and concurrent world/session tests included. |
| F2 | applied | World mutex owns validation, reservations, complete group publication, IDs and result cache; snapshots copy maps under that lock. Per-socket writer lock and bounded latest-snapshot queue prevent interleaved frames. No database transaction is introduced. |
| F3 | na | The reviewed show system has no database models or migrations: queues/turns are deliberately in-memory, HUD visibility uses localStorage. Unrelated avatar migration files are outside this scope. |
| F4 | applied | Actual drone rig disconnect/reconnect/dispose regression passes. Existing suites exercise stale sessions, vacated preparation, leave/fallback, repeat boundary, camera restoration, backward seek, renderer teardown and double audio disposal. |
| G1 | applied | All eight narrow removal/restoration pairs compile, fail assertions without their fix and pass restored. Retained SC-001..005 reverse patches and negative/restored logs; backend-controls.json and frontend-controls.json index outcomes. |
| G2 | applied | Corrupt→valid socket recovery, muted unlock→explicit unmute, rejection→accepted group/preparation, closed→reconnected rig and accepted versus rate-rejected real socket commands all exercise guard entry and valid exit. |
| H1 | applied | 70 focused frontend tests, TypeScript noEmit, Vite production build (7.06s), Go race suites and git diff --check pass. Build runs the relevant TypeScript/Vite gates directly; unrelated avatar asset regeneration is excluded. |
| Z1 | applied | Fixed-seed lifetime sweeps, real-wire capture and assertion-based controls are covered by existing instruments. No additional general technique or protocol change identified. |

Findings: SC-001, SC-002, SC-003, SC-004, SC-005 (fixed); verification documentation updated
Controls: all five findings have compiling assertion failures under narrow removals and passing restored regressions

SC-001 — P1; C4; socket→HUD acknowledgement boundary. The inbound limiter silently dropped show commands, trapping a pending grouped launch. Fix: emit a bounded rejection result. Regression: TestWSHandlerShowControlRateLimitAcknowledgesRejection. Negative control: SC-001-negative.log fails the timeout assertion; SC-001-restored.log passes. Patch: `SC-001-reverse.patch`; initial isolated reproduction failed via require.NoError after a 400ms read timeout while compiling successfully.

SC-002 — P2; C5; preparation acknowledgement→HUD. Successful selection followed by rejection before the snapshot erased an accepted opening visually. Fix: track accepted opening from correlated acknowledgements and roll back only the latest rejected draft. Regression: preserves an acknowledged opening when a later rejection arrives before its snapshot. Negative control: `SC-002-negative.log` fails empty-versus-accepted-selection assertion; restored passes. Patch: `SC-002-reverse.patch`.

SC-003 — P2; C5; sound preference→gesture. Clicking a pad re-enabled explicitly muted audio; review camera gestures did too. Fix: separate gesture unlock from explicit mute/unmute and route all automatic unlocks through it. Regressions: HUD explicitly muted selection and shared audio repeated gesture unlock. Negative controls: SC-003-hud and SC-003-audio logs fail true-versus-false assertions and pass restored. Patches: `SC-003-hud-reverse.patch`, `SC-003-audio-reverse.patch`.

SC-004 — P2; D2; received socket→rendered state. Partial turns, null queue/source items, invalid bank/design/time/cooldown/launch and nontext error values were accepted. Fix: validate nested state and result message at decoding. Regression: showProtocol.test.ts (10 cases). Negative controls: SC-004-state (nine assertions) and SC-004-result (one assertion) fail only without their guard and pass restored. Patches: `SC-004-state-reverse.patch`, `SC-004-result-reverse.patch`.

SC-005 — P2; E1/F4; runtime→drone lifecycle. Disconnect/disposal retained the last shared clock and froze the swarm. Fix: release shared drone control at both cleanup sites. Regression: runtimeLifecycle.test.ts uses the actual drone rig and reconnect/dispose sequence. Negative controls: SC-005-disconnect and SC-005-dispose each fail wave-versus-cube assertions and pass restored. Patches: `SC-005-disconnect-reverse.patch`, `SC-005-dispose-reverse.patch`; `lifecycle-before.log` records the compiling assertion failure.

## Pass 2

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Inventoried current source/callers and captured pass2-start-manifest.json plus dirty worktree. Scope unchanged; unrelated avatar/profile/performance changes remain excluded. |
| A2 | applied | Read Pass 1 ledger and revised playtest guide before renewed boundary checks. Five fixes each have controlled failing/passing evidence; art/device tuning remains a known limitation. |
| B1 | applied | Re-ran actual HUD→socket assembly: b1-commands.json has prepare versus launch with identical fixed ID/design/bank/turn fields. |
| B2 | applied | Re-read fresh preparation/live HUD markup and loaded canopy matrices/materials; single/two-shell batches remain 494/988. Browser confirms distinct operating panels. |
| B3 | applied | Fresh Gorilla socket run: b3-peer-frames.json records empty preparing launches versus peer-received F01 launch at the exact boundary, plus non-owner rejection. |
| B4 | applied | Fresh localStorage write/readback remains true/hidden in both initial and newly constructed HUD instances; captured b4-preference.json. No show data is persisted to a database. |
| B5 | applied | Fresh Vite session 7348 and Go session 80096; binary SHA256 ee847e221cad760b655ae8bd456b8cd304badc464f9aa1c372f0dfb9bf17187c. Fixed seed/time/camera Ruby/Sapphire screenshots compared directly; correct point/trail difference, no graphics errors. Two live players operate independently, saved opening transitions to live, muted pad remains muted and Wave repeat gets on-icon countdown/queued marker. Fresh batch peak 40,788/67,200 and no lifetime overruns in 12,500 studies. |
| C1 | applied | Recompared shared JSON timings (150000/10000 ms), costs, 25 design IDs, eight drone IDs and seven positions with Go/HUD/renderer/audio. Numeric bank bounds still match 0–6. |
| C2 | applied | Re-read full captured server frames against deep decoder: null turn/opening handling, millisecond integers, uint32 seed, numeric-string banks and text results agree. |
| C3 | applied | Re-ran parity cases at fixed drone state/time: different frame/audio histories yield identical instance matrices. Single/multi firework batches share sampling and teardown (`pass2-parity.log`, four passing tests). |
| C4 | applied | Re-traced world session/turn ownership, 4096-entry deduplication, full-group cost/reservation check before mutation, bounded rate-limit refusal and write deadline. Refusal leaves drafts retryable. |
| C5 | applied | Re-traced ShowPanel/ShowRevision through world copies, frames, decoder and runtime camera/position restoration; banks feed both audio and renderer; all automatic unlock callers now use unlock(). |
| D1 | applied | Fresh world/transport and HUD passing cases plus real two-player controls succeed (`pass2-hostile-backend.log`, `pass2-hostile-frontend.log`). |
| D2 | applied | Nine corrupt snapshots and malformed result are rejected, then valid updates accepted; wrong-owner/stale-session/expired-turn and duplicate request cases pass. All 17 targeted HUD/protocol tests pass. |
| D3 | applied | Re-ran disposable limits probe and inspected d3-limits.json: queue 100 accepted/101 refused, groups 0/1/4 accepted/5 refused, bank -1/7 refused/6 accepted, duplicate and opening-cost overflow refused. |
| E1 | applied | Recompared review/full-venue consumers, gesture sound callers and disconnect/dispose cleanup. Both runtime cleanup sites release drone control; old placeholders have no source callers. |
| E2 | applied | Re-examined prep/live, automatic/operator, pending/accepted/rejected selections and active/queued drone branches. Observed distinct live branches and passing rejection/return cases; no unintended dead branch found. |
| E3 | applied | Followed limiter, read/write failure, decode rejection, correlated result rollback and async audio activation. Errors reach toast or closed-state cleanup; corrupt packets do not poison later valid state. |
| E4 | applied | Rechecked loopback fixture, authentication/Origin limits, session and turn ownership, stationary movement/respawn gates and preview exclusion while attached to a shared socket. |
| E5 | applied | Catalogue remains the timing/cost source. Duplicated bank bounds and transition duration agree across current consumers. No live reference to removed placeholder modules or SALVO label. |
| F1 | applied | Fresh uncached Go race run passes world and server, including blocked-peer isolation and concurrent session tests; review command builds (`pass2-race.log`). |
| F2 | applied | Inspected world read/write lock ownership, session-checked removals and copies, whole-group publication, result-cache update, per-socket writer and latest-pending queue; no lock is held while draining network writes. |
| F3 | na | No show schema or database migration exists; this feature intentionally uses in-memory room state and a browser visibility preference. Avatar database migrations are unrelated. |
| F4 | applied | Fresh actual-rig disconnect/reconnect/dispose and audio disposal tests pass (`pass2-lifecycle.log`, four tests). World tests cover vacated preparation, stale connection cleanup, leave/fallback and queued-repeat boundaries. Camera restore and renderer seek/teardown pass under C3. |
| G1 | applied | Repeated all eight narrow controls in the disposable copy. Every removed fix compiled and failed its intended assertion; every restored regression passed. Personally inspected expected/actual mismatch and restored-test output in SC-001..005 logs. Reverse patches retained; Pass 1 copies are archived under pass1/. |
| G2 | applied | Checked paired allowed/refused paths in protocol/HUD/audio/runtime regressions and real-wire owner/rate-limit probes. Guards reject intended inputs while valid snapshots, explicit unmute, accepted launches and reconnect remain reachable. |
| H1 | applied | 127 relevant frontend tests in 14 files pass, including existing movement/input/camera tests. TypeScript noEmit, Vite production build (12.20s), uncached Go race suites and git diff --check pass. TypeScript/Vite run directly to avoid unrelated avatar asset regeneration. Source hashes match pass2-start-manifest.json at completion. |
| Z1 | applied | No new technique beyond protocol instruments. Repeated seed/lifetime sweep, real transport capture, concrete UI differentials and narrow assertion controls; no protocol amendment required. |

Findings: none
Controls: all eight removal/restoration pairs from five Pass 1 findings repeated successfully; no additional controls required

Completion: two full passes; the second required no implementation, test or guide changes. Scratch probe tests were removed after artifacts were captured. Final source manifest: pass2-end-manifest.json. Temporary reverse patches and evidence remain in the artifact directory; no restoration operation touched the user’s working tree.

Manual review: local services restarted for handoff (Vite session 98207, Go session 84554, same reviewed binary SHA256 ee847e221cad760b655ae8bd456b8cd304badc464f9aa1c372f0dfb9bf17187c), hub http://127.0.0.1:4176/review. Final live comparison covered WebGL; the prior implementation’s WebGPU check is historical evidence, not a new cross-device performance claim. Procedural smoke/sound, icon/panel art tuning and device-specific performance remain manual-review areas.
