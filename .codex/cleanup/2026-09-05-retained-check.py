import bpy,json
from pathlib import Path
root=Path('/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave')
assets=root/'omnirave-babylon/assets-src/avatars'
paths=list((assets/'astra-male-proof').glob('*.blend'))+[assets/'modular-v1/avatar-modular-v1.blend',assets/'modular-v1/lean-v1/avatar-modular-v1-lean.blend',assets/'modular-v1/fashion-v2/avatar-modular-v1-fashion-v2.blend',assets/'modular-v1/fashion-v18/avatar-modular-v1-fashion-v18.blend',assets/'omniavatar-v2/OA_male_luxury_v1.blend',assets/'omniavatar-v2/OA_female_plurr_v1.blend',assets/'omniavatar-v2/OA_male_luxury_v2_work.blend']
checks=[]
for p in paths:
 bpy.ops.wm.open_mainfile(filepath=str(p))
 missing=[]
 for lib in bpy.data.libraries:
  if not lib.packed_file and not Path(bpy.path.abspath(lib.filepath)).exists():missing.append(lib.filepath)
 for image in bpy.data.images:
  if image.source=='FILE' and not image.packed_file and image.filepath and not Path(bpy.path.abspath(image.filepath)).exists():missing.append(image.filepath)
 assert not missing,(str(p),missing)
 checks.append({'path':str(p.relative_to(root)),'opens':True,'missing_libraries_or_images':missing})
(root/'.codex/cleanup/2026-09-05-retained-blends.json').write_text(json.dumps({'passed':True,'checks':checks},indent=2)+'\n')
print('RETAINED_BLENDS_PASS',len(checks))
