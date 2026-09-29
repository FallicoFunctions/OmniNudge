"""Export isolated body/wardrobe probes, never public gameplay replacements."""
from pathlib import Path
import bpy,bmesh,sys,json,math,argparse
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_bodies import OUT,pose
parser=argparse.ArgumentParser();parser.add_argument('sex',choices=['male','female']);parser.add_argument('--version',choices=['body02','body03'],default='body02')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);sex=args.sex;version=args.version;review_version=version.replace('body','review')
output=OUT/f'{sex}-{version}.glb'
if output.exists():raise FileExistsError(output)
bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{version}.blend'))
rig=bpy.data.objects['AvatarSkeleton'];body=bpy.data.objects['AvatarBody'];scene=bpy.context.scene
# Fit real shoulder straps and armholes; the old options ended below shoulders.
# Body <-> top clearance is 6 mm, with inherited deform weights on each vertex.
# Continuous body topology remains untouched when the removable shell is cut.
def make_top(name,cropped):
 old=bpy.data.objects.get(name)
 if old:bpy.data.objects.remove(old,do_unlink=True)
 obj=body.copy();obj.data=body.data.copy();obj.name=name;scene.collection.objects.link(obj)
 height=max(v.co.z for v in body.data.vertices)
 shoulder=(rig.data.bones['upperarm_l'].head_local.z+rig.data.bones['upperarm_r'].head_local.z)*.5
 bottom=height*(.68 if cropped else .59)
 bm=bmesh.new();bm.from_mesh(obj.data);bm.normal_update()
 remove=[]
 for face in bm.faces:
  c=face.calc_center_median();x,y,z=c
  collar=abs(x)<.075 and z>shoulder-.025
  # Open an actual sleeveless armhole around the armpit; a capped sleeve
  # trapped the cloth between upper arm and torso during transitions.
  armhole=((abs(x)-.23)/.105)**2+((z-(shoulder-.03))/.15)**2<1
  if z<bottom or z>shoulder+.065 or abs(x)>.21 or collar or armhole:remove.append(face)
 bmesh.ops.delete(bm,geom=remove,context='FACES')
 unused=[v for v in bm.verts if not v.link_faces]
 bmesh.ops.delete(bm,geom=unused,context='VERTS');bm.normal_update()
 for v in bm.verts:v.co+=v.normal*.006
 # Smooth the cut hem/collar loops, then recover their 6 mm surface clearance.
 boundary=[v for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
 for _ in range(3):
  updates={}
  for v in boundary:
   neighbors=[e.other_vert(v) for e in v.link_edges if e.is_boundary]
   if len(neighbors)==2:updates[v]=v.co*.5+(neighbors[0].co+neighbors[1].co)*.25
  for v,q in updates.items():v.co=q
 surface=BVHTree.FromPolygons([v.co for v in body.data.vertices],[list(f.vertices) for f in body.data.polygons])
 for v in boundary:
  hit,normal,_,_=surface.find_nearest(v.co)
  v.co=hit+normal*.006
 bm.to_mesh(obj.data);bm.free();obj.data.update()
 for f in obj.data.polygons:f.use_smooth=True
 for mod in list(obj.modifiers):
  if mod.type!='ARMATURE':obj.modifiers.remove(mod)
 solid=obj.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.001;solid.offset=1
 # Bake thickness before skinning so both cloth surfaces participate in fitting.
 bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 bpy.ops.object.modifier_move_to_index(modifier=solid.name,index=0)
 bpy.ops.object.modifier_apply(modifier=solid.name)
 mat=bpy.data.materials.new(name+' prototype fabric');mat.diffuse_color=(.12,.28,.33,1);mat.use_nodes=True
 mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.12,.28,.33,1)
 mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
 obj.data.materials.clear();obj.data.materials.append(mat)
make_top('AvatarTop_ribbed-tank',False);make_top('AvatarTop_mesh-crop',True)
# Correct garment intersections in the actual five-pose deformation envelope.
# Invert each vertex's blended skin matrix to bring pose-space clearance back
# into editable rest coordinates; never delete or mask the body to hide a fit.



# A small diagnostic action cycles through actual deforming skeleton poses.
# These probes are not certified locomotion or authored dance clips.
poses={}
for name in ['relaxed','tpose','reach','crouch','step']:
 pose(rig,name)
 ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh();floor=min((body.matrix_world@v.co).z for v in m.vertices);ev.to_mesh_clear()
 rig.pose.bones['Root'].location.z-=floor
 bpy.context.view_layer.update()
 poses[name]={b.name:(b.location.copy(),b.rotation_quaternion.copy(),b.scale.copy()) for b in rig.pose.bones}
 # matrix assignment uses quaternion mode only after explicit conversion.
 for b in rig.pose.bones:
  b.rotation_mode='QUATERNION'
  loc,rot,scale=b.matrix_basis.decompose();poses[name][b.name]=(loc,rot,scale)
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
rig.animation_data_create();action=bpy.data.actions.new('Body joint test');rig.animation_data.action=action
frames=[(1,'relaxed'),(31,'tpose'),(61,'reach'),(91,'crouch'),(121,'step'),(151,'relaxed')]
for frame,name in frames:
 for b in rig.pose.bones:
  b.location,b.rotation_quaternion,b.scale=poses[name][b.name]
  for channel in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=channel,frame=frame,group=b.name)
scene.frame_start=1;scene.frame_end=151;scene.render.fps=30;scene.frame_set(1)
# Include interpolated motion: clean key poses alone missed shoulder clipping.
fit_history=[]
names=['AvatarTop_ribbed-tank','AvatarTop_mesh-crop','AvatarBottoms_tech-joggers']
# Fit the same visible/evaluated objects that will be saved and exported.
for ob in bpy.data.objects:
 ob.hide_set(False);ob.hide_viewport=False
bpy.context.view_layer.update()
original={name:[v.co.copy() for v in bpy.data.objects[name].data.vertices] for name in names}
for iteration in range(12):
 count=0;max_depth=0
 for frame in range(1,152):
  scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();tree=BVHTree.FromObject(body,dg)
  transforms={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
  for name in names:
   ob=bpy.data.objects[name];disabled=[m for m in ob.modifiers if m.type!='ARMATURE' and m.show_viewport]
   for m in disabled:m.show_viewport=False
   bpy.context.view_layer.update();ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();points=[v.co.copy() for v in mesh.vertices];ev.to_mesh_clear()
   assert len(points)==len(ob.data.vertices)
   for i,q in enumerate(points):
    hit,normal,_,_=tree.find_nearest(q);signed=(q-hit).dot(normal)
    if signed>=.0015:continue
    vertex=ob.data.vertices[i];weights=[(ob.vertex_groups[g.group].name,g.weight) for g in vertex.groups if ob.vertex_groups[g.group].name in transforms and g.weight>0];total=sum(w for _,w in weights)
    if not total:continue
    skin=Matrix(((0,0,0,0),)*4)
    for name_b,w in weights:skin+=transforms[name_b]*(w/total)
    delta=skin.to_3x3().inverted_safe()@(normal*(.0025-signed))
    target=vertex.co+delta
    # The body03 female hip needs more ease than the inherited tight trouser shell.
    # Keep the larger allowance restricted to trousers on this body candidate.
    limit=.040 if version=='body03' and sex=='female' and name=='AvatarBottoms_tech-joggers' else .030
    if (target-original[name][i]).length>limit:continue
    vertex.co=target;count+=1;max_depth=max(max_depth,-signed)
   ob.data.update()
   for m in disabled:m.show_viewport=True
 fit_history.append({'iteration':iteration,'adjusted_vertices_across_poses':count,'deepest_initial_penetration_m':max_depth})
 if count==0:break
(OUT/(f'{sex}-garment-fit.json' if version=='body02' else f'{sex}-{version}-garment-fit.json')).write_text(json.dumps(fit_history,indent=2)+'\n')
scene.frame_set(1);bpy.context.view_layer.update()
# Fixed-body export carries independently skinned tops and bottoms, no shoes.
# Complete feet must be visible when body-only is selected.
keep={'AvatarBody','AvatarEye_l','AvatarEye_r','AvatarIris_l','AvatarIris_r','AvatarPupil_l','AvatarPupil_r','AvatarEyebrows','AvatarEyelashes','AvatarTop_ribbed-tank','AvatarTop_mesh-crop','AvatarBottoms_tech-joggers'}
for obj in list(bpy.data.objects):
 if obj.type=='MESH' and obj.name not in keep:bpy.data.objects.remove(obj,do_unlink=True)
for obj in bpy.data.objects:
 obj.hide_set(False);obj.hide_viewport=False;obj.hide_render=False
 if obj.type=='MESH':
  for mod in obj.modifiers:
   if mod.type=='MASK':mod.show_viewport=False;mod.show_render=False
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
 if obj.type in ['MESH','ARMATURE','EMPTY']:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-{review_version}.blend'),compress=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_skins=True,export_morph=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_optimize_animation_size=True)
(OUT/f'{sex}-{version}-export.json').write_text(json.dumps({'file':output.name,'bytes':output.stat().st_size,'scope':'isolated complete-body, skinned clothing, joint-pose review; not approved gameplay','pose_frames':dict((name,frame-1) for frame,name in frames[:-1]),'animation':'Body joint test','meshes':sorted(o.name for o in bpy.data.objects if o.type=='MESH')},indent=2)+'\n')
print('BODY_REVIEW_EXPORTED',sex,output.stat().st_size)
