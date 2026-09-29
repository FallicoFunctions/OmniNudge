# Soundbooth controls: first playable version

The venue now uses the 25 reviewed firework designs and two independently operated panels in the existing soundbooth. Creative controls only; there is no scoring. Sky capacity is disabled, including opening-group cost limits and sky-space reservations. Per-design cooldowns, brief bank turnaround and four-shot groups still apply.

## Start a local playtest

Run these in separate terminals from the project root:

```sh
cd omnirave-babylon
npm run dev -- --strictPort
```

```sh
cd backend
go run ./cmd/omnirave-show-review -port 4176
```

Open **http://127.0.0.1:4176/review**. The page provides three player identities, each with a lightweight booth review and full-venue WebGPU/WebGL links. Use one view per identity. Opening the same identity twice reconnects that player and drops their old queue place. Reload the hub for fresh links if its five-minute links expire.

Opening the lightweight review directly, or refreshing it after entering, shows an **Enter the soundbooth** card with a **Choose a player** link. Review credentials stay in memory and are removed from the address bar; refresh therefore requires a fresh player link. A non-secret `reviewPort` preserves the correct local fixture after refresh. Loading, startup and connection failures leave a visible route back to that playtest; successful reconnection dismisses it. Returning through browser history reloads the entry screen because leaving the view disposes its scene and connection.

The lightweight review uses the actual booth, firework renderer, drone rig, HUD, camera/controller, websocket client and Go world scheduler. Other players are simple position markers there; use the full venue to review avatar fit and final venue lighting. The lightweight view uses WebGL; the full venue can use WebGPU or WebGL. Neither fixture connects to a database or a music playlist.

The standard fixture retains **150-second turns and 10-second preparation**, with two turns per five-minute fireworks event. Its first event begins 45 seconds after the first player connects, and local events repeat after a 30-second intermission. Closing every player view and opening a new one resets the local event clock. Production fireworks remain hourly.

For short handoff checks, a separate fixture is available:

```sh
cd backend
go run ./cmd/omnirave-show-review -fast -port 4177
```

The fast fixture clearly labels its 20-second turns, 3-second preparation and 40-second event. These values are process-level review settings, never client commands or production timing.

## Controls to try

1. Join Fireworks with Player 1, Drones with Player 2, and Fireworks with Player 3. The two panels can operate simultaneously. One player may hold only one queue/turn commitment at a time. The queue explains your position and automatic placement; when the next window is available to you, it counts down to when your controls open. Joining during the final preparation seconds opens an unclaimed panel immediately.
2. The upcoming operator gets a preparation panel up to ten seconds before the turn. Joining during those final seconds still claims an unassigned turn and opens the panel immediately. Pick firework designs and banks for an opening group. Those accepted choices launch automatically at the boundary; preparation does not subtract from the 2:30 turn.
3. On a fireworks turn, choose a fixed bank (L3–R3), then click a firework to launch it. **Select Multiple** collects up to four design/bank pairs; **Launch Together** fires the accepted group atomically. The selection stays available if the server refuses a launch and clears after acceptance; repeated clicks are blocked while a group is pending. Opening selections clear when the live turn begins. Each design has its own cooldown. Repeated copies of the same design in a group lengthen that design's cooldown.
4. On a drone turn, select a movement. The active icon contains its countdown. Click it again to queue a repeat, or choose another icon to replace the single pending movement. The gold diamond marks the queued choice. Once a clip finishes without a pending choice, its formation continues moving until another selection; automatic sequencing resumes when the operator leaves.
5. Drag the sky to look around. Operators stay in first person at distinct booth positions. Ending a turn restores the previous position and camera. A disconnect releases the queue/panel; reconnecting requires joining again.
6. Hide/show the global queues without leaving them. A preparation panel still appears when your turn approaches.
7. Leave fireworks unclaimed to see fallback playback. Drone playback continues independently, including outside fireworks events.

The preparation countdown is an opportunity to choose an opening, not an entry cutoff. A player who joins with any time remaining before an unclaimed turn starts gets the remaining preparation time and the full 150-second turn at the scheduled boundary. An assigned player is never displaced; joins after the boundary wait for the next unclaimed scheduled turn. Incoming openings reserve bank availability and cooldown availability; late outgoing launches can be refused to protect those reservations. They do not reserve sky capacity.

If a preparing player leaves or disconnects, the next waiting player receives the remaining preparation time for that same upcoming turn. The departed player's opening is discarded. The turn still starts and ends on its original schedule; automatic playback covers any interval with no operator.

## Implementation

- `backend/internal/omniraveworld/world/show_control.go` owns queues, turns, preparation, cooldowns, bank occupancy, capacity, seeded launch events and the drone clip timeline. Socket commands carry a request ID and turn ID. Identity and ownership are checked server-side; grouped launches are atomic; results are deduplicated for more than a full turn at the server's input rate limit.
- `show_catalogue.json` is the shared source for gameplay timings, capacity costs and seven bank placements. Zero for `maxCost` and `maxOpeningCost` disables both cost limits; shell costs remain metadata. The existing firework catalogue remains the source for visual and sound design. The initial limits are tuning values, not final balance.
- `src/showControl/` owns the HUD, shared playback clock, entry/exit lifecycle and procedural selector thumbnails. Countdown shading and numbers live directly on icons.
- `src/fireworks/createFireworkStudyRenderer.ts` batches simultaneous shells with absolute-time trajectories. Graphics buffers grow when needed, preserving all accepted shells when sky capacity is disabled, and are reused until renderer disposal. One audio context supplies all shells, with spatial emitters, sound propagation delay and a 32-voice cap. Muting, background throttling and late joins do not replay old sounds. An explicit mute remains in effect when using pads or dragging the view.
- The drone rig evaluates the server's analytic clip blend. Late joins and clients with different local audio/frame histories reconstruct matching positions. Fireworks event overrides cannot take ownership of this rig while shared playback is active. Cylinder, sphere, helix, wave, cube, orbit, crown and wordmark are selectable.
- The existing booth keeps its deck, desk and gold rail footprint. Two physical displays identify the stations. The front canopy rises to Y=8.2 from a rear Y=3.2, with extended supports. Structural blockers replace the former solid footprint blocker; the rear is accessible and the deck is walkable.
- The old `createFireworksShow.ts`, `createFireworksAudio.ts` and their obsolete scene test were removed. Stage pyro remains in `createStageAtmospherics.ts`; OMNIRAVE lettering is available through the drone wordmark formation. The independent single-firework reviewer remains at `/fireworks-review.html`.

## Verification and remaining tuning

The focused frontend suite covers malformed socket snapshots/results, drone clock cleanup after disconnect/disposal, explicit mute preservation, the HUD, group rejection/retry and delayed opening acknowledgments, opening selection cleanup, input/camera restoration, shared drone positions, all design lifetimes, roof ray clearance, sound deduplication/voice limits, renderer lifecycle, existing movement/camera behavior and websocket behavior. Backend tests cover explicit refusal of rate-limited show commands, two simultaneous operators, full preparation and handoff, replacements after preparation leave/disconnect, opening reservations, authorization, atomic groups, duplicate commands, disconnect/reconnect, fallback and repeat boundaries; these also run with Go's race detector.

Live browser checks exercised two simultaneous operators, the incoming fireworks handoff, a preparation choice launching automatically at the full-length turn boundary, grouped launches, retained selections after capacity rejection and successful retry, per-design countdowns, queued drone repeats, hideable queues and return placement. The full venue was exercised with WebGPU with no captured graphics errors. This is a first playable art/control pass: icon readability, panel size, camera pitch, cooldowns, sound balance and dense-effect performance across different devices remain appropriate manual-tuning areas. Smoke and sound remain the original procedural review assets.
