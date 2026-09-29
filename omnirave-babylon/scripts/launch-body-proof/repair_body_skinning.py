"""Body04: locally smooth shoulder/torso skin weights on the retained body03.

Connection map: the continuous armpit mesh keeps every vertex and face, and
the 56-bone skeleton keeps all shared endpoints. Only deform-weight transitions
change in a smooth, shoulder-scaled region. Semantic groups remain untouched.
Body03 and wardrobe controls are read-only; this owns its body04 experiment.
"""
from pathlib import Path
import argparse, hashlib, json, sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_bodies import OUT,review

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
def shape(body):return digest({'vertices':[list(v.co) for v in body.data.vertices],'faces':[list(f.vertices) for f in body.data.polygons]})
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)

def main(sex,iterations):
 source=OUT/f'{sex}-review03.blend';source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
 bpy.ops.wm.open_mainfile(filepath=str(source))
 body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton'];scene=bpy.context.scene
 before_shape=shape(body)
 # matrix_local rows must be serializable, preserving bind orientation as well.
 bones=[(b.name,list(b.head_local),list(b.tail_local),[list(row) for row in b.matrix_local],b.parent.name if b.parent else None) for b in rig.data.bones]
 bone_hash=digest(bones)
 names={b.name for b in rig.data.bones};groupids={g.index:g.name for g in body.vertex_groups if g.name in names}
 original=[{groupids[g.group]:g.weight for g in v.groups if g.group in groupids} for v in body.data.vertices]
 neighbors=[set() for v in body.data.vertices]
 for edge in body.data.edges:
  a,b=edge.vertices;neighbors[a].add(b);neighbors[b].add(a)
 shoulder=(rig.data.bones['upperarm_l'].head_local.z+rig.data.bones['upperarm_r'].head_local.z)/2
 scale=shoulder/1.4226734638214111
 # Male region was established from the diagnosed crossing faces; scaling by
 # shoulder height makes the analogous female region explicit and reproducible.
 region={v.index:smooth(.10,.14,abs(v.co.x)/scale)*(1-smooth(.25,.30,abs(v.co.x)/scale))*smooth(1.23,1.28,v.co.z/scale)*(1-smooth(1.40,1.46,v.co.z/scale)) for v in body.data.vertices}
 region={i:f for i,f in region.items() if f>0}
 current=[dict(w) for w in original]
 for _ in range(iterations):
  updates={}
  for i,f in region.items():
   ns=neighbors[i];union=set(current[i]).union(*(current[j] for j in ns));alpha=.5*f
   updates[i]={n:(1-alpha)*current[i].get(n,0)+alpha*sum(current[j].get(n,0) for j in ns)/len(ns) for n in union}
  for i,w in updates.items():current[i]=w
 changes=[]
 for i in region:
  for name in groupids.values():body.vertex_groups[name].remove([i])
  top=sorted(current[i].items(),key=lambda r:r[1],reverse=True)[:4];total=sum(w for n,w in top)
  new={n:w/total for n,w in top if w>0}
  for n,w in new.items():body.vertex_groups[n].add([i],w,'REPLACE')
  changes.append({'vertex':i,'before':original[i],'after':new})
 body.data.update();bpy.context.view_layer.update()
 assert shape(body)==before_shape
 assert digest([(b.name,list(b.head_local),list(b.tail_local),[list(row) for row in b.matrix_local],b.parent.name if b.parent else None) for b in rig.data.bones])==bone_hash
 assert len(body.data.vertices)==13380 and len(rig.data.bones)==56
 # Body-only export: old clothing has not yet been refitted to the changed skin.
 for obj in list(bpy.data.objects):
  if obj.type=='MESH' and (obj.name.startswith('AvatarTop_') or obj.name.startswith('AvatarBottoms_')):bpy.data.objects.remove(obj,do_unlink=True)
 for obj in bpy.data.objects:
  obj.hide_set(False);obj.hide_viewport=False;obj.hide_render=False
 scene.frame_set(1);bpy.context.view_layer.update();bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-body04.blend'),compress=True)
 bpy.ops.object.select_all(action='DESELECT')
 for obj in bpy.data.objects:
  if obj.type in ['MESH','ARMATURE','EMPTY']:obj.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{sex}-body04.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_skins=True,export_morph=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_optimize_animation_size=True)
 report={'source':source.name,'source_sha256':source_hash,'scope':'Local shoulder/torso skin-weight smoothing; no body rest-coordinate, topology, joint or animation edits. Body-only experiment; clothes require refitting.',
 'iterations':iterations,'region_scale':scale,'affected_vertices':len(changes),'unchanged_body_rest_and_topology_sha256':before_shape,'unchanged_skeleton_sha256':bone_hash,'changes':changes,'reference_acceptance':'PENDING','deformation_acceptance':'PENDING; see separate versioned validation report'}
 (OUT/f'{sex}-body04-skinning.json').write_text(json.dumps(report,indent=2)+'\n')
 camera=review.configure_scene();camera.data.type='ORTHO';scene.render.resolution_x=768;scene.render.resolution_y=896
 clay=bpy.data.materials.new('Body04 diagnostic clay');clay.use_nodes=True;bs=clay.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(.30,.34,.38,1);bs.inputs['Roughness'].default_value=.8;scene.view_layers[0].material_override=clay
 for frame,label in [(1,'relaxed'),(31,'tpose'),(61,'reach'),(91,'crouch')]:
  scene.frame_set(frame);camera.data.ortho_scale=2.65 if frame==61 else 2.3
  camera.location=(2,-4,.93);review.look_at(camera,Vector((0,0,.93)))
  scene.render.filepath=str(OUT/f'{sex}-body04-{label}-three-quarter.png');bpy.ops.render.render(write_still=True)
 scene.frame_set(1);camera.data.ortho_scale=.38*scale;camera.location=Vector((.48,.8,1.35))*scale;review.look_at(camera,Vector((.13,0,1.35))*scale)
 scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.filepath=str(OUT/f'{sex}-body04-underarm.png');bpy.ops.render.render(write_still=True)
 print('BODY04_EXPORTED',sex,len(changes),'local weight edits',flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--sex',choices=['male','female'],default='male');parser.add_argument('--iterations',type=int,default=40)
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);main(args.sex,args.iterations)
