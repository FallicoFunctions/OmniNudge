# Connection map: one torso grid with continuous shoulder straps. Neck, hem,
# front and bilateral armholes are deliberate openings; no overlapping panels.
import bpy,bmesh,sys,math,json,argparse,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
sys.path.insert(0,str(Path(__file__).resolve().parent))
from surface_crossings import strict_pairs,crossing
P=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof'
parser=argparse.ArgumentParser();parser.add_argument('--sex',choices=['male','female'],default='male')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source=P/f'{args.sex}-body05.blend';stem=f'{args.sex}-top01'
bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;s.frame_set(31);bpy.context.view_layer.update();body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton']
def geo(ob):
 ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles();p=[v.co.copy() for v in me.vertices];t=[tuple(x.vertices) for x in me.loop_triangles];ev.to_mesh_clear();return p,t
bp,bt=geo(body);tree=BVHTree.FromPolygons(bp,bt,all_triangles=True);skin={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones};bw=[{body.vertex_groups[g.group].name:g.weight for g in v.groups if body.vertex_groups[g.group].name in skin} for v in body.data.vertices]
shoulder=rig.pose.bones['upperarm_l'].head.z;hem=rig.pose.bones['pelvis'].head.z-.065 if args.sex=='male' else rig.pose.bones['spine_02'].head.z
def ease(z):
 t=max(0,min(1,(z-(shoulder-.20))/.05));return .010-.004*t*t*(3-2*t)
rows=40;cols=80;points=[];weights=[];angles=[]
for j in range(rows):
 z=hem+(shoulder+.085-hem)*j/(rows-1);gap=max(.007,(.90*(z-(shoulder-.16))/.245 if args.sex=='male' else .65*(z-(shoulder-.065))/.150))
 for i in range(cols):
  a=gap+(2*math.pi-2*gap)*i/(cols-1);d=Vector((math.sin(a),-math.cos(a),0));center=Vector((0,-.025,z));hit,n,idx,dist=tree.ray_cast(center,d)
  assert hit is not None
  p=hit+d*ease(z);points.append(p);angles.append(a)
  ids=bt[idx];bary=barycentric_transform(hit,*[bp[k] for k in ids],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)));w={}
  for k,b in zip(ids,bary):
   for name,value in bw[k].items():w[name]=w.get(name,0)+max(0,b)*value
  weights.append(w)
faces=[]
for j in range(rows-1):
 for i in range(cols-1):
  ids=(j*cols+i,j*cols+i+1,(j+1)*cols+i+1,(j+1)*cols+i);z=sum(points[k].z for k in ids)/4;a=sum(angles[k] for k in ids)/4
  # Large oval armholes isolate the upper-arm skin field from this sleeveless layer.
  side_angle=min(abs(a-math.pi/2),abs(a-3*math.pi/2))
  if ((z-(shoulder-.015))/.110)**2+(side_angle/.90)**2<1:continue
  # Never cover the lateral arm bulge picked up by a horizontal body ray.
  if any(abs(points[k].x)>.23 for k in ids):continue
  faces.append(ids)
mesh=bpy.data.meshes.new('Tailored shirt');mesh.from_pydata(points,[],faces);mesh.update();ob=bpy.data.objects.new('AvatarTop_tailored',mesh);s.collection.objects.link(ob)
for v,w in zip(mesh.vertices,weights):
 w=dict(sorted(w.items(),key=lambda p:-p[1])[:4]);total=sum(w.values())
 for name,val in w.items():(ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)).add([v.index],val/total,'REPLACE')
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
# Smooth the armhole stair steps before adding physical thickness, then
# project back onto the measured radial body surface and refresh skin weights.
bm=bmesh.new();bm.from_mesh(mesh)
for _ in range(24):
 updates={}
 for v in bm.verts:
  near=[e.other_vert(v) for e in v.link_edges if e.is_boundary]
  if len(near)==2 and hem+.025<v.co.z<shoulder+.080 and abs(v.co.x)>.025:
   updates[v]=v.co.lerp((near[0].co+near[1].co)*.5,.5)
 for v,p in updates.items():
  center=Vector((0,-.025,p.z));d=(p-center).normalized();hit,n,idx,dist=tree.ray_cast(center,d)
  if hit is not None:v.co=hit+d*ease(p.z)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
for v in mesh.vertices:
 center=Vector((0,-.025,v.co.z));d=(v.co-center).normalized();hit,n,idx,dist=tree.ray_cast(center,d)
 ids=bt[idx];bary=barycentric_transform(hit,*[bp[k] for k in ids],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)));w={}
 for k,b in zip(ids,bary):
  for name,value in bw[k].items():w[name]=w.get(name,0)+max(0,b)*value
 w=dict(sorted(w.items(),key=lambda p:-p[1])[:4]);total=sum(w.values())
 for group in ob.vertex_groups:group.remove([v.index])
 for name,val in w.items():(ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)).add([v.index],val/total,'REPLACE')
bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
# Triangulate the fabric midsurface first, giving both walls matching diagonals.
bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
sol=ob.modifiers.new('Fabric thickness','SOLIDIFY');sol.thickness=.001;sol.offset=0;bpy.ops.object.modifier_apply(modifier=sol.name)
for v in mesh.vertices:
 m=Matrix(((0,0,0,0),)*4)
 for g in v.groups:m+=skin[ob.vertex_groups[g.group].name]*g.weight
 v.co=m.inverted()@v.co
for f in mesh.polygons:f.use_smooth=True
mod=ob.modifiers.new('Garment skin','ARMATURE');mod.object=rig;ob.parent=rig
mat=bpy.data.materials.new('Tailored black fabric');mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.022,.025,.030,1);mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.72;mesh.materials.append(mat)

# Bake a stable diagonal before export so source and runtime share triangles.
bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
# Body and action are read-only: this file adds only one independently skinned top.
s.frame_set(1);bpy.context.view_layer.update();bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(P/(stem+'.blend')),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
 if obj.type in ['MESH','ARMATURE','EMPTY']:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(P/(stem+'.glb')),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_skins=True,export_morph=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_optimize_animation_size=True)
report={'body_source':source.name,'body_source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_sha256':hashlib.sha256((P/(stem+'.blend')).read_bytes()).hexdigest(),'glb_sha256':hashlib.sha256((P/(stem+'.glb')).read_bytes()).hexdigest(),'scope':'Single independently skinned torso top on unchanged body05; authored radial fit and smoothed armholes. The male open V top and female cropped V top are construction studies, not accepted reference tailoring. No jacket or other garments are present.','top_vertices':len(ob.data.vertices),'top_triangles':len(ob.data.polygons),'hem_z_m':hem,'clearance_m':{'lower_torso':.010,'upper_torso':.006,'smooth_transition_height_m':.05},'fabric_wall_m':.001,'validation':'PENDING_SEPARATE_SOURCE_AND_EXPORT_PROBE'}
(P/(stem+'-build.json')).write_text(json.dumps(report,indent=2)+'\n')
from build_bodies import review
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=1.18;camera.location=(1,-4,1.35);review.look_at(camera,Vector((0,0,1.29)));s.render.resolution_x=900;s.render.resolution_y=900
for frame,label in [(1,'relaxed'),(31,'tpose'),(61,'reach'),(91,'crouch')]:
 s.frame_set(frame);s.render.filepath=str(P/f'{stem}-{label}.png');bpy.ops.render.render(write_still=True)
print('TOP01_EXPORTED',args.sex,report['top_vertices'],report['top_triangles'],flush=True)
