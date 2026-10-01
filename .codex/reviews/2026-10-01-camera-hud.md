# Local camera, keyboard, settings and HUD review

Scope: current uncommitted Auto-Follow camera/controller, keyboard arrows, settings defaults/storage migration, production-scene and isolated show-review wiring, controls help, and top HUD corner curves. Earlier deployed fireworks/drone panel and venue changes are contextual consumers; no deployment audit, commits or external writes. Preserve unrelated changes.

Artifacts: `/var/folders/wj/9c684jjd3yg9_14kk61wr7vr0000gn/T/omnirave-camera-hud-review-ch_b3ft3`. Initial source manifest, status and diff captured. Fixed camera alpha=-pi/2, beta=1.1, radius=6; 30/60/144 FPS, deterministic keys. Renderer: local WebGL. Settings storage: isolated jsdom Storage. No database changes.

Prior evidence: read September 18 soundbooth ledger and September 21 follow-up/recheck. Known limitations: no music or shared show without world connection; device performance is outside scope.

## Pass 1

In progress; not a terminating pass.

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | initial-manifest.json, initial-status.txt, initial.diff; callers inventoried through createRuntime, main scene, show review, settings UI and storage, input map, movement math and CSS. |
| A2 | applied | Read protocol and all three prior soundbooth ledgers completely; prior prep controls have since been removed, earlier socket/audio checks are context only. |
| B1 | applied | b1-keyboard.json: assembled ArrowLeft sets only cameraLeft; KeyA sets only lateral movement. Fully assembled follow/free settings markup captured in b2-settings-markup.json. |
| B2 | applied | b2-settings-markup.json contains opposing aria-pressed states; b2-b5-camera.json records real loaded Babylon camera transforms for follow/free after identical +X travel. |
| B3 | na | Reviewed keyboard/camera/UI fields have no HTTP, socket or queue payload. Existing sendMove serializes position only and no transport module changed; settings serialization is covered under B4. |
| B4 | applied | b4-settings-storage.json records actual jsdom sessionStorage legacy v1 write, automatic v2 migration and readback, followed by explicit v2 free write/reload. Other preferences preserved. |
| B5 | applied | Real Babylon implementation comparison in b2-b5-camera.json: same +4.5m X movement, follow forward.x=0.891 versus free forward.x=0; pitch 1.1 and zoom 6 preserved. Fresh real WebGL HUD check follows in browser evidence; renderer process restarted and source stamp saved. |
| C1 | applied | Defaults agree across rig, settings normalizer and popup (follow); optional cameraLeft/cameraRight booleans agree in input map/helper; delta units seconds, keyboard rate pi/2 radians/sec; CSS top/bottom consume same per-theme radius. |
| C2 | applied | Runtime passes followMode/lookRevision to controller; optional camera fields tolerate hand-built inputs; real storage has v2 JSON shape and matching follow/free UI aria-pressed. |
| C3 | applied | Main scene and show review call shared updateKeyboardCamera before controller.step; both pass cameraRig into controller. Operator yaw inversion is encapsulated in rig.orbit. Inspecting manual-pointer parity and cleanup under E1/F4. |
| C4 | na | No worker/provider or cost-bearing service boundary added by the camera, keyboard, settings or CSS changes; deterministic main-thread DOM/Babylon callbacks only. |
| C5 | applied | Traced input fields from MovementInput to initialized InputMap state, binding, release/blur/text reset, both render loops and rig.orbit; lookRevision through mode/checkpoint/manual/operator changes to heading rebasing; camera preference UI through v2 store into applyCameraFollow; HUD token to top row and lower panel. |
| D1 | applied | Pass1 boundary probe and existing realistic camera/keyboard suites exercise default/free, manual override, arrows and camera-relative walking at 30/60/144 FPS; loaded transforms and markup captured. |
| D2 | applied | d2-f1-input-storage.json captures malformed JSON, null, array and invalid camera mode with level999; all normalize safely. Focused form/chat key handling and blur sequence prevent stale keyboard look; manual-pointer interruptions probed next. |
| D3 | applied | d3-camera-limits.json: radii0.1/0.75/0.751/6/140, pitch +/-100 clamp near both poles with finite transforms; opposed arrows cancel. Existing settings boundaries test levels0/1/10/11 and missing camera prefs. |
| E1 | applied | Compared production scene and show reviewer. Both introduced manualLookActive but neither handles blur/lostpointercapture. Reviewer also retains opposite drag sign from the production scene; investigate with live-consumer regressions before fixing. |
| E2 | applied | Follow/free, first-person/operator, opposed keys and manual-hold branches remain reachable; deterministic transform cases and rendered mode selection demonstrate intended alternatives. |
| E3 | applied | Storage get/JSON/set exceptions fall back without breaking live apply; DOM input callbacks are synchronous; reviewed scene startup failure cleanup remains intact. New manual-drag interruption is a lifecycle gap under F4. |
| E4 | applied | Form-field/chat suppression remains before preventDefault; keyboard camera executes outside stationary movement gate intentionally, including operator view; first-person bypass and teleport bounds remain explicit. Top row CSS excludes popup controls. |
| E5 | applied | Shared updateKeyboardCamera serves both loops. Per-theme radius remains single source. Two manual-pointer implementations drift in sign/cleanup; a shared implementation is considered if regression confirms drift. Camera mode string enums agree; no serialization mismatch. |
| F1 | applied | 100 deterministic keydown/chat-on/keyup/chat-off and ArrowRight/blur interleavings in reviewBoundary.test.ts leave no camera keys held. Main-thread code has no native race detector; event-order probe is closest relevant stress instrument. |
| F2 | applied | Each settings JSON snapshot writes through one synchronous setItem and exceptions are contained; input heldCodes and flags update in same event callback; look revision increments synchronously before view changes are consumed. No locks/transactions introduced. |
| F3 | applied | Executed relevant browser-storage migration ladder on isolated real jsdom Storage: missing/v1/v2/corrupt; actual v1 preserved, v2 records and explicit Free Camera readback in b4-settings-storage.json. No SQL migration or database schema change applies. |
| F4 | applied | CH-001 confirmed: real main-scene regression compiles, then both blur and lostpointercapture leave stale pointer ID, causing subsequent hover to rotate camera (alpha changes0.3 unexpectedly). CH-001-before.log retains assertions. Existing input reset does not release new manual-look state; fix both consumers now. |

CH-001 — P2; E1/F4; pointer lifecycle -> Auto-Follow. A lost drag end keeps manualLookActive and stale pointer ID. Fix: release on blur and lost capture, stop hover rotation, clean up listeners on disposal in both consumers. Regression: resumes Auto-Follow after a camera drag is interrupted; Regression passes in both consumers; removal of blur/lost-capture subscriptions compiles then fails four stale-hover assertions, restored passes. Patch: CH-001-reverse.patch; pass2/CH-001-negative.log and pass2/CH-001-restored.log.

CH-002 — P2; E1; production/review pointer parity. showControl review uses +dx yaw while production uses -dx, contrary to the owner's horizontal drag direction. Fix shared drag handling; Actual main/reviewer normal/operator regressions pass; reversing only shared horizontal sign compiles then fails six direction assertions, restored passes. Patch: CH-002-reverse.patch; pass2/CH-002-negative.log and pass2/CH-002-restored.log.
| G1 | applied | Narrow control runner in disposable isolated copy removes CH-001 cleanup, CH-002 yaw sign, Auto-Follow recentering, held backward heading stabilization, arrow-camera bindings and v1 migration independently. Each run requires tsc compile, assertion failure and restored pass. All six source-control logs/patches completed; original working tree never restored or mutated by controls. |
| G2 | applied | Focus-loss/lost-capture fixes permit ordinary left/right drag while rejecting stale hover; unrelated pointer IDs and middle button remain excluded. Settings invalid->default and explicit free->free pairs, form focus suppression, opposed camera keys and operator movement lock covered by actual consumers. |
| H1 | applied | TypeScript and local production bundle passed (pass1-types.log, pass1-build.log); 32 scene/reviewer lifecycle/wiring tests pass after fixes. Other focused gates completed with117 passing tests; no lint command configured. Known bundle-size warning and jsdom canvas notice retained. |
| Z1 | applied | No new general instrument discovered. Fixed-rate integration, real CSS/markup, actual storage and interruption order testing fit existing instruments. |

Findings: CH-001, CH-002 fixed; implementation and regression changes made during review require a fresh complete Pass 2
Controls: six source controls compiled and failed the intended assertions removed, passed restored; CSS control separately failed and passed in the real browser

## Additional techniques

None beyond protocol instruments.

Pass 1 completion: 149 relevant tests passed (117 core/integration plus 32 scene/reviewer); TypeScript and production bundle pass. Six isolated source controls compile and fail real assertions removed, pass restored (control-results.json); real HUD stylesheet control fails 999px vs16px removed and passes16px restored. CH-001/CH-002 patches and logs retained under artifact root.

## Pass 2

| ID | Verdict | Evidence / reason |
|---|---|---|
| A1 | applied | pass2-start-manifest.json/status capture all reviewed files including shared drag helper and real-consumer regressions. Consumers: main scene, show reviewer, input/controller, settings/UI/storage and top/bottom HUD surfaces. |
| A2 | applied | Re-read Pass 1 findings/results plus prior soundbooth limitations. CH-001 interrupted drags and CH-002 reviewer direction have compiling assertion-based controls; local preview intentionally lacks world music. |
| B1 | applied | Fresh pass2-boundaries.log and b1-keyboard.json reproduce full assembled ArrowLeft versus KeyA states; settings-markup follow/free records have exactly opposite aria-pressed values. Controlled outputs equal Pass 1 byte-decoded content. |
| B2 | applied | Loaded Babylon target/camera transforms remain follow/free differential with identical position/pitch/radius. Fresh WebGL pass2-luminous/midnight PNG+JSON show all top buttons and lower panel at14/16px respectively, popup controls unchanged. |
| B3 | na | No reviewed camera/keyboard/UI field crosses HTTP/socket/queue boundaries; unchanged sendMove carries positions, not these local input flags. Storage serialization observed under B4. |
| B4 | applied | Fresh actual jsdom Storage migration/write/readback matches Pass 1. Native browser UI set Free Camera then reloaded: pass2-native-settings-reload.txt shows Free Camera pressed, proving the actual store reads the choice back; switched back to Auto-Follow afterward. |
| B5 | applied | Fresh Vite PID/source hashes in pass2-build-stamp.json; served shared drag module has negative yaw and blur/lost-capture handlers. Real WebGL luminous/midnight comparisons match14/16px promise; actual Babylon follow/free transforms differ only orbit behind identical+X travel, pitch1.1/radius6 preserved. |
| C1 | applied | Rechecked rig/settings/popup default follow, v2 key/v1 migration, booleans and seconds/radians in both consumers; top/bottom14/16px theme radii agree. |
| C2 | applied | Rechecked optional camera flags, Pick cameraRig interface and monotonic lookRevision; input map resets every actual state key. Parsed stored objects and rendered pressed flags match normalized values. |
| C3 | applied | Re-executed main scene/reviewer consumer suites (pass2-scene-review.log). Shared helper preserves each sensitivity but matches horizontal direction; arrows share90deg/sec and work normal/operator without movement. Actual camera transforms observed through NullEngine, not mocked rig calls. |
| C4 | na | No reviewed worker/provider contract exists; changes remain synchronous keyboard/pointer/DOM/Babylon state on the client main thread. |
| C5 | applied | Re-traced both input fields, mode/revision, shared drag attachment and both cleanup callbacks. Native UI reload proves saved explicit Free Camera reaches runtime; CSS top rows and lower panels use one theme token. |
| D1 | applied | Fresh core and consumer gates exercise walking forward/backward/diagonal, sustained A/D and arrow turning at30/60/144FPS, manual drag, ordinary release, Free Camera and operator handoff. Local preview renders without startup errors. |
| D2 | applied | Fresh boundary malformed JSON/null/array/invalid camera/level999 results equal Pass 1; focused input tests exercise form and chat suppression. Interruption regressions exercise stale hover after blur/lost capture; disposed global listener ownership checked in both consumers. |
| D3 | applied | Fresh d3-camera-limits.json equals pinned Pass 1 for zoom0.1/0.75/0.751/6/140 and pole overshoot; opposite arrows cancel. Repeated settings level0/11 clamp and missing/corrupt preference branches in core gate. |
| E1 | applied | Recompared both camera consumers: both share drag helper, held-arrow helper and lookRevision controller wiring. Both release new drag ownership during scene/pagehide disposal; no old pointer implementation remains. |
| E2 | applied | Rechecked free/follow, operator/ordinary, first-person/third-person, idle/moving, manual/automatic and opposing-arrow alternatives. Observed native Free Camera reload and Auto-Follow selection; pinned tests reach each intended branch. |
| E3 | applied | Storage exceptions remain contained; interrupted gestures now release synchronously before pointer capture release can emit another event. Scene/reviewer cleanup removes global listeners; browser error log is empty after fresh reload. |
| E4 | applied | Rechecked field/chat gates and stationary movement gate with keyboard camera outside it intentionally; helper only accepts left/right pointer buttons, filters pointer identity, resets on blur/capture loss. CSS scope remains direct top-row buttons and uses actual theme inheritance. |
| E5 | applied | Shared drag and keyboard implementations eliminate sign/cleanup drift. Existing sensitivity differences retained as authored settings. Camera strings/storage/theme tokens agree across declarations and consumers; no divergent transformation remains. |
| F1 | applied | Repeated 100 event-order stress loops in isolated reviewBoundary.test.ts (chat suppression and blur between held/released arrows); state remains clear. Drag focus/capture lifecycle regressions separately probe ownership cancellation. No multithreaded client memory boundary exists. |
| F2 | applied | Rechecked synchronous complete-state settings setItem and heldCodes/flag publication; lookRevision updates before consumption. release clears pointer identity before invoking capture release, preventing reentrant lost-capture callbacks. No new worker/SQL atomic boundary. |
| F3 | applied | Re-ran browser-storage migration ladder on isolated jsdom Storage: v1 -> v2 follow with other prefs, explicit v2 free -> reload, corrupt/missing -> defaults. Legacy key is retained unchanged (no destructive migration), allowing older code to read its previous preference. No database/SQL migration exists for this reviewed state. |
| F4 | applied | Fresh pass2-scene-review.log validates normal/operator drag and arrows; blur/lostcapture release stale hover and resume follow; scene dispose/pagehide remove global and canvas listeners. Core tests validate key blur/chat reset, free/follow toggles, checkpoints, first-person and operator restore. |
| G1 | applied | Fresh eight isolated source controls all compile (tsc), fail intended assertions removed, pass restored; pass2/control-results.json and reverse patches/negative/restored logs personally inspected. Covers both review fixes plus recentering, backward heading, sustained lateral turning, arrows, defaults and migration. Repeated real CSS control fails999px vs16px and passes16px restored; temporary server restarted for each stylesheet state. |
| G2 | applied | Negative/restored pairs prove interruptions cannot leave stale hover, drag sign consistent, sustained A/D circles and backward straight travel differ correctly, arrows affect camera only, migration/defaults reach follow while explicit v2 free remains valid. Paired form/chat gates and normal/operator checks leave passing paths reachable. |
| H1 | applied | 149 relevant tests in10 files pass (117 core/integration+32 scene/reviewer); four disposable artifact probes also pass. Fresh tsc noEmit and production Vite bundle exit0; git diff --check passes. No project lint command configured. Existing bundle-size warning and jsdom canvas notice retained; actual WebGL errors empty. Production build uses current sources and skips unrelated avatar asset regeneration/public-file copying only. |
| Z1 | applied | No additional general technique identified. Repeated controlled input artifacts, native UI reload, real CSS comparison, event-order stress and safe assertion controls fit existing instruments. All18 scoped source hashes equal pass2-start-manifest.json at completion. |

Findings: none
Controls: eight source removal/restoration pairs each compile and fail intended assertions removed, pass restored; ninth actual browser/CSS control fails999px vs16px removed, passes16px restored

Completion: two complete passes; Pass2 made no reviewed implementation, regression or product-document changes and found no new issue. Artifacts and controls personally inspected; final source hashes unchanged. Ledger validator result recorded below after execution.

Limits: verified local WebGL correctness and deterministic Babylon integration, not all-device performance or unchanged production world/music transport. No deployment, push or commit. The main local server remains at127.0.0.1:4175 for user testing; temporary HUD fixture/probe resources are stopped/removed after capture.

Ledger validation: validate_ledger.py accepted the complete clean final pass (exit0).
