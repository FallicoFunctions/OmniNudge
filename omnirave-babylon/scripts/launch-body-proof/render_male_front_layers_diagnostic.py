"""Identify which retained layer creates the blunt male forehead silhouette."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import review
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-front-layer-diagnostic-20260928'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets-src/avatars/complete-pair-study/hair-likeness-20260921/male-hair-refined.blend'))
scene=bpy.context.scene;camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.51
camera.location=(0,-3,1.70);review.look_at(camera,Vector((0,-.02,1.69)))
scene.render.resolution_x=700;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
names=['Complete scalp','Luxury retained swept groom','Polished male rooted hairline','Polished male flyaways','Male layered side strands']
for label,visible in [
    ('complete',names),('no-groom',[n for n in names if n!='Luxury retained swept groom']),
    ('no-underlay',[n for n in names if n!='Polished male rooted hairline']),
    ('no-scalp',[n for n in names if n!='Complete scalp']),
    ('only-groom',['Luxury retained swept groom']),
    ('only-underlay',['Polished male rooted hairline']),
]:
    for n in names:bpy.data.objects[n].hide_render=n not in visible
    scene.render.filepath=str(OUT/f'{label}.png');bpy.ops.render.render(write_still=True)
