# Main Stage PBR Texture Sources

These venue texture maps are sourced from Poly Haven's CC0 library for the Main Stage material fidelity pass.
License: https://polyhaven.com/license

- `marble_01`: https://polyhaven.com/a/marble_01
- `concrete_floor_01`: https://polyhaven.com/a/concrete_floor_01
- `metal_plate`: https://polyhaven.com/a/metal_plate

Downloaded maps use the 1K JPG `Diffuse`, `nor_gl`, and `arm` variants to keep the browser GLB budget controlled. The black and gold diffuse maps are local color-tinted derivatives of the CC0 `metal_plate` diffuse map; they retain the same surface variation while matching the OmniRave production-metal palette.

Regenerate the material bindings from the Babylon package root with:

```sh
'/Applications/Blender.app/Contents/MacOS/Blender' --background assets-src/main-stage/main-stage.blend --python scripts/apply-main-stage-pbr-textures.py
'/Applications/Blender.app/Contents/MacOS/Blender' --background assets-src/main-stage/main-stage.blend --python scripts/export-main-stage.py
```
