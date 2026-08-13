# Main Stage Source Rules

- Blender units: metric, scale 1.0
- Forward: -Y, Up: Z
- Runtime export names:
  - `main-stage.glb`
  - `main-stage-collision.glb`
- Do not model the venue as code-driven primitive shells
- The approved reference pack and approved concept images remain the authority

## Before running generator/replace/apply scripts

Every `scripts/generate-*.py`, `scripts/replace-*.py`, and `scripts/apply-*.py`
script opens `main-stage.blend`, edits it, and overwrites it in place
(`bpy.ops.wm.save_mainfile()`) - there is no undo beyond Blender's own single
`.blend1` auto-backup. `scripts/export-main-stage.sh` already runs a backup
step first, but if you are running one of these generator scripts directly
(not through that wrapper), run this first:

```
scripts/backup-main-stage-blend.sh
```

It copies `main-stage.blend` to a timestamped snapshot under
`assets-src/main-stage/backups/` that you can restore from if a batch of
scripts leaves the file in a bad state.
