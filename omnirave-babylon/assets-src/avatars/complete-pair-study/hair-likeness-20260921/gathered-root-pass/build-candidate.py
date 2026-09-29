import bpy,sys,json,hashlib,numpy as np
from pathlib import Path
from mathutils import Vector
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from refine_reference_hair import PASS,apply_geometry
from refine_female_gathered_root import recess_connector,NAME,CARRIER
from audit_complete_expressions import set_pose
from refine_complete_foil_finish import geometry_contract
p=PASS;d=p/'gathered-root-pass';b=d/'before'
bpy.ops.wm.open_mainfile(filepath=str(b/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
other={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in [NAME,CARRIER]}

def geometry_without_uv(ob):
 h=hashlib.sha256();h.update(array(ob).tobytes());h.update(np.array([v.normal[:] for v in ob.data.vertices]).tobytes())
 h.update(repr([tuple(f.vertices) for f in ob.data.polygons]).encode());h.update(repr([[(g.group,g.weight) for g in v.groups] for v in ob.data.vertices]).encode())
 if ob.data.shape_keys:
  for k in ob.data.shape_keys.key_blocks:h.update(np.array([v.co[:] for v in k.data]).tobytes())
 return h.hexdigest()
carrier_before=geometry_without_uv(bpy.data.objects[CARRIER])

ob=bpy.data.objects[NAME];before=array(ob).copy();shapes={k.name:np.array([v.co[:] for v in k.data]) for k in ob.data.shape_keys.key_blocks} if ob.data.shape_keys else {}
mapping=json.loads((b/'female-vertex-mapping.json').read_text());native=json.loads((b/'female-native-validation.json').read_text())
recess_connector(mapping,native['meshes'],apply_geometry)
assert other=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in [NAME,CARRIER]}
assert carrier_before==geometry_without_uv(bpy.data.objects[CARRIER])
q=array(ob);drift=0
if ob.data.shape_keys:
 for k in ob.data.shape_keys.key_blocks:
  after=np.array([v.co[:] for v in k.data]);drift=max(drift,float(np.max(abs((after-q)-(shapes[k.name]-before)))))
assert drift<3e-7
ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
def area(v):
 t=v[tri];return np.linalg.norm(np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]),axis=1)*.5
assert not np.any((area(before)>1e-12)&(area(q)<1e-14))
record=native['meshes']['gatheredRoot'];record.update(unchangedOtherMeshContracts=len(other),carrierGeometryContract=carrier_before,unchangedContracts=other,maximumRelativeShapeDeltaChangeMm=drift*1000,newlyDegenerateTriangles=0)
scene=bpy.context.scene;cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.52
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({});bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(p/'female-hair-refined.blend'),compress=True)
(p/'female-vertex-mapping.json').write_text(json.dumps(mapping)+'\n');(p/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
(d/'native-gathered-root-validation.json').write_text(json.dumps(record,indent=2)+'\n')
print('GATHERED_ROOT',json.dumps({k:v for k,v in record.items() if k!='unchangedContracts'}),flush=True)
for name,loc in [('front',(0,-3,1.72)),('oblique',(-1.8,-2.1,1.76)),('profile',(3,0,1.72))]:
 cam.location=loc;review.look_at(cam,Vector((-.025,.005,1.65)));scene.render.filepath=str(d/('after-'+name+'.png'));bpy.ops.render.render(write_still=True)
cam.data.ortho_scale=.30;scene.render.resolution_x=scene.render.resolution_y=700
cam.location=(3,0,1.75);review.look_at(cam,Vector((-.015,.012,1.72)));scene.render.filepath=str(d/'after-close-profile.png');bpy.ops.render.render(write_still=True)
