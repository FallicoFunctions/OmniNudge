> Implementation update, 2026-09-18: the first playable version is integrated into the venue. See [playtest instructions and implementation notes](show-control-review.md). The proposal below remains the design rationale; dimensions and integration status in its original inventory describe the pre-build baseline. The roof front is now Y=8.2, with a Y=3.2 rear edge.

# Player-operated fireworks and drone shows

Design proposal · revision 2 · 17 September 2026 · planning only

## Confirmed direction

The player temporarily operates a show from a stationary first-person position in the existing soundbooth. The fireworks event lasts **five minutes**, divided into **two 150-second player turns**. Each drone operator also receives **150 seconds**, while the drone show runs continuously. Each panel has its own operator: **one fireworks player and one drone player may operate side by side at the same time**. Ownership is per panel, never one lock for the entire booth.

Players manually join a line for a turn. The fireworks player queue has a hideable global HUD. Leaving the game removes the player from the line. The next fireworks player gets **ten seconds of preparation before their turn**, including selection of opening fireworks that launch automatically when their turn begins. The system moves players into and out of operating positions automatically. An unclaimed fireworks period uses preprogrammed playback; an unclaimed drone period continues automatic movement playback.

The current code schedules fireworks at the top of each hour. Hourly remains the draft cadence pending the user's choice between hourly and every 30 minutes. Both options use the same five-minute event and 150-second turns; no recurrence change has been implemented.

Multiple fireworks may overlap, individual designs have different cooldowns, and drone movements are chosen through icons with countdown overlays. Clicking the active movement again queues another run to start immediately after it finishes. All visible operator timers count down from at most **02:30**, not 05:00. A separate event-status display may represent the full fireworks event.

The user selected **creative controls first; optional challenges later**. The first version has no score, failure condition, compulsory combo, or prescribed player firing sequence. The panel concepts are a starting point for manual testing and later revision. This document defines access and turn timing; it does not choreograph the fallback show or prescribe the player's effect order.

Operating either console affects the shared venue show seen by other players. A separate practice mode can use the same controls privately. Fireworks and drone ownership, queues, timers, and input contexts are independent. The continuous drone show remains available during the fireworks event; starting fireworks must not override the drone player's selections.

## The player experience

Use the **existing front-of-house soundbooth** for both controls, as specified by the user. Install two control modules in its sloped desk surface and two distinct operator anchors, one behind each panel. Keep the booth's deck, footprint, desk, and gold rails. Raise the stage-facing canopy edge substantially and extend its front supports so the roof and front trim clear the show. The current source canopy is flat at world Y = 3.2; it is not already tilted. A rear edge around the existing height and front around Y = 7 is a concept starting point, not a verified final dimension.

The [revised panel concept](concepts/show-control/soundbooth-controls-v2.png) shows two simultaneous operators, the raised front canopy, the player queue HUD, understandable group-launch controls, and turn timers below 02:30. Its drone Wave icon shows the countdown directly over the artwork and a small queued-repeat marker. This remains concept art, not an implemented venue change. The [first concept](concepts/show-control/soundbooth-controls-v1.png) is retained as an earlier version.

Verify canopy clearance from **both** operator eye positions against the complete planned fireworks and drone volumes, including the highest burst extents and wide side effects. Check beams, valance, posts, aspect ratios, and permitted look angles; a clear view of only the stage is insufficient. Raise or adjust the canopy further if those checks fail. The image alone does not prove clearance. The present collision geometry also blocks the entire booth footprint; implementation must replace that body with appropriate structural blockers and accessible operator/exit positions.

- Lock the player's world position while operating. Looking around is allowed; walking, jumping, crouching, climbing, and external player push-out cannot move the operator off the station.
- Keep the pointer free for pads and selectors. Drag on the sky to look; provide a Center view action. Do not require pointer lock just to press buttons.
- Keep most of the screen available for the show. Put the remaining session time and Exit at the top, with the main controls in a compact lower panel.
- Give pads keyboard bindings that are inactive while typing in chat. Touch buttons invoke the same actions. Avoid requiring simultaneous keyboard presses to launch several fireworks together.
- On automatic entry, save camera, player location/zone, and input state and clear held movement keys. On exit or expiry, move the outgoing player to a clear return position, restore normal controls, and free only their panel. Disconnect and scene teardown also release ownership. Operator avatars remain visible at their own stations to spectators; neither can push the other away.
- Every player turn has a fixed 150-second interval. Entering late, reloading, or hiding the HUD does not restart or extend it. Preparation happens outside that interval and does not reduce it.
- During preparation, display the selected panel controls to the incoming player without taking over the outgoing player's station. Preload what is needed. At the exact boundary, replace ownership and place the incoming avatar at its panel anchor in one server transaction. Do not require walking, another confirmation, or a loading screen at handoff.

The visual label should say “You are controlling the venue show” or “Practice” so the effect of pressing a pad is clear.

## Player queues and automatic handoff

### Global fireworks queue HUD

The HUD is available throughout the shared game world, not only inside the booth or main-stage zone. It shows the current operator if any, the ordered waiting players, the local player's place, next event/turn information, **Join Queue / Leave Queue**, and a hide control. A stable small Show Queue button restores it. Hide/show is a local display preference: hiding never removes the player from the queue, and a personal preparation alert still appears when their turn approaches.

The line is first-in, first-out. Joining is manual; walking into the booth does not enqueue a player. One entry per player is allowed. Completing a turn does not automatically rejoin the line. Connected players waiting beyond the two available fireworks turns remain in line for the next event. Leaving the game removes the entry and any prepared selections; returning requires joining again. Changing zones within the same world does not count as leaving the game.

The Join Queue flow makes the automatic move into the booth clear. Players may leave before their turn. They need not remain physically near the booth while waiting. At turn end, return them to their saved location/zone when still valid, otherwise a clear nearby exit position. Do not drop them into the other operator or a newly occupied spot.

Proposed initial conflict rule: a player may hold only one show-control queue/turn commitment at a time, so the same player cannot be moved to two panels at once. This does not restrict two different players from using both panels simultaneously. The drone panel uses its own opt-in player queue, accessible through a Drones tab or entry alongside the required fireworks HUD; its detailed presentation can be refined during manual testing.

### Five-minute fireworks event

Times below are relative to the event start, not a choreography or firing schedule:

| Event time | Fireworks ownership and preparation |
| --- | --- |
| −00:10 to 00:00 | Player A prepares opening selections; no public launch yet |
| 00:00 to 02:30 | Player A operates; their timer begins at 02:30 |
| 02:20 to 02:30 | Player B prepares while A keeps full control |
| Exactly 02:30 | A's control ends; B moves into place and B's prepared opening launches |
| 02:30 to 05:00 | Player B operates for their full 02:30 |
| Exactly 05:00 | New event launches stop; B exits; existing effects finish naturally |

In the ten-second preparation view, the incoming player chooses one firework or a bounded group plus banks. Selections are editable, visibly marked as prepared, and never fire early. Use a short personal **Your turn in 10** countdown, separate from the drones' icon timers. The server acknowledges the prepared selection and automatically issues it at the turn boundary; there is no extra launch click. No selection is required: a player who chooses nothing still receives their turn and can use the pads immediately.

The preparation view must not pretend that arbitrary commands can always be accepted at the boundary. Reserve measured launch capacity and compatible bank slots for the acknowledged opening, include cooldown availability in the offered choices, and constrain outgoing late launches only as required to preserve that commitment. Reservations are released or replaced when selections change or the incoming player leaves. Existing effects are never erased to make room. First-turn and second-turn preparation follow the same rules.

With no player assigned at the event start, preprogrammed fireworks begin immediately. Any later unclaimed half also runs automatic playback. Late-join rule: someone who joins during an unclaimed half's preparation countdown receives the remaining preparation time and the full 150-second turn. The ten-second window is not an entry deadline. A join received after the half starts waits for a later unclaimed boundary. Automatic playback continues until an actual prepared handoff. If an operator leaves during a turn, automatic playback fills the remainder of that fixed half; the next player still receives a full 150 seconds at the next boundary. Never give a late replacement a surprise shortened turn or extend the event.

The fallback controller and human operator are mutually exclusive **fireworks command sources**. They use the same new effect library and shared capacity accounting. Automatic playback must not add unrequested fireworks during a human's turn. Accepted outgoing fireworks may continue burning after the handoff; that visual overlap is intentional. The fallback choreography itself remains to be designed separately.

### Continuous drones

The drone show never stops because a turn ends or its player line is empty. Each drone operator gets 150 seconds, independent of the fireworks event clock. Use the same ten-second preparation and automatic-positioning mechanism for successive drone operators as a proposed consistent interaction. When the drone line is empty, the existing automatic clip behavior continues; the first queued player prepares for ten seconds, then starts a full turn. Subsequent prepared players take over at the current turn boundary. If an operator leaves early, automatic control fills the remaining time while the next scheduled handoff is prepared.

At handoff, preserve the current swarm positions. Discard only the outgoing player's **unstarted next-movement selection**. Apply the incoming prepared movement immediately through its authored entry motion and countdown; there is no blackout, teleporting swarm, extra waiting gap, or old movement queue inherited by the next player. If the incoming operator has no prepared choice, keep the current formation moving until they choose. If nobody takes over, resume automatic playback smoothly from the live formation.

This player line is distinct from the single next-movement choice on a drone icon.

## Fireworks console

Suggested layout:

```text
FIREWORKS                                  YOUR TURN 02:14    Exit
                            open sky

Launch position: [Left] [Center] [Right] [Mirror pair] [Wide]
Pads:             Peony      Crossette      Ring      Willow
                  READY       3.1 s        READY      9.4 s
                  ... remaining designs, grouped in pages ...
Group launch:     [Select Multiple] [selected effects] [Launch Together]
```

A normal pad press launches its firework from the selected position or position group. It must acknowledge Pending immediately, then Launched or a clear rejection reason. A launched shell still has its visible ascent before the explosion; button feedback must not disguise that ascent as input lag.

Use **Select Multiple** and **Launch Together** for a group of simultaneous fireworks. Do not use “Salvo” in the player interface; it is unfamiliar terminology. Normal single-pad launches remain direct.

The complete library remains available. Group the 25 pads into readable pages, preserve their cooldowns across page changes, and provide a small favorites row after the basic interaction is proven. The single-firework reviewer remains the place for close artistic inspection.

### Fixed mortar banks

Yes: author fixed launch banks, their available tubes, and their approved trajectories. Use stable positions to make left/right balance, symmetry, and depth learnable. Randomness belongs in bounded effect detail, not in choosing an unexplained launch location.

Start the composition prototype with seven logical banks:

```text
Left outer — Left middle — Left inner — Center — Right inner — Right middle — Right outer
```

These are a proposed control layout, not final world coordinates. Each bank may represent several virtual tubes. Authored slots specify origin, heading, ascent path, burst region, and compatible effect envelopes. Single, mirrored-pair, and wide-group controls select explicit bank lists. The server chooses an available compatible tube deterministically; if one is unavailable, the UI explains that rather than substituting another position.

Survey the actual venue before fixing coordinates. Check the operator station, audience floor, balconies, stage skyline, and drone volume. Test large ring/willow envelopes and the longest descending trails as well as the launch point itself. Keep launches, sky regions, and sound positions derived from the same placement definition. The seven legacy mounts are useful reference anchors, not an approved replacement layout.

### Cooldowns and simultaneous launches

Give each of the 25 definitions its own gameplay tuning record, separate from its visual and sound definition. This record includes design cooldown, compatible banks, and estimated active-effect cost. Cooldown is a gameplay pacing choice and need not equal the firework's lifetime.

Initial tuning bands to try, not settled values:

| Design character | Examples | Candidate base cooldown |
| --- | --- | --- |
| Brief, open effects | Peony, Dahlia, Ring | 3–5 seconds |
| Structured or branching accents | Palm, Crossette, Fish, Spiral | 6–8 seconds |
| Dense or strongly animated effects | Brocade, Crackle, Dragon | 8–12 seconds |
| Lingering sky coverage | Willow, Waterfall, Time Rain | 12–16 seconds |

Assign and review individual values after trying overlapping shells. These bands do not make every member share the same value, and they are not launch times.

Current tuning: sky capacity is disabled at the user's request. The design cooldown and bank availability rules remain active; capacity proposals elsewhere in this plan are deferred.

Two active rules make overlaps predictable:

1. **Design cooldown:** shared across banks for that design on the fireworks panel. Changing banks, reloading, or handing the panel to another player cannot bypass it. It starts at the accepted launch time, not when the button was first pressed; the next player's preparation accounts for these deadlines.
2. **Bank availability:** a brief per-bank/tube turnaround prevents unrelated pads firing through the same unavailable slot. A bank containing several tubes can still support an intentional combined launch.

Different ready designs can launch while others remain in the sky. For exact simultaneous launches, Select Multiple stages design/bank pairs and Launch Together submits them as one atomic group. Validate the entire request before accepting it; do not silently omit some shells. Repeating one design across multiple banks is explicitly represented in that one group, charged once per shell against capacity, and uses a documented count-dependent cooldown adjustment. A rejected group spends no cooldown or capacity.

Show design cooldowns on their icons, and distinguish bank availability from overall sky capacity when an action is unavailable. During a live turn, do not silently queue a fireworks press and fire it much later. The explicit ten-second preparation phase is the exception: its acknowledged opening selection launches at the known turn boundary. Ready pads remain playable even while other designs cool down.

At each 150-second boundary, the outgoing player's commands stop. At the five-minute event boundary, all new fireworks launches stop. Already accepted shells and their sounds finish naturally, with their remaining capacity accounted for during handoff. Five minutes is the event's launch window, not one player's control time; it need not imply a completely dark sky at the final instant.

## Drone console

Treat each prebuilt movement as a clip with a name, thumbnail, stable ID, duration, internal motion, and entry/exit behavior. Preserve the existing movements while extracting them from the automatic sequencer. The player chooses the order. The user specified a Warcraft III-style spell-button interaction: the selected icon itself becomes the countdown, and clicking it again queues the next run. Use that compact visual language rather than a Now/Next text panel or a separate transition readout.

```text
DRONES                                    YOUR TURN 01:52     Exit
                            open sky

MOVEMENTS: [Cylinder icon] [Sphere icon] [Helix icon] [Wave icon] ...
                                                       4
                                                       •
```

In this example the number is drawn over the Wave artwork, with a radial countdown sweep. The small marker means another Wave is queued. These states live on the selector itself, not in a separate queue panel.

Cylinder is included here because it is the user's named movement. Its identity must be reconciled in the drone reviewer: the current code names cube, sphere, double helix, wave, and wordmark, plus event-specific crown/orbit/finale formations; there is no separately named cylinder selector in that module. Do not silently rename or replace the movement the user remembers.

- Click a ready icon when no movement is running: start that movement and overlay its remaining run time on the icon. Use a dimmed radial sweep and a simple whole-second countdown; leave the artwork recognizable.
- Click the active icon again: queue one repeat. Keep its current countdown running and add a small queued marker or outline. The icon remains clickable while counting down; this is not a disabled spell button.
- Click a different movement while one is running: queue that movement for the same next boundary. Mark its icon without adding a sentence about when it will transition.
- Proposed first-version queue rule: one pending movement. Selecting a different icon replaces that pending choice; selecting the already queued icon again leaves it queued rather than building a hidden backlog. The active icon's countdown never resets because of a queue edit.
- At zero, the queued movement begins immediately and its icon starts a fresh countdown. A queued repeat restarts the same icon's countdown. There is no extra waiting period or second button press.
- Include the incoming formation change within that next movement's authored run duration. Drones move smoothly from their existing positions as the next countdown starts; do not teleport them or add an unexplained transition delay after zero. Once a run begins, its destination is fixed; subsequent clicks affect only the pending run.
- With nothing queued at zero, the icon becomes ready and the swarm holds its ending formation with gentle idle motion. Do not automatically restart the full clip, which would make explicitly queuing a repeat meaningless. Choose idle behavior for each clip so its endpoint remains visually stable.
- Keep movement names and active/queued state available to assistive technology and on focus/hover. Visible playback feedback stays on the icons; do not announce every countdown tick.
- Begin with shared-clock seconds. Musical-bar quantization is a later option only when every client has the same track/beat timing; local microphone or FFT detection cannot decide public transition boundaries independently.
- Use the existing 2.5-second morph as a prototype starting point, then author transitions for each movement pair as needed. Check travel distance, point speed, and visual crowding instead of assuming every formation change looks good with one interpolation duration.
- At the 150-second turn end, discard the outgoing player's pending choice and hand ownership to the prepared incoming player or automatic playback. Preserve the live swarm and use the entry behavior described above. The operator's timer does not wait for a movement queue to drain, and the continuous drone show does not end.

Clip timing is an individual movement property. This does not establish a drone show's order or a fixed performance timetable.

## Shared venue implementation

The world server must own the two independent operator identities, panel occupancy, player lines, preparation windows and reservations, turn start/end, accepted commands, cooldown expiry, bank occupancy, active-effect capacity, and drone movement boundaries. Keep the five-minute fireworks event state distinct from each 150-second operator turn. Disabling movement only in the browser is insufficient: the authoritative movement path also needs an operating state anchored to that player's panel.

Publish fireworks line state globally within the shared world, including to clients currently in other zones. A main-stage-only snapshot cannot power the requested global HUD. Do not assume unrelated isolated game-server instances share a live show. The HUD is a projection of server state; closing it cannot release the queue entry or lease. Use server timestamps for queue estimates, the ten-second countdown, the 150-second turn timer, and the five-minute event boundary.

Clients request actions using catalogue IDs and bank IDs. They do not submit arbitrary launch coordinates, cooldown overrides, or formation code. Each request carries a session identifier, request ID, and expected revision so duplicate delivery and stale queue edits cannot trigger extra effects or overwrite newer choices. The server validates ownership and time before accepting a command.

Broadcast compact accepted events with event ID, configuration version, server start time, design/clip ID, authored placement, and seed. Render locally from shared time. Never stream every firework spark or drone transform over the socket. An active snapshot includes live shells, cooldown deadlines, player-line revision, preparation and turn deadlines, movement/transition state, and separate panel leases so late joiners reconstruct the current view without relaunching it or replaying expired sounds. The authenticated player's prepared selection can remain private until accepted for launch. Rejoining after a real disconnect reconstructs the show as a spectator and does not restore the removed queue place automatically.

The fireworks studies already use deterministic absolute-time sampling. The current drone sequencer advances mutable local timers and follows local audio; its public control path needs an explicit shared timeline and reconstructible transitions. Local audio-reactive color accents may vary, but chosen formations and transition boundaries must agree. Define any remaining acceptable spectator variation explicitly.

Use a dedicated temporary operator camera and input context. Keep ordinary walking, chat typing, preparation, and panel ownership as separate states; do not repurpose the chat-focus flag as the lasting movement lock. Clear pending local requests on ownership loss. Perform ownership replacement, outgoing return placement, incoming panel placement, and prepared opening dispatch as one idempotent server handoff, fenced by turn ID. Old requests cannot execute in the next player's turn, and late receipt evaluates an already accepted effect at its current age.

On disconnect, remove the player from either line, invalidate their prepared opening/reservations, and revoke only their panel lease. Automatic playback takes over the unowned period; existing effects continue. Cleanup must follow the session-identity guard already used by `World.RemovePlayer`: an old socket's delayed cleanup must not erase a newer session or a new manual queue entry. A disconnect does not earn or retain a place. If the selected next player leaves during preparation, promote the next queued player immediately for the remaining preparation time. Preserve the scheduled boundary and full 150-second turn, discard the departed player’s opening, and never displace an existing operator. An idle drone panel can begin a fresh preparation window when someone joins.

The single-study renderer is not yet a multi-launch runtime. Extend it to compose multiple active studies into shared batches, applying authored world placement and respecting a total budget. Repeatedly calling its current render method would overwrite a batch, not layer multiple fireworks. Spatial audio must likewise accept several event sources under one bounded mixer. Measure worst-case accepted combinations in the actual venue pipeline, including WebGPU where used, before setting capacity.

## Existing code and migration points

| Current code | Relevant behavior | Planned change |
| --- | --- | --- |
| `src/fireworks/` and `src/review/fireworks.ts` | 25 independent deterministic review studies | Preserve catalogue/reviewer; add placement, concurrent playback, and gameplay tuning |
| `src/scene/createFireworksShow.ts` | Seven fixed aerial mounts, automatic legacy show, stage pyro and lettering | Replace aerial ownership after new path works; explicitly migrate or separately retain pyro/lettering callers |
| `src/scene/createHologramGrid.ts` | Existing formations, automatic holds/morphs, event overrides | Extract a reviewable clip library; continuous drone operation; prevent fireworks event overrides from stealing drone ownership |
| `src/scene/createSoundBooth.ts` and booth collision blockers | Flat low canopy and solid footprint blocker | Raise front canopy; two independent operator anchors; accessible structural collision and return placement |
| `src/player/createFollowCameraRig.ts`, `createInputMap.ts`, `playerController.ts` | Ordinary camera and movement | Dedicated temporary operator mode with reliable entry/exit restoration |
| `backend/internal/omniraveworld/world/event_schedule.go` | Main-stage fireworks currently active for three minutes each hour | Five-minute event with two 150-second turns; configurable recurrence; ten-second preparation |
| `backend/internal/omniraveworld/world/protocol.go`, `src/network/worldSocket.ts` | Player movement/chat/loadout and venue snapshots | Add opt-in player queues, global HUD state, prepared selections, separate panel leases, accepted events, and recovery snapshots |
| `backend/internal/omniraveworld/world/world.go`, server disconnect handling | Session-aware player removal | Remove disconnected players from lines, cancel prepared work, release ownership without stale-session races |

Paths under `src/` above are within `omnirave-babylon`. The existing event-specific drone logic assumes active minutes 1–3; extending only the UI timer or only the backend constant would leave conflicting behavior. No code is changed by this design document.

## Proposed build order

1. **Review the controls in a sandbox.** Extend the review workflow with the two stationary first-person consoles, a seven-bank preview layout, concurrent fireworks, per-design cooldowns, and Launch Together. Extract the existing drone movements into a companion reviewer and try icon countdowns and click-again queueing. Expose short test clocks for preparation and handoffs without requiring an hour-long wait. Keep the interface easy to revise after the user's manual testing.
2. **Fit the controls to the existing soundbooth and place launch banks.** Raise the front canopy and validate sightlines from both operator positions, the audience, and balconies. Confirm the remembered cylinder movement; tune each firework's cooldown, capacity cost, and compatible launch paths. Keep drone and fireworks sky regions legible together.
3. **Connect the shared experience.** Implement manual player lines, the hideable global HUD, disconnect removal, two independent panel leases, five-minute fireworks events, continuous drones, full 150-second turns, ten-second preparation and opening reservations, automatic avatar placement, fallback playback, and restoration. Validate with two simultaneous operators, an incoming player, and a spectator, including late-join and disconnect cases.
4. **Polish and retire the placeholders.** Verify performance, sound balance, simultaneous effects, timeout/disconnect behavior, and venue rendering. Remove obsolete aerial fireworks code and generic audio only after its responsibilities have been migrated and the replacement has been reviewed. Optional objectives/challenges come later.

## Acceptance checks for implementation

- Two players can operate different panels simultaneously, but cannot claim the same panel. A fireworks event or its handoff cannot seize the drone player's controls, camera, or chosen movement.
- Both operator cameras see the complete authored show volume without roof/trim obstruction. Booth collision cannot expel an operating avatar or obstruct the other player's handoff.
- One press produces one accepted launch. Duplicate commands, reconnects, and browser reloads do not reset cooldowns or produce extra group launches.
- Multi-bank group launches share one scheduled start time, validate atomically, and charge capacity for all shells.
- The global line displays the same authoritative order in all zones. Hide/show leaves membership unchanged. Manual leave and game disconnect remove membership and reservations; stale socket cleanup does not affect a newer session.
- The first and second fireworks players each receive exactly 150 seconds, with preparation beginning ten seconds earlier. Preparing a choice never launches it early; an acknowledged opening starts at the boundary without another click.
- At a boundary, ownership and player positioning change atomically. Old-turn commands are rejected, prepared openings are dispatched once, and the other panel continues uninterrupted.
- An empty line, a missed preparation window, or an early departure never leaves the shared show waiting for a player to walk to the booth. Automatic playback covers the unowned interval and cannot compete with an active human operator.
- A late joiner sees the current firework age and drone transition rather than a fresh performance from the beginning.
- Scrubbing the isolated reviewer still reproduces designs independently of gameplay tuning.
- Drone queue edits cannot snap or rewind an in-progress formation transition. Clicking the active icon queues a repeat without resetting its countdown; the queued run starts at zero without an additional delay. With no pending run, the ending formation remains stable rather than automatically replaying the clip.
- All exit paths restore movement/camera/input state and stop sending commands from the prior session.
- Accepted combinations remain within measured visual, rendering, and audio budgets; capacity feedback is visible before a player repeatedly presses an unavailable action.
- The five-minute event and 150-second turn deadlines agree for operator and spectators. Firework tails survive ownership changes and event end; drones remain active between player turns and when their line is empty.

Open decisions for the next prototype: hourly versus every-30-minute fireworks recurrence (hourly is the current draft); exact operator/return anchors and tested canopy height; final launch-bank coordinates/trajectories; detailed drone-line presentation; and tuning of prepared-opening reservations. Late-entry and one-commitment-at-a-time policies above are proposed defaults for testing. The user has settled simultaneous operation, manual fireworks enrollment, disconnect removal, 150-second player turns, ten-second fireworks preparation, automatic positioning, and continuous drones. None requires pre-authoring the player's creative show.
