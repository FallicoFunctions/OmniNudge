# Diagnostic material highlight only: existing body faces, no geometry edits.
from pathlib import Path
import bpy,json,sys
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_bodies import OUT,review
bpy.ops.wm.open_mainfile(filepath=str(OUT/'male-outfit03.blend'))
scene=bpy.context.scene;scene.frame_set(1);bpy.context.view_layer.update()
body=bpy.data.objects['AvatarBody']
report=json.loads((OUT/'male-outfit03-self-intersection-check.json').read_text())
row=next(r for r in report['poses'] if r['frame']==1 and r['mesh']=='AvatarBody')
faces={i for pair in row['underarm_example_polygon_pairs'] for i in pair}
for o in bpy.data.objects:
 if o.type=='MESH':o.hide_render=o!=body
clay=bpy.data.materials.new('Diagnostic gray');clay.diffuse_color=(.45,.5,.55,1);clay.use_nodes=True;clay.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.45,.5,.55,1)
red=bpy.data.materials.new('Confirmed crossing face');red.diffuse_color=(.8,.018,.005,1);red.use_nodes=True;red.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.8,.018,.005,1)
body.data.materials.clear();body.data.materials.append(clay);body.data.materials.append(red)
for p in body.data.polygons:p.material_index=1 if p.index in faces else 0
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.38;camera.location=(.48,.8,1.35);review.look_at(camera,Vector((.13,0,1.35)))
scene.render.resolution_x=800;scene.render.resolution_y=800
scene.render.filepath=str(OUT/'male-outfit03-body-underarm-diagnostic.png');bpy.ops.render.render(write_still=True)
