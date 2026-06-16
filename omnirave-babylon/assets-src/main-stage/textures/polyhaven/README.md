# Main Stage PBR Texture Sources

These venue texture maps are sourced from Poly Haven's CC0 library for the Main Stage material fidelity pass.
License: https://polyhaven.com/license

- `marble_01`: https://polyhaven.com/a/marble_01
- `concrete_floor_01`: https://polyhaven.com/a/concrete_floor_01
- `metal_plate`: https://polyhaven.com/a/metal_plate

Downloaded maps use the 1K JPG `Diffuse`, `nor_gl`, and `arm` variants to keep the browser GLB budget controlled. The black and gold diffuse maps are local color-tinted derivatives of the CC0 `metal_plate` diffuse map; they retain the same surface variation while matching the OmniRave production-metal palette.

## Canonical Texture Set

Direct downloads from Poly Haven:

- `marble_01_diff_1k.jpg`
- `marble_01_nor_gl_1k.jpg`
- `marble_01_arm_1k.jpg`
- `concrete_floor_01_diff_1k.jpg`
- `concrete_floor_01_nor_gl_1k.jpg`
- `concrete_floor_01_arm_1k.jpg`
- `metal_plate_diff_1k.jpg`
- `metal_plate_nor_gl_1k.jpg`
- `metal_plate_arm_1k.jpg`

Generated locally from `metal_plate_diff_1k.jpg` via `scripts/generate-main-stage-metal-tints.py`:

- `metal_plate_black_diff_1k.jpg`
- `metal_plate_gold_diff_1k.jpg`

Tint endpoints baked by the generator:

- `metal_plate_black_diff_1k.jpg`
  - `shadow=(0.067, 0.067, 0.067)`
  - `highlight=(0.306, 0.275, 0.251)`
- `metal_plate_gold_diff_1k.jpg`
  - `shadow=(0.427, 0.275, 0.086)`
  - `highlight=(0.957, 0.788, 0.443)`

## SHA-256 Checksums

```text
b10dabea976d68baa976a0d4e8dac58789df8d26a1b50697f320106f1b00a229  marble_01_diff_1k.jpg
77c2a9b549a6a408659f8197be91945aeb0abc33e697f1dd2ce24ee8dc7c2bc0  marble_01_nor_gl_1k.jpg
84b1516c27b4393230e77e0aa525186b4a8a415169661a4385f02dcb10c14104  marble_01_arm_1k.jpg
db7c800f1464359b5f359fc743e82ac51b34e014fdfd53844f4af34bb1949229  concrete_floor_01_diff_1k.jpg
28be1f6fa82eeab137c84954bf7ea0f5d8a4434352d01c29f15e20926eb7227e  concrete_floor_01_nor_gl_1k.jpg
44e3a0d18db295998c8af56ecc80095821e719e134974609aa92e5436709dabd  concrete_floor_01_arm_1k.jpg
c6b6739eac2c75ccc898e753d7833df24eafbdb9aa92fb6eabfb92abd1a680a5  metal_plate_diff_1k.jpg
994f851a84d52b51e97906021a1b7070ee6eac9a789fef041132268de47d8e6b  metal_plate_nor_gl_1k.jpg
fc4708b6700a2cc387654b693091dd0ac0cd1797ae803d75c894e62554fbef07  metal_plate_arm_1k.jpg
4afc2a9a5f36c269d507802aa51c7910fa79c7a33a2474899bb862842c99b1ab  metal_plate_black_diff_1k.jpg
963f1dc4bbfdd16cdf7dd09825d2e09be2f89571ebf1910c8b866252a5f02352  metal_plate_gold_diff_1k.jpg
```

## Regeneration Order

Regenerate the V50 texture and export pipeline from the Babylon package root with:

```sh
'/Applications/Blender.app/Contents/MacOS/Blender' --background --python scripts/generate-main-stage-metal-tints.py
'/Applications/Blender.app/Contents/MacOS/Blender' --background assets-src/main-stage/main-stage.blend --python scripts/apply-main-stage-pbr-textures.py
'/Applications/Blender.app/Contents/MacOS/Blender' --background assets-src/main-stage/main-stage.blend --python scripts/export-main-stage.py
```

Then verify:

```sh
CI=1 npm test -- --run --no-file-parallelism src/scene/__tests__/mainStageManifest.test.ts
CI=1 npm test -- --run --no-file-parallelism \
  src/scene/__tests__/mainStageManifest.test.ts \
  src/scene/__tests__/loadMainStageAssets.test.ts \
  src/scene/__tests__/createMainStageScene.test.ts \
  src/scene/__tests__/mainStageMaterialPolish.test.ts \
  src/scene/__tests__/mainStagePresentationRig.test.ts \
  src/scene/__tests__/mainStageProductionSurfaces.test.ts
npm run build
npx --yes @gltf-transform/cli validate public/assets/venues/main-stage/main-stage.glb --ignore UNUSED_OBJECT --limit 30
```
