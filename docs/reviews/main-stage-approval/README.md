# Main Stage — In-Engine Approval Pack

Gate 7 of the Babylon migration design: explicit user approval of the Main Stage
visual vertical slice, judged in-engine. This pack pairs each approved concept
reference with a matched runtime capture and a short delta note, per
`docs/guides/omnirave-venue-playtest-checklist.md`.

Runtime captures were taken from the live scene (WebGL path — WebGPU canvases
return blank `toDataURL`; the venue is visually identical on both). Shots
01–06 use the exact authored HUD checkpoint framings — the same views a player
gets from the playtest HUD — so every capture is reproducible in-engine.
07–08 are custom wide framings matched to the concept angles.

Note: of the five `approved-concept-*.png` files in
`omnirave-web/src/assets/venues/main-stage/`, only three are unique —
`internal-view` is byte-identical to `primary`, and `side-route` is
byte-identical to `vip-view`. The pack carries the three unique references.

## Reference ↔ runtime pairs

| Checklist area | Reference | Runtime capture | Delta note |
| --- | --- | --- | --- |
| Spawn / Back Plaza | `approved-concept-spawn-view.png` | `runtime-01-spawn-reveal.png` | Approach, promenade mouth, lantern warmth, and wayfinding all present and readable. Concept's flanking UNDERGROUND booth and P.L.U.R.R. warehouse are **absent by design** — those are separate venues in later milestones, replaced here by the festival field and perimeter scatter. |
| Midfield / Promenade | *(no direct reference — checklist area)* | `runtime-02-promenade-mid.png` | Promenade spine walkable end-to-end; signs (VIP TERRACE / CASCADE COURT / MAIN STAGE / WELCOME) read upright from player angles after the mirroring fix. |
| Side routes / Cascade Court | `approved-concept-vip-view.png` (flank context) | `runtime-03-cascade-court.png` | Tiered cascade with moving water sheets, planting, lanterns in both flank pockets. Concept's flame towers do not exist; the cascades are the built replacement for the flank interest. |
| Crowd pit / stage face | `approved-concept-primary.png` | `runtime-04-crowd-pit.png`, `runtime-07-stage-front-wide.png` | Hero LED panels beat-pulse with uv drift, spill lights crossfade magenta↔cyan, side LED tile fields alternate on half-beats. Concept shows a dense crowd and mid-air fireworks: **crowd NPCs are post-approval scope** (avatars/multiplayer milestone) and fireworks fire at route completion, not ambiently. |
| Basin edge | *(checklist area)* | `runtime-05-basin-edge.png` | Reflecting water with motion; coping collision keeps players out of the wade-in seam. |
| VIP read | `approved-concept-vip-view.png` | `runtime-06-vip-terrace.png`, `runtime-08-elevated-vip-wide.png` | **FLAGGED:** the VIP Terrace checkpoint view reads nearly unlit — the player lands under the terrace overhang in deep shadow with no gold/practical warmth in frame. Concept sells the VIP area as the warmest, most gilded read in the venue. Needs a lighting/framing pass before approval sign-off. |

## Known deltas held over (not blockers unless the user says so)

- Concept art is painterly and denser than any runtime target: ambient fireworks,
  crowds, and fine gold filigree detail are stylistic ceiling, not milestone scope.
- Sky: runtime has the baked starfield + moon; the user has reported the sky
  still looks unchanged on their client after two server restarts (unresolved
  client-cache suspicion, parked at user direction).

## Fail-condition sweep (checklist)

- Route: all 6 objectives walkable, completion fireworks + Play Again verified.
- Collision: envelope fence, basin caps, promenade opened past the approach deck.
- Signs: all four wayfinding labels verified upright/left-to-right in-engine.
- Dev chrome: hidden by default; captures here used `?debug=1` for the HUD
  travel buttons only (DOM overlay — never in canvas captures).
