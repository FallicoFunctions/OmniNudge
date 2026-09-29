# Pass 12 — male upper-chest width

- Reference: `avatar-luxury-festival.png` only.
- Changed variable: male `spine_03` X scale from `0.98` to `1.02`.
- Held fixed: `spine_03` Y/Z, clavicles, pelvis, arms, legs, shared root scale, female profile, source GLB.
- Decision: keep.
- Front review: slightly stronger shoulder-to-upper-torso transition without widening the waist or hips.
- Clothed review: fitted top and utility vest remain attached; no visible shoulder seam or angular shelf introduced.
- Orbit review: both ±35° silhouettes remained non-degenerate. Candidate area ratios were `1.0279` and `1.0227` relative to front.
- Live route: loaded successfully with no visible regression; the stored account displayed the female avatar, so male shape acceptance remains based on the clean viewer.
- Known gate limitation: the Tier 1 photo-vs-render check failed on background/framing and missing map-stripped evidence. Its raw silhouette score is not treated as an anatomy verdict for this pass.
