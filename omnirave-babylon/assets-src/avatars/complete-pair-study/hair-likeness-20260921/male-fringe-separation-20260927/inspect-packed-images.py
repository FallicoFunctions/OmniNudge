import bpy,hashlib,json
from pathlib import Path
f=Path.cwd()/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-fringe-separation-20260927'
def images():
 return {im.name:{'path':im.filepath,'packs':[(p.filepath,hashlib.sha256(p.packed_file.data).hexdigest()) for p in im.packed_files]} for im in bpy.data.images}
bpy.ops.wm.open_mainfile(filepath=str(f/'before/male-hair-refined.blend'));old=images()
bpy.ops.wm.open_mainfile(filepath=str(f.parent/'male-hair-refined.blend'));new=images()
diff={k:{'before':old.get(k),'after':new.get(k)} for k in old.keys()|new.keys() if old.get(k)!=new.get(k)}
(f/'image-path-audit.json').write_text(json.dumps(diff,indent=2)+'\n');print(json.dumps(diff,indent=2),flush=True)
