# Soundbooth fresh evidence review

Scope: re-audit the soundbooth follow-up fixes (growing fireworks buffers and preview refresh/connection recovery), including queue/preparation, disabled capacity, shared socket, HUD and renderer consumers. Unrelated avatar, account and venue-performance changes remain outside scope.

Prior evidence: read both September 18 and September 21 completed soundbooth ledgers and the full protocol before implementation inspection. No changes to the 22 files in the last final manifest since that review. Historical device-performance limits remain.

Artifacts: `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/soundbooth-recheck-20260921-kmtnxza1`. Source inventory: initial-manifest.json and initial-status.txt.

Controlled inputs: fixed 2026-09-17T20:00:00Z epoch, seed 42, fixed request/player IDs, prepare/live, one/dense shells, zero/positive limits, success/failure/reload.

Process/build stamps: fresh Go executable e88ff5201ed5fee2099d06497fa8549a316ef754c977b7448d345b26e979885d, fixture processes 56053/56066 and fresh Vite processes 56044/56104 (build-stamp.json).

## Pass 1

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | Compared 22 scoped hashes with the previous completed manifest: no changes. Inventoried both renderer consumers, both preview cleanup sites, status view, world/socket/HUD and persisted visibility preference. Created a fresh isolated source copy from the current workspace; unrelated files remain untouched. |
| A2 | applied | Read both completed soundbooth ledgers and their limitations before source inspection. Recheck focuses on dense buffers, refresh/recovery and the existing late-entry/disabled-capacity contracts. |

| B1 | applied | Fresh b1-commands.json contains actual HUD-to-socket prepare/live commands; fixed request, design, bank and turn remain identical, only action changes. |
| B2 | applied | Fresh prepared/live markup contains the appropriate phase and only preparation guidance; removed instructional lines absent. Independent shell counts equal combined batches: 43,502 catalogue sample and 90,971 dense quads. Loaded meshes/bounds captured in b2-density.json. |
| B3 | applied | Fresh real Gorilla socket capture (b3-wire.json): preparation has zero launches, first group four; all 88 requested shells accepted, 84 still alive at final sample and cost 226. The same turn ID and exact boundary timestamp reach the peer. |
| B4 | applied | Fresh actual storage write/readback: missing preference yields visible queues; stored true yields hidden queues in a new HUD instance (b4-storage.json). Queue membership and credentials remain unpersisted. |

| B5 | applied | Fresh real WebGL one/dense screenshots show 7,722 versus 90,971 quads, matching independent sums at seed 42 and time 7.5. Real fast playtest moves from queue to Fireworks Live; removed instructions absent. Refresh and rejected-session pages both visibly offer the correct 4177 picker. b5-*.png/txt retained. |

| C1 | applied | Fresh Go export equals the actual frontend-imported catalogue for every serialized key (c1-export.log, c1-c2.log). Timings, IDs, cooldown units and zero capacities agree. |
| C2 | applied | Fresh real peer frames for preparing, first group and dense groups all pass the browser decoder (c2-decoded.json). Null turn/opening, numeric bank keys, timestamps, unsigned seeds and positive per-shell costs match consumers. |
| C3 | applied | Shared integration suite passes all three cases: fixed-clock drone positions agree despite different local histories; movement/camera handoff restores; lifetimes/roof view remain valid. Dense sums agree with shared batches under B2/B5. |
| C4 | applied | Re-read world ownership/session/turn guards, bounded request-result cache, transport limiter acknowledgement, retry backoff and whole-group reservations. Commands are never replayed blindly on reconnect; failed groups retain a retryable UI selection. |
| C5 | applied | Traced capacity settings through all three conditional checks; join advances preparation before snapshot; launch bank/seed reaches renderer and audio. reviewPort passes through both URL-cleanup sites; socket status subscription precedes connect and drives recovery visibility. |

| D1 | applied | Fresh owner, two-panel, preparation, exact handoff, dense launch and HUD suites pass (d1-d2 logs). Late joins at 10s, 9.5s, 9s, 1s and 1ms before both halves receive full turns. |
| D2 | applied | Fresh malformed decoder/result, wrong owner, stale session/turn, duplicate request, invalid recovery host/port and explicit limiter-refusal cases pass. Rejected real session retains a visible recovery link. |
| D3 | applied | d3-boundaries.json: groups 0/1/4 allowed for preparation and 5 rejected; bank -1/7 rejected, 0/6 allowed; queue 1/100 stored, 101 refused with 100 retained. Joins -10s/-1ms prepare, boundary/+1ms queue. Zero budgets allow the same cost that positive 18/8 budgets reject. |
| E1 | applied | Searched renderer and status/URL helper callers; full venue and both reviewers share the growing renderer. Both disconnect/disposal paths release drone control. No old placeholder imports or removed firework instructions remain in source. |
| E2 | applied | Zero budgets intentionally bypass cost checks; positive-budget probes demonstrate guards remain reachable. Queue/preparing/live, single/multiple, accepted/refused and recovery open/error/closed branches exercised. |
| E3 | applied | Traced dynamic-import catch, socket error/close/retry, explicit rate refusal, correlated HUD rollback and audio activation failures. Recovery remains visible throughout retries; disconnected runtime releases control and stops audio. |
| E4 | applied | Checked validated loopback recovery destination, local-only fixture, auth/Origin/session/turn ownership and input/rate limits. Renderer growth does not change command gates or cooldowns; preview cannot override a socket-owned room. |
| E5 | applied | Shared catalogue remains timing/design source; one status view, URL resolver and render algorithm serve their callers. Seven-bank bounds and 2.5s drone transition duplicates still agree. No drift found. |

| F1 | applied | Fresh uncached race detector passes world/server suites (f1-race.log), including concurrent session and snapshot-delivery cases. |
| F2 | applied | Inspected world locks and snapshot copying, whole-group validation/publication, serialized socket writes and latest-pending snapshot delivery. No network drain under world lock; stale-session cleanup is ownership-checked. Render growth replaces buffers within one render call. |
| F3 | na | No reviewed show model or schema uses a database migration. State lives in memory, queue visibility in localStorage, recovery port in the URL. Unrelated avatar migrations are outside scope. |
| F4 | applied | Ten fresh lifecycle/location/recovery/audio/render tests pass (f4.log): growth→small→empty→dispose, backward seek, disconnect/reconnect, retry, audio teardown. Real recovery-link navigation and Back return to a usable 4177 picker (f4-history.txt). |

| G1 | applied | Repeated five isolated removal/restoration pairs for prior SF-001..003, capacity and late preparation. Every negative run compiled and failed the intended assertion; every restored run passed. Reviewed exact mismatch and logs; retained reverse patches and control-results.json in this review's artifact directory. No control touched the user working tree. |
| G2 | applied | Controls reach dense overflow (66,940 vs 90,971), lost fixture port (4176 vs 4177), hidden failed-connection UI, rejected large opening and missed late preparation. Restored valid cases pass; positive/zero budgets and before/at-boundary probes retain both intentional branches. |

| H1 | applied | 72 frontend tests across 11 files, TypeScript noEmit and production Vite build all pass (h1 logs). Go race checks pass under F1; git diff --check passes. No in-scope lint command configured. Direct TypeScript/Vite gates avoid unrelated avatar regeneration. All 22 scoped hashes match initial and previous-final state. |
| Z1 | applied | No additional general technique identified. Fresh boundary artifacts, fixed-clock cases, real WebGL comparisons and isolated assertion controls use the existing protocol. |

Findings: none
Controls: five prior-fix removal/restoration pairs repeated successfully; no new fix or regression required

## Additional techniques

None identified.

## Completion and limits

One complete fresh pass found no new issue and required no implementation, test or guide changes. The five temporary probe sources were removed from the disposable copy after capture. Control patches and observed artifacts remain in the private temporary artifact directory. No restoration operation touched the user's working tree.

Real graphics checks covered WebGL correctness, not all-device performance or a new WebGPU comparison. Headless integration logs retain the known jsdom canvas-unavailable notice; real renderer output was checked separately. Standard services remain at ports 4175/4176, with the player picker open at http://127.0.0.1:4176/review. Temporary fixtures 4177/4178 have been stopped.
