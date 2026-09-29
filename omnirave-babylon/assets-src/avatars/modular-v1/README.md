# OmniRave Modular Avatar v1

This directory contains the editable Blender source and review renders for the
first reusable OmniRave humanoid. The protected source export is
`public/assets/avatars/modular-v1/avatar-base.glb`; the current runtime default selects
`public/assets/avatars/modular-v1/avatar-base-editorial.glb`. Classic, Lean, and Fashion exports remain available for explicit previews.

## Contract

- One export root: `AvatarAsset`
- One shared deform skeleton: `AvatarSkeleton`
- One shared-topology body: `AvatarBody`
- Body shape keys: `male`, `female`
- Stable editor slots: `hair`, `top`, `jacket`, `bottoms`, `shoes`, and
  `accessories`
- Every fitted mesh uses the same skeleton and carries the same body shape
  targets when its fit changes between the male and female body shapes.
- Always-on fitted face details: textured eyebrows, eyelashes, eye whites,
  irises, and pupils
- Authored options: all ten editor hair styles, six fitted shoe choices, three
  tops, three jackets, three bottoms, and `gold-hoops`; every slot also has
  `none`
- Until a planned clothing or specialty-shoe option has its own mesh, runtime
  selection retains the fitted starter for that slot instead of exposing the
  body or silently substituting the procedural avatar
- Runtime animation clips: `idle`, `walk`, and `run`

The original and Lean V1 exports remain immutable regression baselines.
Fashion V2 changes only coordinated physiology and fit while retaining the
same skeleton, topology, male/female morph contract, slots, and animation clips.
These revisions are internal authoring profiles; players choose the male or
female body morph and never see Classic/Lean/Fashion as separate body types.

The earlier procedural avatar remains a fallback/prototype. It is not a source
mesh for this character. The fitted shirt, open-front bomber, and joggers are
starter construction meshes proving the modular contract; their final fashion
sculpts can be replaced option-by-option without changing the body, skeleton,
editor API, or saved loadout format.

## Reproducible toolchain

- Blender: 5.1.2
- MPFB: 2.0.17
- MPFB archive:
  `https://extensions.blender.org/download/sha256:4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87/add-on-mpfb-v2.0.17.zip`
- MPFB SHA-256:
  `4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87`
- MakeHuman System Assets CC0 archive:
  `https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip`
- Downloaded system-assets SHA-256:
  `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`

MPFB code is GPL-3.0-or-later. The exported MakeHuman character data and the
system assets used by this build are CC0. Only the generated character data is
shipped with the application; the isolated authoring toolchain lives under the
ignored repository-local `.tooling/` directory.

## Rebuild

From the repository root:

```sh
BLENDER_USER_RESOURCES="$PWD/.tooling/blender-user" \
  /Applications/Blender.app/Contents/MacOS/Blender --background \
  --python omnirave-babylon/scripts/avatar-modular-v1/build_modular_base.py \
  --python-exit-code 1 -- \
  --blend omnirave-babylon/assets-src/avatars/modular-v1/avatar-modular-v1.blend \
  --glb omnirave-babylon/public/assets/avatars/modular-v1/avatar-base.glb \
  --manifest omnirave-babylon/assets-src/avatars/modular-v1/avatar-base-manifest.json
```

The build script verifies the skeleton count, mesh bindings, morph contract,
slot hierarchy, and clean object transforms before export.

After rebuilding, create the browser runtime asset (1024px WebP textures,
stable hierarchy retained) with `npm run avatar:optimize` from
`omnirave-babylon/`.

Validate both body shapes, all fitted regions, the walk clip, and head-bound
hair deformation with:

```sh
BLENDER_USER_RESOURCES="$PWD/.tooling/blender-user" \
  /Applications/Blender.app/Contents/MacOS/Blender --background \
  omnirave-babylon/assets-src/avatars/modular-v1/avatar-modular-v1.blend \
  --python omnirave-babylon/scripts/avatar-modular-v1/validate_modular_deformation.py \
  --python-exit-code 1
```

## Cleanup retention

See `../CLEANUP.md`. The original, Lean V1, Fashion V2, and final editorial V18 authoring sources remain. Superseded V3–V17 binary models and exports were removed; their small reports/captures and historical refinement code remain. Use the retained V18 source as the authoring starting point for further legacy editorial changes.
