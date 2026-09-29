# Connection map: continuous torso/sleeves reconstructed as one surface;
# cuffs, neck, hem and front are intentional garment openings. Inner and outer
# walls share a closed 1 mm rim. Shirt-to-coat gap is intentional layer clearance.
import bpy,bmesh,sys,math,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
sys.path.insert(0,str(Path(__file__).resolve().parent))
from surface_crossings import strict_pairs,crossing
P=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof'
STEM='male-outfit04'
bpy.ops.wm.open_mainfile(filepath=str(P/'male-top01.blend'));scene=bpy.context.scene;scene.frame_set(31);bpy.context.view_layer.update();body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton']
ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles();bp=[v.co.copy() for v in me.vertices];bn=[v.normal.copy() for v in me.vertices];bt=[tuple(t.vertices) for t in me.loop_triangles];ev.to_mesh_clear()
surface=BVHTree.FromPolygons(bp,bt,all_triangles=True);skin={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
weights=[{body.vertex_groups[g.group].name:g.weight for g in v.groups if body.vertex_groups[g.group].name in skin} for v in body.data.vertices]
shoulder=rig.pose.bones['upperarm_l'].head.z;hem=rig.pose.bones['pelvis'].head.z-.025

def cloth_ease(p,n):
 # Keep the compressed inner sleeve and torso side thin; retain satin volume
 # on the visible outer sleeve and front/back panels.
 arm=max(0,min(1,(abs(p.x)-.14)/.09))
 inner=max(0,min(1,(-n.z-.1)/.6))*arm
 side=max(0,min(1,(abs(n.x)-.25)/.55))*(1-arm)
 return .020*(1-inner-side)+.004*inner+.014*side

def build(label,offset,sleeved):
 scene.frame_set(31);bpy.context.view_layer.update()
 mesh=bpy.data.meshes.new(label);mesh.from_pydata([p+n*cloth_ease(p,n) for p,n in zip(bp,bn)],[],bt);mesh.update();ob=bpy.data.objects.new(label,mesh);scene.collection.objects.link(ob)
 bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
 mesh.remesh_voxel_size=.004;mesh.use_remesh_preserve_volume=True;bpy.ops.object.voxel_remesh()
 smooth=ob.modifiers.new('Smooth cloth surface','SMOOTH');smooth.factor=.5;smooth.iterations=3;bpy.ops.object.modifier_apply(modifier=smooth.name)
 dec=ob.modifiers.new('Cloth triangle budget','DECIMATE');dec.ratio=.12;bpy.ops.object.modifier_apply(modifier=dec.name)
 bm=bmesh.new();bm.from_mesh(ob.data)
 def cut(point,normal,outer):
  bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=point,plane_no=normal,clear_outer=outer,clear_inner=not outer)
 cut((0,0,hem if sleeved else hem-.04),(0,0,1),False)
 # Isolate the head above the neckline without cutting the shoulder caps.
 neckline=shoulder+.105 if sleeved else shoulder+.065
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,0,neckline),plane_no=(0,0,1))
 above={f for f in bm.faces if f.calc_center_median().z>neckline+1e-6}
 head={max(above,key=lambda f:f.calc_center_median().z)};front=set(head)
 while front:
  front={neighbor for f in front for e in f.edges for neighbor in e.link_faces if neighbor in above and neighbor not in head}
  head.update(front)
 bmesh.ops.delete(bm,geom=list(head),context='FACES')
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
 extent=abs(rig.pose.bones['lowerarm_l'].tail.x)-.044 if sleeved else .183
 cut((extent,0,0),(1,0,0),True);cut((-extent,0,0),(1,0,0),False)
 slope=.028/(shoulder-hem) if sleeved else .07/.22;base=.052 if sleeved else 0;origin=hem if sleeved else shoulder-.16
 def gap(z):return max(.001,base+slope*(z-origin))
 for sign in [-1,1]:
  bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(sign*base,0,origin),plane_no=(sign,0,-slope))
  if not sleeved:bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(sign*.001,0,0),plane_no=(1,0,0))
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,-.045,0),plane_no=(0,1,0))
 remove=[f for f in bm.faces if f.calc_center_median().y<-.045 and abs(f.calc_center_median().x)<gap(f.calc_center_median().z)-1e-6]
 bmesh.ops.delete(bm,geom=remove,context='FACES')
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
 # Connected ribbed borders: extend each measured opening edge. Material
 # bands belong to the same fabric wall, avoiding stacked trim meshes.
 bm=bmesh.new();bm.from_mesh(ob.data)
 def extend_border(axis,value,width,kind,closed):
  candidates=[e for e in bm.edges if e.is_boundary and all(abs(v.co[axis]-value)<2e-5 for v in e.verts)]
  assert candidates,kind+' border missing'
  adjacency={}
  for e in candidates:
   for v in e.verts:adjacency.setdefault(v,[]).append(e.other_vert(v))
  assert all(len(ns)<=2 for ns in adjacency.values()),kind+' branching seam'
  start=next((v for v,ns in adjacency.items() if len(ns)==1),next(iter(adjacency)))
  ordered=[start];prev=None;cur=start
  while True:
   choices=[v for v in adjacency[cur] if v!=prev and v!=start]
   if not choices:break
   nxt=choices[0];ordered.append(nxt);prev,cur=cur,nxt
  assert len(ordered)==len(adjacency),(kind,'disconnected opening')
  base=[v.co.copy() for v in ordered];previous=ordered
  steps=[.15,.25,.60,.70,1.0]
  for segment,t in enumerate(steps):
   new=[]
   for p in base:
    q=p.copy();q[axis]=value+width*t
    if kind.startswith('cuff'):
     center=Vector((q.x,rig.pose.bones['lowerarm_l' if value>0 else 'lowerarm_r'].tail.y,shoulder))
     radial=q-center;target=center+radial.normalized()*.038;q=q.lerp(target,t)
    elif kind=='collar':q.x*=1-.045*t;q.y=-.025+(q.y+.025)*(1-.045*t)
    new.append(bm.verts.new(q))
   for i in range(len(previous) if closed else len(previous)-1):
    j=(i+1)%len(previous);face=bm.faces.new([previous[i],previous[j],new[j],new[i]])
    face.material_index=2 if segment in [1,3] else 1
   previous=new
  return {'opening_vertices':len(ordered),'extension_m':width,'connected':True}
 seams={}
 seams['cuff_l']=extend_border(0,extent,.048,'cuff_l',True)
 seams['cuff_r']=extend_border(0,-extent,-.048,'cuff_r',True)
 seams['waistband']=extend_border(2,hem,-.035,'waistband',False)
 seams['collar']=extend_border(2,shoulder+.105,.020,'collar',False)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
 for index, (matname,color,metal,rough) in enumerate([
  ('Rebuilt pearl satin',(.74,.71,.63,1),.24,.36),
  ('Rebuilt black ribbing',(.012,.015,.019,1),.02,.78),
  ('Rebuilt gold bands',(.64,.38,.10,1),.75,.29)]):
  mat=bpy.data.materials.new(matname);mat.use_nodes=True;bs=mat.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=color;bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough;ob.data.materials.append(mat)
 ob['connected_borders']=json.dumps(seams)
 # Weight transfer at surface barycentric coordinates, maximum four influences.
 for v in ob.data.vertices:
  hit,n,index,d=surface.ray_cast(v.co+v.normal*.005,-v.normal,.12)
  if hit is None:hit,n,index,d=surface.find_nearest(v.co)
  ids=bt[index]
  bary=barycentric_transform(hit,*[bp[i] for i in ids],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
  mix={}
  for i,w in zip(ids,bary):
   for name,value in weights[i].items():mix[name]=mix.get(name,0)+max(0,w)*value
  mix=dict(sorted(mix.items(),key=lambda p:-p[1])[:4]);total=sum(mix.values())
  for name,w in mix.items():
   (ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)).add([v.index],w/total,'REPLACE')
 # Triangulate the midsurface before thickness to retain paired diagonals.
 bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
 # Create thickness in authored T-pose; both walls keep transferred weights.
 sol=ob.modifiers.new('Fabric wall','SOLIDIFY');sol.thickness=.001;sol.offset=0;bpy.ops.object.modifier_apply(modifier=sol.name)
 for v in ob.data.vertices:
  m=Matrix(((0,0,0,0),)*4)
  for g in v.groups:m+=skin[ob.vertex_groups[g.group].name]*g.weight
  v.co=m.inverted()@v.co
 for f in ob.data.polygons:f.use_smooth=True
 arm=ob.modifiers.new('Garment skin','ARMATURE');arm.object=rig;ob.parent=rig

 return ob
shirt=bpy.data.objects['AvatarTop_tailored'];coat=build('Luxury_Bomber rebuilt shell',.018,True)
def geometry(ob):
 ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles();pts=[v.co.copy() for v in me.vertices];ts=[tuple(t.vertices) for t in me.loop_triangles];ev.to_mesh_clear();return pts,ts
# Explicit triangles preserve the paired wall diagonal at the GLB boundary.
bm=bmesh.new();bm.from_mesh(coat.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(coat.data);bm.free();coat.data.update()
scene.frame_set(1);bpy.context.view_layer.update();bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(P/(STEM+'.blend')),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
 if obj.type in ['MESH','ARMATURE','EMPTY']:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(P/(STEM+'.glb')),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_skins=True,export_morph=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_optimize_animation_size=True)
report={'source':'male-top01.blend','source_sha256':hashlib.sha256((P/'male-top01.blend').read_bytes()).hexdigest(),'blend_sha256':hashlib.sha256((P/(STEM+'.blend')).read_bytes()).hexdigest(),'glb_sha256':hashlib.sha256((P/(STEM+'.glb')).read_bytes()).hexdigest(),'status':'FITTING_EXPERIMENT_NOT_PROMOTED','scope':'Connected rebuilt jacket with integrated material bands. Original body05, top01 and body animation remain unchanged. Lowered-arm jacket intersections remain open; separate validation records the actual source and GLB findings.','connected_borders':json.loads(coat['connected_borders']),'jacket_vertices':len(coat.data.vertices),'jacket_triangles':len(coat.data.polygons),'jacket_materials':len(coat.data.materials)}
(P/(STEM+'-build.json')).write_text(json.dumps(report,indent=2)+'\n')
from build_bodies import review
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=1.16;camera.location=(1,-4,1.35);review.look_at(camera,Vector((0,0,1.28)));scene.render.resolution_x=960;scene.render.resolution_y=900
for frame,label in [(1,'relaxed'),(31,'tpose'),(61,'reach'),(91,'crouch')]:
 scene.frame_set(frame);scene.render.filepath=str(P/f'{STEM}-{label}-torso.png');bpy.ops.render.render(write_still=True)
print('REBUILT_BOMBER_EXPORTED',report,flush=True)
