"""Create two fixed, complete body/wardrobe study masters from retained topology.
Connection map: existing continuous body surface (no joined primitives);
head/neck, shoulder/elbow/wrist and hip/knee/ankle chains retain shared endpoints.
The neutral skeleton is fitted to each frozen body using the corresponding
body vertex displacement field. All wardrobe meshes freeze the same sex/lean
mix. Shoe masks are removed from the authoring body so bare feet remain intact.
No geometry is claimed to be recovered beneath reference clothing.
"""
from pathlib import Path
import argparse,bpy,json,sys,math,hashlib
from mathutils import Vector,Matrix
from mathutils.kdtree import KDTree
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets-src/avatars/launch-body-proof'
sys.path.insert(0,str(ROOT/'scripts/avatar-modular-v1'))
import render_lean_body_review as review

def point_bone(rig,name,direction):
 bpy.context.view_layer.update();pb=rig.pose.bones[name]
 rotation=(pb.tail-pb.head).normalized().rotation_difference(Vector(direction).normalized())
 matrix=(rotation@pb.matrix.to_quaternion()).to_matrix().to_4x4();matrix.translation=pb.head;pb.matrix=matrix
 bpy.context.view_layer.update()

def pose(rig,name):
 rig.animation_data_clear()
 for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
 bpy.context.view_layer.update()
 for side,sgn in [('l',1),('r',-1)]:
  # Bring the stance under the hips for reference comparison.
  point_bone(rig,'thigh_'+side,(0,0,-1));point_bone(rig,'calf_'+side,(0,0,-1))
  if name=='tpose':
   point_bone(rig,'upperarm_'+side,(sgn,0,0));point_bone(rig,'lowerarm_'+side,(sgn,0,0));point_bone(rig,'hand_'+side,(sgn,0,0))
  else:
   point_bone(rig,'upperarm_'+side,(sgn*.10,0,-1));point_bone(rig,'lowerarm_'+side,(sgn*.08,-.10,-1))
 if name=='reach':
  for side,sgn in [('l',1),('r',-1)]:
   point_bone(rig,'upperarm_'+side,(sgn*.35,0,1));point_bone(rig,'lowerarm_'+side,(sgn*.15,-.15,1))
 if name=='crouch':
  for side,sgn in [('l',1),('r',-1)]:
   point_bone(rig,'thigh_'+side,(0,-.72,-.70));point_bone(rig,'calf_'+side,(0,.45,-.90))
 if name=='step':
  point_bone(rig,'thigh_l',(0,-.6,-.8));point_bone(rig,'calf_l',(0,.35,-.94))
  point_bone(rig,'upperarm_r',(-.12,-.45,-.89))
 bpy.context.view_layer.update()

def freeze_mesh(obj):
 if not obj.data.shape_keys:return
 keys=obj.data.shape_keys.key_blocks;basis=keys[0]
 points=[v.co.copy() for v in basis.data]
 for key in keys[1:]:
  if not key.value:continue
  for i,(v,ref) in enumerate(zip(key.data,key.relative_key.data)):
   points[i]+=(v.co-ref.co)*key.value
 obj.shape_key_clear()
 for v,p in zip(obj.data.vertices,points):v.co=p
 obj.data.update()

def lengthen_arms(rig,meshes,gain):
 # Bone-local axial transforms keep each elbow/wrist endpoint connected.
 # Hands keep their dimensions and translate with the extended forearms.
 old={b.name:b.matrix_local.copy() for b in rig.data.bones}
 starts={b.name:b.head_local.copy() for b in rig.data.bones}
 ends={b.name:b.tail_local.copy() for b in rig.data.bones}
 arm_names={f'{part}_{side}' for part in ['upperarm','lowerarm'] for side in ['l','r']}
 offsets={}
 for b in rig.data.bones:
  parent_offset=offsets.get(b.parent.name,Vector()) if b.parent else Vector()
  extra=(ends[b.name]-starts[b.name])*(gain-1) if b.name in arm_names else Vector()
  offsets[b.name]=parent_offset+extra
 bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 for b in rig.data.edit_bones:
  inherited=offsets.get(b.parent.name,Vector()) if b.parent else Vector()
  b.head=starts[b.name]+inherited;b.tail=ends[b.name]+offsets[b.name]
 bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()
 transforms={}
 for b in rig.data.bones:
  scale=Matrix.Diagonal((1,gain if b.name in arm_names else 1,1,1))
  transforms[b.name]=b.matrix_local@scale@old[b.name].inverted()
 for obj in meshes:
  to_rig=rig.matrix_world.inverted()@obj.matrix_world;to_obj=to_rig.inverted()
  for v in obj.data.vertices:
   groups=[(obj.vertex_groups[g.group].name,g.weight) for g in v.groups if obj.vertex_groups[g.group].name in transforms and g.weight>0]
   total=sum(w for _,w in groups)
   if total<=0:continue
   q=to_rig@v.co;dest=sum(((transforms[n]@q)*w for n,w in groups),Vector())/total
   v.co=to_obj@dest
  obj.data.update()

def build(sex,version,arm_gain):
 source=ROOT/'assets-src/avatars/modular-v1/fashion-v18/avatar-modular-v1-fashion-v18.blend'
 final=OUT/f'{sex}-{version}.blend'
 if final.exists():raise FileExistsError(final)
 bpy.ops.wm.open_mainfile(filepath=str(source));bpy.context.preferences.filepaths.save_version=0
 rig=bpy.data.objects['AvatarSkeleton'];rig.animation_data_clear()
 for b in rig.pose.bones:b.matrix_basis=Matrix.Identity(4)
 for ob in bpy.data.objects:
  ob.animation_data_clear()
  if ob.type=='MESH' and ob.data.shape_keys:ob.data.shape_keys.animation_data_clear()
 review.set_morph(sex,1)
 body=bpy.data.objects['AvatarBody'];neutral=[v.co.copy() for v in body.data.shape_keys.key_blocks[0].data]
 for mod in list(body.modifiers):
  if mod.type=='MASK':body.modifiers.remove(mod)
 meshes=[o for o in bpy.data.objects if o.type=='MESH']
 topo={o.name:[len(o.data.vertices),len(o.data.polygons)] for o in meshes}
 for obj in meshes:freeze_mesh(obj)
 target=[v.co.copy() for v in body.data.vertices]
 kd=KDTree(len(neutral))
 for i,v in enumerate(neutral):kd.insert(v,i)
 kd.balance()
 def shift(p):
  # Smooth extension of corresponding surface displacement into joint centers.
  near=kd.find_n(p,32);weights=[1/(.015+d)**2 for _,_,d in near];total=sum(weights)
  return sum(((target[i]-neutral[i])*w for (_,i,_),w in zip(near,weights)),Vector())/total
 old={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in rig.data.bones}
 bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 joints=[]
 for b in rig.data.edit_bones:
  h,t=old[b.name]
  if b.name=='Root':continue
  dh,dt=shift(h),shift(t);b.head=h+dh;b.tail=t+dt
  joints.append({'bone':b.name,'head_delta_m':dh.length,'tail_delta_m':dt.length})
 bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()
 assert all([len(o.data.vertices),len(o.data.polygons)]==topo[o.name] for o in meshes)
 lengthen_arms(rig,meshes,arm_gain)
 # Neutral full-body comparisons and localized joint checks use this fitted rig.
 pose(rig,'relaxed')
 selected={'male':{'hair':'textured-crop','top':'ribbed-tank','jacket':'bomber','bottoms':'tech-joggers','shoes':'high-tops','accessories':'gold-hoops'},'female':{'hair':'high-pony','top':'mesh-crop','jacket':'cropped-puffer','bottoms':'tech-joggers','shoes':'chunky-sneakers','accessories':'gold-hoops'}}[sex]
 for slot,option in selected.items():review.set_option(slot,option)
 camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=2.1
 scene=bpy.context.scene;scene.render.resolution_x=768;scene.render.resolution_y=896
 scene['launchBodyStudy']={'character':sex,'referenceBodyMatch':'PENDING','faceAcceptance':'PENDING','rigFit':'surface-displacement initialization; deformation review required','wardrobe':'inherited prototype options; not approved reference outfits'}
 # Authoring copy keeps all prototype wardrobe modules and complete anatomy.
 bpy.ops.wm.save_as_mainfile(filepath=str(final),compress=True)
 report={'character':sex,'source':str(source.relative_to(ROOT)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'body_vertices':len(body.data.vertices),'body_polygons':len(body.data.polygons),'topology_unchanged':True,'bone_count':len(rig.data.bones),'removed_body_masks':6,'joint_fit':joints,'poses':{},'reference_body_match':'PENDING','face_acceptance':'PENDING','arm_length_gain':arm_gain}
 clay=bpy.data.materials.new('BodyReviewClay');clay.use_nodes=True;bs=clay.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(.3,.34,.38,1);bs.inputs['Roughness'].default_value=.8
 scene.view_layers[0].material_override=clay
 for obj in bpy.data.objects:
  if obj.type=='MESH':obj.hide_render=obj.name not in ['AvatarBody','AvatarEye_l','AvatarEye_r']
 for name in ['relaxed','tpose','reach','crouch','step']:
  pose(rig,name);ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();pts=[body.matrix_world@v.co for v in mesh.vertices]
  assert len(pts)==len(body.data.vertices) and all(math.isfinite(x) for v in pts for x in v)
  bounds=[[min(v[i] for v in pts),max(v[i] for v in pts)] for i in range(3)]
  ev.to_mesh_clear();report['poses'][name]={'bounds':bounds,'finite':True,'full_vertex_count':len(pts)}
  views={'front':(0,-4,.93),'profile':(4,0,.93)} if name in ['relaxed','tpose'] else {'three-quarter':(2,-4,.93)}
  for view,xyz in views.items():
   camera.location=xyz;review.look_at(camera,Vector((0,0,.93)))
   scene.render.filepath=str(OUT/f'{sex}-{version}-{name}-{view}.png');bpy.ops.render.render(write_still=True)
 (OUT/f'{sex}-{version}.json').write_text(json.dumps(report,indent=2)+'\n')
 print('BODY_MASTER_CREATED',sex,report['body_vertices'],len(joints))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('sex',choices=['male','female']);parser.add_argument('--version',default='body02',choices=['body01','body02']);parser.add_argument('--arm-gain',type=float,default=1.12)
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);assert 1<=args.arm_gain<=1.2;build(args.sex,args.version,args.arm_gain)
