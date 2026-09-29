# Complete avatar pair

<!-- Keep only current model state and checks. Replace outdated details on every update. -->

Two complete, editable characters are available in the local venue preview. Existing clothing, zipper, decoration and jacket-opacity discrepancies are retained at the user’s request to avoid further redesign work. They are not accepted as exact reference matches. Each has a 56-bone skeleton, idle/walk/run clips, facial and hair controls, and 14 animated jacket correctives. The female jacket has a pale pink thin-film coating, masked thin-sheet transmission, localized sleeve folds, and a folded hood. The ponytail has a compact silhouette with attached ribbon roots. The lime knit stays opaque and rough. The male hair uses 72 shared wave guides, placed caramel highlights and a feathered hairline. Both outfits include their footwear, jewelry, straps, painted details, ribbed trim, separate zipper tracks and connected sliders. Pockets are closed fronts without bags.

## Reference requirement

All new non-facial details must recreate the original reference exactly: placement, shape, color, patterns, garment construction, zippers and accessories. Do not substitute a similar design or add invented decoration. The face is the only likeness approximation, and should be as close as practical. When a detail cannot be resolved from the reference, leave it pending rather than inventing it. Existing discrepancies are frozen for now; this direction does not authorize reworking them.

## Current files

- `male-runtime.blend` / `female-runtime.blend`: editable native models matching the hero exports.
- `male-final-forms.blend` / `female-final-forms.blend`: finished geometry before expression authoring.
- `male-expressive.blend` / `female-expressive.blend`: facial and hair controls.
- `public/assets/avatars/complete-pair/` at the project root: six GLBs, covering both characters at three detail levels.
- `male-final-runtime-front.png`, `female-final-runtime-front.png`: lossless 1536 × 2048 full-body renders. Matching `male-final-runtime-face.png` and `female-final-runtime-face.png` show face detail. The interactive viewer places the original artwork beside the model. Other saved oblique, back, running and venue images are viewport captures.
- `current-state-validation.json`: current file hashes, detailed checks and measured results.

## Verification

Complete characters now crouch with the existing local camera and collision controls. The runtime bends their legs after sampling the authored idle or walk clip, keeping each ankle and foot orientation in place. Posture blends over 0.22 seconds and can reverse midway. Remote copies receive the same transient posture, adopt it when loaded at any detail level, and adjust their eye-height anchor and collision height without moving their feet. Posture changes at a fixed position do not create a walking animation or get lost to movement suppression. Respawn restores standing. The original 32 recorded Blender/GLB files remain unchanged.

`crouch-validation.json` records checks against all six production rigs at 240 sampled poses, including ankle position, foot orientation, grounded shoe soles, unchanged joint scales and transition behavior. Individual male/female oblique, rear and walking views were inspected. A live WebGPU sender and WebGL observer verified crouch, standing and respawn with empty warning/error logs. The final crouch regression batch passed **156 tests in 16 files**; TypeScript, the production build and both backend packages with the race detector also passed. These checks cover complete-character crouch; dance, remaining actions and broader continuous-motion acceptance remain pending.

Both the individual viewer and the local venue’s **Avatar** panel control the existing hair, top, jacket, bottoms, shoes and accessories independently. **Restore full outfit** restores their original visibility. Belt fittings and straps follow bottoms visibility; the ponytail tie follows hair visibility. These controls preserve the authored geometry, materials, rig and animation. In explicit character previews, selections save separately for each character in this browser and reload in both the individual viewer and venue, including attached-accessory visibility. **Restore full outfit** also updates that saved selection. The panel reports when browser storage is unavailable and keeps session controls working. Browser selections are specific to the site address (including port).

Existing complete looks now restore from session handoff data, runtime login responses, and the first authoritative world snapshot. The local body and six clothing flags finish loading before the client publishes its appearance. Login switches the body in place before reconnecting; logout returns to a generated guest. Obsolete loads cannot replace a newer session, failed loads retain the working body, and ordinary reconnects retain session edits. The Avatar panel rebinds to the current wardrobe and removes old subscriptions. Explicit local character-preview links retain their chosen design and browser wardrobe. Restored account/session looks do not overwrite browser preview selections. Alternate fitted outfit assets remain pending.

Authenticated wardrobe edits now save to the existing account profile API using the account credential returned by launch exchange or runtime login. Rapid edits coalesce and writes run in order; the panel reports saving, successful saving, retryable failures and expired credentials. Signing back into the same account preserves pending visible edits; switching accounts uses that account's own appearance. Guests remain session-only and explicit design previews keep browser storage. Credentials stay in memory. Initial restoration never triggers an automatic profile write. Database updates change only the requested profile field, preventing concurrent settings or venue saves from overwriting a newer outfit. See `account-profile-validation.json` for runtime tests, protected-route and isolated PostgreSQL checks, and browser save/fresh-launch evidence. Production account acceptance remains pending.

The restoration check passed **119 tests in nine files**, followed by a passing runtime integration test exercising actual login/logout UI callbacks, delayed restoration, reconnect ordering and wardrobe publication. A local Go review room restored the female in WebGPU and the male in WebGL without character-preview query parameters; both started with their jacket hidden. Enabling the female jacket appeared on the male client. Both browser warning/error logs were empty. These are local session fixtures and mocked authentication responses, not a live account/database acceptance test. See `saved-appearance-validation.json`, the `saved-appearance-*.png` views, and the retained logs.

Complete characters and their clothing visibility now travel through the live multiplayer loadout. Two local clients verified changes in both directions, including attached accessories and full-outfit restoration. Remote copies never read or write the viewer’s saved wardrobe. A versioned, closed extension identifies one of the two known characters and six visibility flags; unsupported data retains the existing avatar fallback. Character changes preserve the last working body while loading, discard stale completions, and throttle failed retries. The first authoritative world spawn now places the local player before movement is sent. Remote bodies, names and chat bubbles use the same eye-height origin, and complete-character account transitions retain the fitted model’s reference height. A client displaying the legacy fallback removes unrestored complete-character flags from its outgoing loadout, so other players see the same model; stored account data and unrelated loadout fields are retained.

Multiplayer copies share geometry, materials and source assets while retaining independent skeletons, morph influences, clothing and animation. The source cache is bounded to two characters at three detail levels. Hidden templates retain CPU morph data without keeping their own GPU morph textures. Copies build across animation frames, with a timer fallback for hidden tabs; stale queued requests are skipped before their rigs are built. WebGPU packed vertex attributes are converted once, and later copies retain those shared buffers. Distance changes preserve outfit state and animation phase; hysteresis avoids repeated switching at a boundary. Off-screen copies skip sampled pose updates and defer distance-only model replacements, while movement, collision and the elapsed animation clock continue. Returning to view resumes the current pose. First-view observers and pending model copies are released when a player leaves.

Eight actual local WebSocket peers verified this path. The medium view used two sources and **1,338,636** model triangles; the far view used **587,448**. Returning close restored full detail for the nearest players, with at most six source assets. Releasing hidden-template morph textures reduced the medium-view texture count from **1,465 to 1,439**. Turning away left three conservative body bounds in view: deferring the other upgrades reduced resident model triangles from **2,904,336 to 1,987,158**, and turning back restored all eight pose updates. These are resource and behavior checks, not an isolated frame-rate benchmark. See `multiplayer-distance-review.json` and the saved `multiplayer-*.jpg` views.

Eight live peers also exercised idle, walking and running through WebGPU. Close-detail testing exposed a cube-versus-2D refraction binding error while a replacement shader compiled. Transmissive WebGPU materials now wait for the matching shader; the fresh close moving-peer run reported no warnings or errors. A separate departure check removed all eight rendered peers and reduced texture count from **1,439 to 1,319**, retaining the two reusable sources. The pooled-joint test verifies that each skeleton links to and animates its own cloned joint nodes.

Remote gait speed is measured between each player’s changed positions. Full snapshots caused by someone else’s movement no longer reset that player to idle or shorten the velocity interval to the room’s combined event rate. A stationary body returns to idle when its interpolation reaches the target, and a teleport snaps without a spurious running pose.

Stationary clients stop sending duplicate movement only after the server confirms their position. Unconfirmed moves continue at the existing 100 ms throttle so server clamping or dropped events can catch up. Reconnect, respawn and disposal clear old queued positions; queued vectors are copied, and an overdue timer cannot replay a stale move. A live WebGPU client and passive WebSocket observer verified checkpoint catch-up, respawn and stable presence: after settling, the observer received only the one scheduled room snapshot per second. `multiplayer-idle-network.json` records the observed positions and counts.

The individual viewer renders at Retina pixel density (up to 2× per axis). At a measured 714 × 504 CSS pixels and device pixel ratio 2, its drawing buffer is 1428 × 1008. **High-resolution image** renders the selected view anew at 1536 × 2048 with four-sample antialiasing and saves a lossless PNG. Both characters’ full-body and face exports were visually checked; output dimensions, restored canvas size, animation resumption and absence of browser errors were verified. Saved current front and face previews are true PNG files. Higher-resolution rendering improves presentation clarity; it does not add new geometry or texture detail to the models.

All 17 native audit runs pass, covering garment/body contact, expressions, footwear, outfit attachments, groom, jacket and hood, layer clearance, pockets, zippers, crop fit, hair, coating, transmission, final forms and knit. Final shaping preserves topology, UVs and skin weights across all 104 meshes, including 2,100 ponytail root vertices. Jacket corrective deltas differ by at most 0.000015 mm from the preceding form. Crop neckline clearance exceeds 4.4 mm in 27 sampled poses. Seven expression/groom combinations pass per character; closed lids cover over 99% of sampled iris points.

All six GLBs validate and retain the checked knit and garment material data. The earlier multiplayer regression run passed **163 tests in 18 files**, covering complete-character loading, expressions, wardrobe storage, multiplayer replacement and cleanup, distance behavior, camera visibility, spawn placement, labels, editor controls and scene startup. Final loadout, joint-retargeting and motion-snapshot checks also pass, as do **27 socket tests** covering confirmed idle suppression, catch-up, timer ordering, reconnect and respawn. Those multiplayer checks covered **194 unique test cases**; the log record distinguishes the integrated run from focused follow-ups. The backend world and WebSocket server tests and the production build pass. All 32 recorded model files remain unchanged, and all six production GLBs match the public assets byte for byte. Current front, oblique, rear, running and expression views were inspected; both complete characters loaded in the local venue. `multiplayer-runtime-validation.json` records the checks and their exact test logs.

The crowd now reduces the transmission background to 512 pixels with one sample when all characters are distant, restoring the original 1024 pixels and four samples for close characters or the full-quality option. It preserves the authored garment optics. Shared targets honor the highest requested quality and restore their original settings when released.

At 1280 × 720, the final 32-character scene measured **8.0 FPS** with automatic transparency, compared with **9.0 FPS** using full-quality transparency at the same camera and detail distribution (24 medium, eight far). Automatic mode recorded 2,114 draw calls, 46.9 ms median CPU render time and 145.1 ms 95th-percentile frame time. These local measurements used battery power with Low Power Mode enabled, with substantial other application activity; the crowd scene has no character shadows. This final run does not demonstrate a performance improvement from automatic transparency. Dense crowds remain costly, and results should not be compared directly with earlier measurements on AC power.

## Scope and limits

The current designs have known reference discrepancies, including the female jacket’s incorrect transparency, and are not certified as exact recreations. Those discrepancies are intentionally left untouched under the latest user direction; new work follows the strict reference requirement above. The complete pair is available through the local review and venue preview routes; it has not replaced the default player avatar or been deployed. Transmission samples the opaque scene background and does not resolve stacked transparent garments as separate optical layers. Pose sampling does not certify arbitrary continuous motion, and native contact checks do not certify simplified distance surfaces. Material checks allow filtering near boundaries and subpixel UV islands.

## Build and inspect

From `omnirave-babylon`, with the existing Node dependencies and Blender 5.1:

```sh
python3 scripts/launch-body-proof/build_complete_pair.py
npm run build
npm run dev
```

Use `--blender /path/to/blender` to select Blender. `--expressions-only` reuses motion-fitted inputs and rebuilds refinement, expressions, exports and checks. Logs are under `build-logs/`. Open `complete-review.html` for individual models and the **Open in venue** link, or `crowd-review.html` for the crowd and transparency comparison. Venue previews are `/?avatarComplete=male` and `/?avatarComplete=female`.

The individual viewer's **Crouch** checkbox works with **Idle** or **Walk** and retains the selected pose when animation is paused. In the venue, move at least 2.5 metres from the initial spawn to leave spawn protection, then press **Ctrl**. **Settings → Crouch** selects **Hold** or **Toggle**. A second client should see the same posture; **Respawn** returns the character to standing and re-enables spawn protection.

### Reproduce live multiplayer checks

Keep `npm run dev` running in `omnirave-babylon`. In a second terminal, from `backend`, start the local review room:

```sh
go run ./cmd/omnirave-avatar-review -peers 8 -moving-peers
```

Open the printed `/review` address. It offers male and female links for WebGPU and WebGL; open one view per character to test wardrobe synchronization in both directions. The **saved outfit** links omit the character-preview query and carry a complete look with the jacket hidden, exercising first-snapshot restoration. The browser characters spawn separately, ahead of the peer rows. The fixture binds only to IPv4 loopback, uses a fresh signing secret and in-memory world each run, and has an empty playlist. It uses the production world scheduler. Ctrl+C ends the room. Reload the launch page if its five-minute links expire. Opening another view of the same character replaces that character's previous connection.

The runtime defaults to `http://127.0.0.1:4175`, matching `npm run dev`. Use `-runtime http://127.0.0.1:5197` if the dev server uses that port. `-port 5198` selects a fixed review-server port; omission chooses a free port.

To check account saving, start the runtime with `VITE_OMNIGAME_API_URL=http://127.0.0.1:5198/api/v1 npm run dev -- --port 5199`, and the review room with `go run ./cmd/omnirave-avatar-review -runtime http://127.0.0.1:5199 -port 5198 -peers 0`. The four **account** links use two local test profiles and real session exchange/profile handlers. Edit a wardrobe, wait for **Outfit saved to your account**, close that view, reload the launch page, and open a fresh account link. Its outfit should return. These profiles live only in memory and reset when the review command stops; they never access the production database.

For peer departure and resource cleanup:

```sh
go run ./cmd/omnirave-avatar-review -peers 8 -moving-peers -peers-lifetime 2m
```

For stationary traffic, position confirmation and respawn:

```sh
go run ./cmd/omnirave-avatar-review -peers 1 -observe
```

After the browser avatar settles, `firstPeerSnapshots` should be one per second from the scheduler. Movement, joins, wardrobe changes and respawn add snapshots; the same JSON lines report the server's browser-player positions. A large checkpoint move may need several clamped steps before reaching the local position. `-peers` accepts 0–32, and the moving mode assigns static, walking and running lanes. The command's tests exercise origin validation, browser identities, real socket loadouts, movement and departure:

```sh
go test -race ./cmd/omnirave-avatar-review
```
