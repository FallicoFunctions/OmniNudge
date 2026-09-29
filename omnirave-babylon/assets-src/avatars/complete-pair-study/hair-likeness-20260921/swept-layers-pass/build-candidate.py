import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from refine_reference_hair import PASS,apply_geometry
from refine_female_swept_layers import NAME,shape_swept_layers
from audit_complete_expressions import set_pose
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
p=PASS;d=p/'swept-layers-pass';b=d/'before'
bpy.ops.wm.open_mainfile(filepath=str(b/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
other={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=NAME}
ob=bpy.data.objects[NAME];before=array(ob).copy()
mapping=json.loads((b/'female-vertex-mapping.json').read_text());native=json.loads((b/'female-native-validation.json').read_text())
shape_swept_layers(mapping,native['meshes'],apply_geometry)
assert other=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=NAME}
q=array(ob);selected=native['meshes']['sweptLayers']['selectedCardFirstVertices'];retained=[v for ids in islands(ob) for v in (ids[:2]+ids[32:] if ids[0] in selected else ids)]
assert np.array_equal(before[retained],q[retained])
ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
def areas(v):
 t=v[tri];return np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)*.5
assert not np.any((areas(before)>1e-12)&(areas(q)<1e-14))
native['meshes']['sweptLayers'].update(unchangedOtherMeshContracts=len(other),retainedVertices=len(retained),retainedRootVertices=len(islands(ob))*2,newlyDegenerateTriangles=0)
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1);set_pose({});bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(p/'female-hair-refined.blend'),compress=True)
(p/'female-vertex-mapping.json').write_text(json.dumps(mapping)+'\n');(p/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
(d/'native-swept-layers-build.json').write_text(json.dumps(native['meshes']['sweptLayers'],indent=2)+'\n')
print('SWEPT_LAYERS',json.dumps(native['meshes']['sweptLayers']),flush=True)
scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.52
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
for name,loc in [('front',(0,-3,1.72)),('oblique',(-1.8,-2.1,1.76))]:
 cam.location=loc;review.look_at(cam,Vector((-.025,.005,1.65)));scene.render.filepath=str(d/('after-'+name+'.png'));bpy.ops.render.render(write_still=True)
