# Avatar walk and run cycles

The complete launch avatars use the animation-only keyframes in
`src/player/completeAvatarLocomotion.json`. `applyCompleteAvatarLocomotion`
installs them on each imported/cached copy, preserving clip names, timing,
facial and garment morph tracks, and the source assets. All three detail
levels use the same skeleton and keyframes.

Regenerate from the project directory:

```sh
node scripts/avatar-locomotion/generate.mjs
node scripts/avatar-locomotion/measure.mjs
npx vitest run scripts/avatar-locomotion/locomotion.test.mjs
```

The generator reads only the production GLB joints, animation tracks and
sneaker vertices. It authors foot contact, push-off, recovery, hip/chest
counter-rotation and opposing arm swing, solves the leg joints, then bakes
64 intervals per cycle. Grounding uses the actual skinned shoes. It does not
launch Blender, render, modify GLBs or run any solvers during gameplay.

Review both characters at `/complete-review.html`: choose Walk or Run, use
Side/Three-quarter, and pause/scrub the frame slider. State changes blend
over 180 ms from the last displayed pose; a newly loaded copy immediately
adopts its current pose, and distant copies retain their sample-rate limit.

This pass preserves the existing movement speeds and clip cadence. Exact
world-space foot locking at every movement speed is outside this change.
Normal movement at 4.5 m/s selects walk; sprint at 6.975 m/s selects run.
Foot lift starts after ground contact ends, so grounding cannot pull the
hips into a squat. The tests bound hip drop, thigh/arm swing, and forearm
direction throughout the cycle as well as checking shoe contact.

Soft leg reach prevents the knees from snapping straight at late swing.
The root contact correction is smoothed during baking, and small delayed
wrist motion softens the arm swing. Temporal checks cover the loop seam,
knee extension, and hip acceleration; sole checks cover every baked frame.
Sampled avatars keep gait phase on their player anchor, including when
switching walk/run, returning from off-screen, or changing detail level.

Starts and stops use a blend with zero endpoint velocity and acceleration.
Small sole probes sampled from the actual sneakers preserve contact height
while joint rotations blend, preventing the transition from sinking the
shoes or lowering the body. The correction runs only during a transition,
in rig coordinates, before crouch; it requires no runtime mesh skinning.
Regenerating also writes `src/player/completeAvatarSoleProbes.json`.

Gait changes retain a short, damped continuation of the last two displayed
poses so the limbs do not freeze while the new clip blends in. Follow-through
is limited to 1 cm of translation and 0.15 radians of joint rotation; stale
samples and clock rewinds disable it. The elapsed time since the displayed
pose is included on the first new-gait frame. Tests exercise both directions
of walk/run changes, moving foot velocity, and sole/arm/hip bounds at 30/60 Hz.

Running arms have a modest backward shoulder bias, an elbow that opens on
the backswing, and forearms angled slightly inward. Hands pass the hips
instead of remaining held forward. Neutral wrists and a steady relaxed
finger curl remove the open-handed gripping motion. Walking and leg tracks
are unchanged by this arm pass. Checks cover reach, forearm direction,
wrist alignment and finger stability on both characters at all detail levels.

Walking transfers weight toward the supporting foot with a small pelvic
drop on the unloaded side. The chest counter-rotates with a slight delay;
arm and wrist timing follow the step rather than behaving like rigid rods.
Forearms stay close to the body. The review's Moving ground option adds
continuous floor guides at the authored stance speed, and motion/view choices
are retained in the URL across refreshes. The avatar itself never jumps back
to a start point between strides; the existing clip cadence is retained.

Walking push-off begins before the other heel lands, with an 8% cycle
overlap before toe-off instead of 14%. Swing recovery uses the extra time
without changing cadence or increasing stride reach. Each shoe rolls on
its measured sole geometry, so the landing foot takes contact immediately
instead of hovering while the rear toe holds the body up. Tests check both
landings on every LOD, including heel rise, support contact and prompt release
of the trailing sole.
