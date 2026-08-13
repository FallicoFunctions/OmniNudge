# Main Stage — In-Engine Approval Pack

Gate 7 of the Babylon migration design: explicit user approval of the Main Stage
visual vertical slice, judged in-engine. This pack pairs each approved concept
reference with a matched runtime capture and a short delta note, per
`docs/guides/omnirave-venue-playtest-checklist.md`.

Runtime captures were refreshed on 2026-08-09 from the production-default
WebGPU path at 1280 × 720. Shots 01–06 use the exact authored HUD checkpoint
framings—the same views a player gets from the playtest HUD—so every current
capture is reproducible in-engine. The debug-only `capture=1` flag keeps those
controls operable while making all DOM chrome transparent for clean browser
screenshots. The older 07–08 custom wide images remain historical supplements,
not part of this refreshed checkpoint pass.

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
| Crowd pit / stage face | `approved-concept-primary.png` | `runtime-04-crowd-pit.png` | The visualizer is integrated into the authored proscenium instead of standing in the approach plaza. Its show layers stay silent when no track or scheduled event owns the stage, leaving the Crown readable. Fireworks fire at route completion rather than ambiently. |
| Basin edge | *(checklist area)* | `runtime-05-basin-edge.png` | Reflecting water with motion; coping collision keeps players out of the wade-in seam. |
| VIP read | `approved-concept-vip-view.png` | `runtime-06-vip-terrace.png` | **Refreshed after the checkpoint and grade correction.** The checkpoint now lands grounded on the real procedural skydeck at y=8.6 rather than beneath its slab. Its authored camera looks across the avatar, deck, rails, and wing architecture from the open ramp side. Restrained pearl/gold response retains surface detail under the brighter night grade. |

## Known deltas held over (not blockers unless the user says so)

- Concept art is painterly and denser than any runtime target: ambient fireworks,
  crowds, and fine gold filigree detail are stylistic ceiling, not milestone scope.
- The historical custom wide shots 07–08 predate this WebGPU checkpoint refresh
  and are retained only for comparison; they are not approval evidence for the
  current pass.

## Fail-condition sweep (checklist)

- Route: all 6 objectives walkable, completion fireworks + Play Again verified.
- Collision: envelope fence, basin caps, promenade opened past the approach deck.
- Flank access: the cascade-court blockers hug the built water feature instead
  of sealing the whole pocket. Both VIP skydecks have physical ramps from the
  flank ground, walkable deck/landing collision, and perimeter/ramp rails;
  water and backstage volumes stay sealed.
- Signs: all four wayfinding labels verified upright/left-to-right in-engine.
- Dev chrome: hidden by default; captures here used `?debug=1&capture=1` so the
  authored travel buttons remained operable while all DOM overlays rendered
  transparent in the browser screenshots.
