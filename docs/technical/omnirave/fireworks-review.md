# Individual fireworks review

The standalone Babylon review page is available at `/fireworks-review.html`, next to the existing avatar review pages. The complete-avatar page includes a **Fireworks review** link.

For local development, run `npm run dev` from `omnirave-babylon`, then open [Fireworks review](http://127.0.0.1:4175/fireworks-review.html).

## Reviewing a design

- Choose any of the 25 designs, or use Previous / Next. Only the selected design plays.
- Drag to orbit and scroll to zoom. Whole flight, Burst close-up, Side, and From ground provide repeatable starting views.
- Pause and scrub **Firework time** in either direction. **Inspect burst** pauses at a representative point in that design's expansion and moves to the close-up camera.
- Replay restarts the same variation. New variation changes the seed; entering a prior variation number reconstructs it exactly.
- Use 0.25× or 0.5× to inspect motion. Sound is suspended during slow motion.
- Enable Sound, then Replay to audition the complete firework at 1×. Sound starts muted, uses spatial playback, and includes travel delay. Pause, seek, switching designs, and hiding the page stop active voices; they do not replay a backlog when resumed.
- Toggle bloom, trails, fine sparks, smoke, or ground guides to isolate what needs work. Reduced detail reduces trail samples and fine sparks while preserving main stars and branching.
- Copy this view saves the design, seed, camera, moment, and primary layer toggles in a URL. Opening it restores a paused review view. Save frame downloads the current paused viewport as a PNG.

## Scope and quality status

All 25 entries are **animated design studies**, based on the [design catalogue](fireworks-design-catalogue.md). They use new deterministic three-dimensional motion and batched emissive rendering, independent of the existing venue fireworks. The sound profiles are original procedural auditions, not final recorded/mastered assets.

This review tool makes the designs concrete enough for individual visual and audio feedback. The studies are now integrated into the multiplayer soundbooth controls. Further artistic polish and performance calibration across devices remain iterative work. The isolated viewer currently uses the Babylon WebGL engine; it does not claim WebGPU parity or final venue lighting parity. Smoke is a lightweight approximation.

The local timeline describes one firework's ascent, break, secondary events, and decay. It does not schedule a show or establish venue launch times. Repeating an individual study is a review convenience.

## Implementation

- `src/fireworks/fireworkCatalogue.ts`: 25 typed definitions and their design briefs.
- `src/fireworks/fireworkStudy.ts`: seeded, absolute-time motion, secondary events, and burn curves.
- `src/fireworks/createFireworkStudyRenderer.ts`: shared light/smoke batches with sampled continuous trails.
- `src/audio/createFireworkStudyAudio.ts`: bounded spatial procedural audio, gesture unlock, and explicit cancellation.
- `src/review/fireworks.ts`, `src/review/fireworks.css`, and `fireworks-review.html`: standalone review interface.

The obsolete `createFireworksShow.ts` and `createFireworksAudio.ts` have been removed. The venue uses the same catalogue and shared batch renderer through `src/showControl/createShowControlRuntime.ts`. This individual reviewer remains a separate Vite entry and makes no authenticated backend requests. See [the soundbooth playtest guide](show-control-review.md) for multiplayer controls.

## Verification

TypeScript compilation, the Vite production build, and 11 targeted tests passed during implementation. Tests cover deterministic replay, all 25 definitions across three seeds, finite motion, full burnout, crossette split continuity and momentum, fixed ring orientation, strobe behavior, URL seed validation, render-batch bounds and disposal, distinct finite sound buffers, audio cancellation, and unlock/mute races. Browser checks exercised all 25 design selections, playback and scrubbing, sound activation and slow-motion muting, saved-view restoration, and PNG export. Desktop and 390-pixel-wide views were inspected; narrow panels expand the camera's field of view to keep broad bursts visible. Browser checks finished without console errors or warnings.
