import bpy,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array,review
from refine_complete_foil_finish import geometry_contract
from refine_female_face_contour import apply_to_body,warp
from audit_complete_expressions import set_pose
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'lip-volume-pass';b=d/'before'
# Rebuild the body from its undeformed source; never stack the previous field.
bpy.ops.wm.open_mainfile(filepath=str(p/'before/female-runtime.blend'))
names=['AvatarBody','AvatarEyebrows','AvatarEyelashes']
base_meshes={name:{'positions':array(bpy.data.objects[name]).copy(),'keys':{k.name:np.array([v.co[:] for v in k.data]) for k in bpy.data.objects[name].data.shape_keys.key_blocks}} for name in names}
basebody=bpy.data.objects['AvatarBody'];baseline=array(basebody).copy()
baseline_keys={k.name:np.array([v.co[:] for v in k.data]) for k in basebody.data.shape_keys.key_blocks}
baseline_polys=[list(poly.vertices) for poly in basebody.data.polygons]
bpy.ops.wm.open_mainfile(filepath=str(b/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
body=bpy.data.objects['AvatarBody'];before=array(body).copy()
other={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in names}
oldspec=json.loads((b/'female-native-validation.json').read_text())['faceContour']['spec']
assert np.array_equal(before,warp(baseline,oldspec).astype(np.float32)), 'Unexpected body changes since the preceding face pass'
assert baseline_polys==[list(poly.vertices) for poly in body.data.polygons]
oldkeys=baseline_keys
for key in body.data.shape_keys.key_blocks:
 expected=warp(oldkeys[key.name],oldspec)
 if key.name=='Expression_Smile':expected=before+(expected-before)*oldspec['smileScale']
 assert np.array_equal(np.array([v.co[:] for v in key.data]),expected.astype(np.float32))
previous=before.copy();before=baseline
companion_before={name:array(bpy.data.objects[name]).copy() for name in names[1:]}
for name in names[1:]:
 assert np.array_equal(companion_before[name],warp(base_meshes[name]['positions'],oldspec).astype(np.float32))
 for key in bpy.data.objects[name].data.shape_keys.key_blocks:
  assert np.array_equal(np.array([v.co[:] for v in key.data]),warp(base_meshes[name]['keys'][key.name],oldspec).astype(np.float32))
scene=bpy.context.scene
# Fixed comparison views with the same current hair and expression.
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.31
scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
eye=array(bpy.data.objects['AvatarIris_l'],True).mean(0)
target=Vector((0,-.075,float(eye[2]-.024)))
def render(label,view='front'):
 cam.location=target+Vector({'front':(0,-4,.015),'oblique':(2,-3,.015),'profile':(4,0,.015)}[view]);review.look_at(cam,target)
 scene.render.filepath=str(d/(label+'.png'));bpy.ops.render.render(write_still=True)
# Measure attachment distances before authoring against the posed skin.
def attachment_gaps():
 points=array(body,True)
 evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
 tree=BVHTree.FromPolygons(points.tolist(),[t.vertices[:] for t in mesh.loop_triangles],all_triangles=True);evaluated.to_mesh_clear()
 return {name:np.array([tree.find_nearest(Vector(v))[3] for v in array(bpy.data.objects[name],True)]) for name in names[1:]}
attachment_poses={'neutral':{},'closed':{'Expression_BlinkLeft':1,'Expression_BlinkRight':1},'curious':{'Expression_BrowLift':1},'closed-curious':{'Expression_BlinkLeft':1,'Expression_BlinkRight':1,'Expression_BrowLift':1},'left-wink':{'Expression_BlinkLeft':1},'right-wink':{'Expression_BlinkRight':1}}
old_gaps={}
for label,values in attachment_poses.items():set_pose(values);old_gaps[label]=attachment_gaps()
rig.data.pose_position='REST';set_pose({})
for key in body.data.shape_keys.key_blocks:key.data.foreach_set('co',oldkeys[key.name].astype(np.float32).ravel())
body.data.vertices.foreach_set('co',baseline.astype(np.float32).ravel());body.data.update()
for name in names[1:]:
 ob=bpy.data.objects[name]
 for key in ob.data.shape_keys.key_blocks:key.data.foreach_set('co',base_meshes[name]['keys'][key.name].astype(np.float32).ravel())
 ob.data.vertices.foreach_set('co',base_meshes[name]['positions'].astype(np.float32).ravel());ob.data.update()
record=apply_to_body(body)
assert other=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in names}
after=array(body);assert np.array_equal(after,warp(before).astype(np.float32))
protected=(before[:,2]>=1.652)|(before[:,2]<=1.47)
assert np.array_equal(before[protected],after[protected])
for k in body.data.shape_keys.key_blocks:
 actual=np.array([v.co[:] for v in k.data]);expected=warp(oldkeys[k.name])
 if k.name=='Expression_Smile':expected=after+(expected-after)*record['spec']['smileScale']
 assert np.array_equal(actual,expected.astype(np.float32))
 if 'Blink' in k.name or 'Brow' in k.name:
  delta=actual-after;old=oldkeys[k.name]-before
  assert np.max(abs(delta[protected]-old[protected]))<2e-7
revision_protected=(before[:,2]>=1.575)|(before[:,2]<=1.50)
assert np.array_equal(after[revision_protected],previous[revision_protected])

body.data.calc_loop_triangles();ids=np.array([t.vertices[:] for t in body.data.loop_triangles])
def normals(v):
 tri=v[ids];cross=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);length=np.linalg.norm(cross,axis=1)
 return cross/np.maximum(length[:,None],1e-15),length
n0,l0=normals(before);n1,l1=normals(after);valid=l0>1e-10
assert np.min((n0*n1).sum(1)[valid])>.90
assert np.min(l1[valid]/l0[valid])>.55
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
poses={'neutral':{},'curious':{'Expression_BrowLift':1},'left-wink':{'Expression_BlinkLeft':1},'right-wink':{'Expression_BlinkRight':1},'half-blink':{'Expression_BlinkLeft':.5,'Expression_BlinkRight':.5},'closed':{'Expression_BlinkLeft':1,'Expression_BlinkRight':1},'closed-curious':{'Expression_BlinkLeft':1,'Expression_BlinkRight':1,'Expression_BrowLift':.8},'smile':{'Expression_Smile':.85,'Expression_BrowLift':.15},'full-smile':{'Expression_Smile':1},'closed-smile':{'Expression_Smile':1,'Expression_BlinkLeft':1,'Expression_BlinkRight':1}}
rows={}
for label,values in poses.items():
 set_pose(values);q=array(body,True);assert np.isfinite(q).all()
 # Evaluate iris occlusion against the actual deformed eyelid surface.
 mesh=body.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh();mesh.calc_loop_triangles();tri=[t.vertices[:] for t in mesh.loop_triangles]
 tree=BVHTree.FromPolygons(q.tolist(),tri,all_triangles=True)
 body.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
 cover={}
 for side in ['l','r']:
  iris=array(bpy.data.objects['AvatarIris_'+side],True);hidden=0
  for point in iris:
   hit=tree.ray_cast(Vector((point[0],-1,point[2])),Vector((0,1,0)),2)[0]
   if hit is not None and hit.y<point[1]-.0001:hidden+=1
  cover[side]=hidden/len(iris)
 if label.startswith('closed'):assert min(cover.values())>.95,(label,cover)
 # Combined relative shape interpolation remains close to the same continuous field.
 old=before.copy();new=after.copy()
 for name,value in values.items():
  old+=(oldkeys[name]-before)*value*(record['spec']['smileScale'] if name=='Expression_Smile' else 1)
  new+=(np.array([v.co[:] for v in body.data.shape_keys.key_blocks[name].data])-after)*value
 error=float(np.linalg.norm(new-warp(old),axis=1).max()*1000);assert error<.35,error
 rows[label]={'irisCoverage':cover,'combinedFieldErrorMm':error}
 if label in ['smile','closed','curious']:render('after-'+label)
attachment_rows={}
for label,values in attachment_poses.items():
 set_pose(values);gaps=attachment_gaps();attachment_rows[label]={}
 for name in names[1:]:
  drift=float(np.max(abs(gaps[name]-old_gaps[label][name]))*1000)
  assert drift<.7,(label,name,drift)
  attachment_rows[label][name]={'maximumNearestSkinDistanceChangeMm':drift,'minimumSkinDistanceMm':float(gaps[name].min()*1000),'maximumSkinDistanceMm':float(gaps[name].max()*1000)}
record['facialAttachments']=attachment_rows
for name in names[1:]:
 ob=bpy.data.objects[name];base=base_meshes[name]['positions'];actual=array(ob)
 assert np.array_equal(actual,warp(base).astype(np.float32))
 for key in ob.data.shape_keys.key_blocks:
  assert np.array_equal(np.array([v.co[:] for v in key.data]),warp(base_meshes[name]['keys'][key.name]).astype(np.float32))
 record['companionRevisions'][name]['maximumRevisionDisplacementMm']=float(np.linalg.norm(actual-companion_before[name],axis=1).max()*1000)
set_pose({})
for view in ['front','oblique','profile']:render('after-'+view,view)
record.update(revisionProtectedVertices=int(revision_protected.sum()),changedFromPreviousVertices=int(np.any(previous!=after,axis=1).sum()),maximumRevisionDisplacementMm=float(np.linalg.norm(after-previous,axis=1).max()*1000),unchangedOtherMeshContracts=len(other),protectedBodyVertices=int(protected.sum()),minimumTriangleNormalDot=float((n0*n1).sum(1)[valid].min()),minimumTriangleAreaRatio=float((l1[valid]/l0[valid]).min()),poses=rows)
(d/'native-face-contour-validation.json').write_text(json.dumps(record,indent=2)+'\n')
native=json.loads((b/'female-native-validation.json').read_text());native['faceContour']=record;assert native['preservedNonHairMeshes']>0
(p/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
# Compare the shape without pigment, roughness or normal-map cues.
retained_material=body.data.materials[0]
clay=bpy.data.materials.new('Temporary face inspection clay');clay.use_nodes=True
bsdf=clay.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.32,.32,.32,1);bsdf.inputs['Roughness'].default_value=.8
body.data.materials[0]=clay
for view in ['front','oblique']:render('after-clay-'+view,view)
body.data.materials[0]=retained_material;bpy.data.materials.remove(clay)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(p/'female-hair-refined.blend'),compress=True)
print('FACE_CONTOUR',json.dumps(record),flush=True)
