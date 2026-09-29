"""Render fixed independent angles of a preserved checkpoint, without resaving it."""
import bpy,sys
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/astra-male-proof'
name=sys.argv[sys.argv.index('--')+1]
if name not in {'study04','pose04','fit05','curl18','face19'}:raise ValueError(f'{name}: checkpoint not retained; see cleanup ledger')
bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{name}.blend'))
scene=bpy.context.scene;cam=scene.camera;cam.data.ortho_scale=.4;scene.cycles.samples=32
views={'front':((0,-2,1.65),(0,-.05,1.635)),
       'three-quarter':((.85,-2,1.69),(0,-.05,1.635)),
       'profile':((2,-.05,1.65),(0,-.05,1.635))}
for label,(position,target) in views.items():
    cam.location=position;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/'renders'/f'{name}-{label}.png');bpy.ops.render.render(write_still=True)
print('VIEWS_COMPLETE',name)
