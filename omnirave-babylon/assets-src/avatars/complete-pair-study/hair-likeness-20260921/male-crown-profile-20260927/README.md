# Male crown profile — September 27, 2026

The broad crown shelf lacked a rounded crest, and a higher camera angle exposed a central patch of scalp support. This pass rounds the top into a modest off-center arch and redirects 168 existing upper locks across that patch.

## Authored result

The highest hair point rises 8.53 mm. Shallow channels follow the sideways sweep, and high ends turn back into the arch. The redirected locks retain their root pairs, receive curved paths across the exposed region, and lie with their faces toward the crown. Their width directions remain continuous along their free lengths, avoiding twists.

The pass edits 937 of 6,340 main-groom ribbons. All 5,403 unedited ribbons, including all 1,189 protected front curls, and 42 other meshes remain exact. All original root pairs and 57,160 lower pairs remain exact, including 12,123 lower pairs in the protected forehead locks. The 168 redirected upper locks are the explicit exception to the lower-height preservation mask. No topology, weights, origins, UVs, textures, vertex colors, material parameters, or relative motion shapes change.

## Verification

- Nine sampled expression and secondary-motion poses retain at least 2.16544 mm clearance on changed vertices. Inside/outside ray controls pass.
- Neutral face centers and edge midpoints show no sampled skin penetrations in changed hair or retained fringe. See `candidate-fringe-face-audit.json` for the sample counts and the retained close-clearance front locations.
- All 168 redirected cards pass width-direction continuity checks. Maximum ribbon width remains 1.61913 mm, with no newly degenerate triangles.
- All 27 movement samples and attachment checks pass.
- In the measured central patch, geometry coverage above the cap increases from 3.6% to 78.7% over 6,400 vertical rays. This measures geometry coverage, not texture alpha; the upper browser view provides the visual comparison.
- All three male GLBs validate with zero errors. Strict comparisons retain all original data except main-groom position, normal, and tangent arrays. Gzip round-trips, hashes, manifest byte counts, and native/runtime source equality pass. Only male manifest records are merged.
- Browser upper, back, side, standard hair, face, run, and walk views are saved. Error logs are empty. The temporary camera-only probe is removed, and the standard hair preview is retained.

## Reproduction and evidence

`before/` contains immutable inputs and baseline images. `build-candidate.py` applies `authored-refinement.py` and renders five native views. `validate-candidate.py` checks retained data, structure, width continuity, sampled skin clearance, and motion. `audit-fringe-faces.py -- --current` checks neutral triangle samples. `measure-crown-coverage.py` compares the measured crown patch. The shared `apply_reference_hair.mjs male` exports the assets, and `deliver.mjs` validates retained data and merges male download records. `finalize-evidence.py` checks the final delivery and writes this report.

The live helper is `scripts/launch-body-proof/refine_male_crown_profile.py`, with a male-only call after the rear-flow pass in `refine_reference_hair.py`. The full cumulative pipeline was not rerun. Earlier candidate folders retain the iterations used to identify high endpoints, the exposed crown location, card orientation, and temple intersections caused by moving upper sections of the front curls. The final version preserves those front curls completely.

These checks use finite samples and do not establish continuous collision freedom or strand self-contact. The upper browser comparison shows a smaller exposed crown patch, with dark separation still visible between the crossing locks. The hairstyle still has broad, stylized locks; this is another reference refinement, not a completed likeness match.
