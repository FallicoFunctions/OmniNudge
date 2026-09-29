import bpy,sys,json,hashlib,numpy as np
from pathlib import Path
from mathutils import Vector
root=Path.cwd();sys.path.insert(0,str(root/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_complete_foil_finish import geometry_contract
from audit_complete_expressions import POSES,set_pose
from complete_pair_geometry import Surface
p=root/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'earring-pass'
name='PLURR neon ear drops';record=json.loads((d/'native-earring-validation.json').read_text())
def snapshot():
 meshes={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
 transforms={o.name:{'matrix':[list(row) for row in o.matrix_local],'parent':o.parent.name if o.parent else None,'parentType':o.parent_type,'parentBone':o.parent_bone} for o in bpy.context.scene.objects if o.type in ['MESH','ARMATURE']}
 rig=bpy.data.objects['AvatarSkeleton']
 bones=[{'name':b.name,'parent':b.parent.name if b.parent else None,'matrix':[list(row) for row in b.matrix_local],'deform':b.use_deform,'length':b.length} for b in rig.data.bones]
 actions={}
 for action in bpy.data.actions:
  curves=list(action.fcurves) if hasattr(action,'fcurves') else [c for layer in action.layers for strip in layer.strips for bag in strip.channelbags for c in bag.fcurves]
  actions[action.name]=[{'path':c.data_path,'index':c.array_index,'extrapolation':c.extrapolation,'keys':[(list(k.co),list(k.handle_left),list(k.handle_right),k.interpolation,k.easing,k.handle_left_type,k.handle_right_type) for k in c.keyframe_points]} for c in curves]
 images={i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
 return meshes,transforms,bones,actions,images
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'));old=snapshot()
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'));new=snapshot()
assert name not in old[0] and set(new[0])==set(old[0])|{name}
assert all(new[0][key]==value for key,value in old[0].items())
assert set(new[1])==set(old[1])|{name} and all(new[1][key]==value for key,value in old[1].items())
assert old[2:]==new[2:],'Bones, clips or packed images changed'
ob=bpy.data.objects[name];assert ob.get('avatarSlot')=='accessories' and ob.get('avatarOptionId')=='plurr-earrings'
assert len(ob.data.vertices)==record['vertices'] and len(ob.data.polygons)==record['polygons']
assert len(ob.vertex_groups)==1 and ob.vertex_groups[0].name=='head'
assert all(len(v.groups)==1 and abs(v.groups[0].weight-1)<1e-7 for v in ob.data.vertices)
assert len(ob.data.color_attributes['Ear enamel color'].data)==len(ob.data.vertices)
rig=bpy.data.objects['AvatarSkeleton'];body=bpy.data.objects['AvatarBody'];scene=bpy.context.scene;rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
def local():
 inv=(rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()).inverted()
 return np.asarray([list(inv@Vector(q)) for q in array(ob,True)])
baseline=local();posed=array(ob,True)
# The freely hanging portion begins below the original ear-lobe surface.
free=np.where(posed[:,2]<1.564)[0];assert len(free)>20
min_body_gap=float('inf');max_drift=0;movement=[]
for clip in ['idle','walk','run']:
 rig.animation_data.action=bpy.data.actions[clip]
 for frame in np.linspace(*bpy.data.actions[clip].frame_range,9):
  scene.frame_set(int(frame),subframe=float(frame%1));bpy.context.view_layer.update()
  points=array(ob,True);drift=float(np.linalg.norm(local()-baseline,axis=1).max())
  assert np.isfinite(points).all() and drift<.00002,(clip,frame,drift)
  skin=Surface(rig,body)
  gap=min(skin.tree.find_nearest(Vector(point))[3] for point in points[free])
  min_body_gap=min(min_body_gap,gap);max_drift=max(max_drift,drift)
  movement.append({'clip':clip,'frame':float(frame),'minimumFreeDropSkinDistanceMm':float(gap*1000),'maximumHeadRelativeDriftMm':float(drift*1000)})
assert min_body_gap>.002, min_body_gap
rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
expressions=[]
for label,values in POSES.items():
 set_pose(values);drift=float(np.linalg.norm(local()-baseline,axis=1).max())
 assert drift<.00002,(label,drift)
 expressions.append({'pose':label,'maximumHeadRelativeDriftMm':drift*1000})
set_pose({})
out={'unchangedMeshContracts':len(old[0]),'unchangedObjectTransformsAndParents':len(old[1]),'unchangedBones':len(old[2]),'unchangedActions':len(old[3]),'unchangedPackedImages':len(old[4]),'addedMeshes':1,'addedMaterials':1,'addedImages':0,'movementSamples':movement,'expressionPoses':expressions,'minimumFreeDropSkinDistanceMm':min_body_gap*1000,'maximumHeadRelativeDriftMm':max_drift*1000,'scope':'27 sampled idle, walk and run frames, plus named expression poses. Free-drop vertex clearance does not prove arbitrary continuous contact.'}
(d/'native-preservation.json').write_text(json.dumps(out,indent=2)+'\n');print('EARRING_PRESERVED',json.dumps({k:v for k,v in out.items() if k not in ['movementSamples','expressionPoses']}),flush=True)
