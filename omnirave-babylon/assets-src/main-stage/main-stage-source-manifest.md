# Main Stage Source Manifest

`main-stage.blend` is the canonical authored source. All commands below run
from `omnirave-babylon` and are safe to repeat. Geometry generators own only
their documented namespaces and remove their previous objects and orphaned
mesh datablocks before rebuilding.

## Source Inputs

- Blend: `assets-src/main-stage/main-stage.blend`
- Authoring rules: `assets-src/main-stage/README.md`
- Poly Haven provenance/checksums: `assets-src/main-stage/textures/polyhaven/README.md`
- Runtime material maps: `assets-src/main-stage/textures/subtle/`

## Canonical Regeneration Order

1. Regenerate deterministic material maps:
   `blender -b --python scripts/generate-main-stage-subtle-textures.py`
2. Rebuild the generated wing arcade:
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/generate-main-stage-arcades.py -- --write`
3. Rebuild the cascade stone, water, then garden layers in dependency order:
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/generate-cascade-court.py -- --write`
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/generate-cascade-court-water.py -- --write`
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/generate-cascade-court-gardens.py -- --write`
4. Rebuild the foreground approach deck and collision shell:
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/generate-approach-deck.py -- --write`
5. Reconcile additive authored arrays (these add only missing absolute positions):
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/generate-main-stage-approach-lights.py -- --write`
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/extend-wing-lanterns.py`
6. Ensure all still-water surfaces have UV/tangent space:
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/add-still-water-uvs.py -- --write`
7. Apply the idempotent physical panel-gap treatment:
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/seal-main-stage-panel-gaps.py`
8. Rebind the regenerated PBR maps and save the blend:
   `blender -b assets-src/main-stage/main-stage.blend --python scripts/apply-main-stage-pbr-textures.py`
9. Export, repair tangent space, Draco-compress the repaired canonical GLB,
   and verify runtime parity:
   `./scripts/export-main-stage.sh`

Do not call `scripts/export-main-stage.py` directly for a deliverable build;
the shell pipeline owns texture optimization, tangent repair, compression,
and parity verification.

## Runtime Outputs

- Canonical validation GLB (uncompressed, not shipped):
  `assets-src/main-stage/build/main-stage-validation.glb`
- Production scene GLB (Draco):
  `public/assets/venues/main-stage/main-stage.glb`
- Collision GLB:
  `public/assets/venues/main-stage/main-stage-collision.glb`

## Required Verification

```sh
npm test -- --run
npm run build
npm audit
npx --yes @gltf-transform/cli validate public/assets/venues/main-stage/main-stage.glb --ignore UNUSED_OBJECT --limit 30
npx --yes @gltf-transform/cli validate public/assets/venues/main-stage/main-stage-collision.glb --ignore UNUSED_OBJECT --limit 30
```

Review every checkpoint after export: back-plaza reveal, promenade centerline,
cascade court, crowd pit, basin edge, and VIP terrace.
