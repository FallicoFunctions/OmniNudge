import bpy,sys,json,hashlib
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from refine_complete_foil_finish import geometry_contract
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'face-tone-pass'
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
for i,label in enumerate(['mesh positions/topology/UVs/weights/morphs','object transforms/parents','rest bones','animation curves']):assert old[i]==new[i],label+' changed'
for name,digest in old[4].items():assert new[4][name]==digest,name+' source image changed'
added=set(new[4])-set(old[4]);assert len(added)==2,added
record={'unchangedMeshContracts':len(old[0]),'unchangedObjectTransformsAndParents':len(old[1]),'unchangedRestBones':len(old[2]),'unchangedActions':len(old[3]),'retainedPackedImages':len(old[4]),'addedEditableBakeImages':sorted(added),'previousMotionChecksRemainApplicable':True}
(d/'native-preservation.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
