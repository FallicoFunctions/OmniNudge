"""Body05 foot-surface and diagnosed hand/forearm-contact corrections.

Connection map: fair only the folded toe patches of the existing continuous
mesh, with a three-edge-ring falloff; keep topology and joint endpoints.
Male distal thumbs lose stray forearm influences. Female lowered forearms
receive clearance in the diagnostic action; T-pose/overhead reach stay intact.
This owns body05 experiments only. Body04 and previous outfits are controls.
"""
from pathlib import Path
import argparse,hashlib,json,sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_bodies import OUT,review,point_bone
from surface_crossings import strict_pairs

def repair(sex):
 source=OUT/f'{sex}-body04.blend';source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
 bpy.ops.wm.open_mainfile(filepath=str(source));body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton'];scene=bpy.context.scene
 original=[v.co.copy() for v in body.data.vertices];polygons=[tuple(f.vertices) for f in body.data.polygons]
 body.data.calc_loop_triangles();tris=[tuple(t.vertices) for t in body.data.loop_triangles]
 neighbors=[set() for _ in original]
 for edge in body.data.edges:
  a,b=edge.vertices;neighbors[a].add(b);neighbors[b].add(a)
 initial_pairs=strict_pairs(original,tris)
 seed={i for a,b in initial_pairs for t in [a,b] for i in tris[t] if all(original[j].z<.15 for j in tris[t])}
 rings=3;distance={i:0 for i in seed};front=set(seed)
 for step in range(1,rings+1):
  front={j for i in front for j in neighbors[i] if j not in distance}
  distance.update({j:step for j in front})
 assert all(original[i].z<.15 for i in distance)
 points=[p.copy() for p in original]
 iterations=20 if sex=='male' else 5;coefficients=[.5,-.53] if sex=='male' else [.5]
 for _ in range(iterations):
  for coefficient in coefficients:
   updates={}
   for i,d in distance.items():
    f=1-d/(rings+1);f=f*f*(3-2*f)
    average=sum((points[j] for j in neighbors[i]),Vector())/len(neighbors[i])
    point=points[i]+coefficient*f*(average-points[i])
    if (point-original[i]).length<=.010:updates[i]=point
   for i,p in updates.items():points[i]=p
 for i in distance:body.data.vertices[i].co=points[i]
 body.data.update()
 final_pairs=strict_pairs(points,tris)
 assert not final_pairs, 'Resting mesh still contains strict crossings'
 assert [tuple(f.vertices) for f in body.data.polygons]==polygons and len(points)==13380
 thumb_changes=[]
 if sex=='male':
  for v in body.data.vertices:
   weights={body.vertex_groups[g.group].name:g.weight for g in v.groups if body.vertex_groups[g.group].name in rig.data.bones}
   for side in ['l','r']:
    distal=sum(weights.get(f'thumb_0{n}_{side}',0) for n in [2,3]);stray=weights.get('lowerarm_'+side,0)
    if distal>.85 and stray>0:
     before=dict(weights);weights.pop('lowerarm_'+side);total=sum(weights.values())
     body.vertex_groups['lowerarm_'+side].remove([v.index])
     for name,w in weights.items():body.vertex_groups[name].add([v.index],w/total,'REPLACE')
     thumb_changes.append({'vertex':v.index,'before':before,'after':{n:w/total for n,w in weights.items()}})
 pose_changes=[]
 if sex=='female':
  for frame,sides in [(1,['l','r']),(91,['l','r']),(121,['l']),(151,['l','r'])]:
   scene.frame_set(frame);bpy.context.view_layer.update()
   for side in sides:
    pb=rig.pose.bones['lowerarm_'+side];before=list(pb.rotation_quaternion)
    point_bone(rig,pb.name,((1 if side=='l' else -1)*.24,-.10,-1))
    pb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=pb.name)
    pose_changes.append({'frame':frame,'bone':pb.name,'before_quaternion':before,'after_quaternion':list(pb.rotation_quaternion)})
 scene.frame_set(1);bpy.context.view_layer.update();bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-body05.blend'),compress=True)
 bpy.ops.object.select_all(action='DESELECT')
 for obj in bpy.data.objects:
  if obj.type in ['MESH','ARMATURE','EMPTY']:obj.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{sex}-body05.glb'),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_skins=True,export_morph=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_optimize_animation_size=True)
 report={'source':source.name,'source_sha256':source_hash,'scope':'Local toe fairing, male distal-thumb weight correction, and female lowered-forearm pose clearance. No body masks or topology/bind-joint changes. Body-only experiment; whole-motion and export validation are separate.',
 'foot_method':{'mode':'taubin' if sex=='male' else 'laplacian','iterations':iterations,'rings':rings,'coefficients':coefficients,'max_allowed_change_m':.010},
 'rest_crossing_pairs_before':len(initial_pairs),'rest_crossing_pairs_after':len(final_pairs),'modified_foot_vertices':sorted(distance),
 'maximum_rest_change_m':max((p-q).length for p,q in zip(points,original)),
 'thumb_weight_changes':thumb_changes,'diagnostic_pose_changes':pose_changes,'body_reference_acceptance':'PENDING','full_deformation_acceptance':'PENDING_SEPARATE_VALIDATION'}
 (OUT/f'{sex}-body05-repair.json').write_text(json.dumps(report,indent=2)+'\n')
 camera=review.configure_scene();camera.data.type='ORTHO';scene.render.resolution_x=768;scene.render.resolution_y=896
 clay=bpy.data.materials.new('Body05 diagnostic clay');clay.use_nodes=True;bs=clay.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(.30,.34,.38,1);bs.inputs['Roughness'].default_value=.8;scene.view_layers[0].material_override=clay
 for frame,label in [(1,'relaxed'),(31,'tpose'),(61,'reach'),(91,'crouch')]:
  scene.frame_set(frame);camera.data.ortho_scale=2.65 if frame==61 else 2.3;camera.location=(2,-4,.93);review.look_at(camera,Vector((0,0,.93)))
  scene.render.filepath=str(OUT/f'{sex}-body05-{label}-three-quarter.png');bpy.ops.render.render(write_still=True)
 scene.frame_set(1);camera.data.ortho_scale=.48;camera.location=(.3,-.7,.5);review.look_at(camera,Vector((0,-.1,.03)))
 scene.render.resolution_x=960;scene.render.resolution_y=700;scene.render.filepath=str(OUT/f'{sex}-body05-feet.png');bpy.ops.render.render(write_still=True)
 print('BODY05_EXPORTED',sex,report['maximum_rest_change_m'],len(thumb_changes),'thumb changes',flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--sex',choices=['male','female'],default='male')
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);repair(args.sex)
