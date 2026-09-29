"""Reopen body03/body04 and the exported GLB; compare all 151 motion frames."""
from pathlib import Path
import argparse,hashlib,json,math,sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from surface_crossings import strict_pairs,crossing
from build_bodies import OUT

parser=argparse.ArgumentParser();parser.add_argument('--sex',choices=['male','female'],default='male')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);sex=args.sex
baseline=OUT/f'{sex}-review03.blend';candidate=OUT/f'{sex}-body04.blend';glb=OUT/f'{sex}-body04.glb'
hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [baseline,candidate,glb]}
base=[Vector(p) for p in [(0,0,0),(2,0,0),(0,2,0)]]
controls={label:crossing(base,[Vector(p) for p in points]) for label,points in [
 ('crossing',[(.5,.5,-1),(.5,.5,1),(1,.5,0)]),('separated',[(3,3,-1),(3,3,1),(4,3,0)]),
 ('touch_only',[(.5,.5,0),(.5,.5,1),(1,.5,1)]),('coplanar_inside',[(.2,.2,0),(.3,.2,0),(.2,.3,0)])]}
assert controls==dict(crossing=True,separated=False,touch_only=False,coplanar_inside=False)
seam_control=json.loads((OUT/'body04-export-seam-control.json').read_text())
seam_points=[Vector(p) for p in seam_control['points']]
controls['seam_raw_index_false_positive']=len(strict_pairs(seam_points,seam_control['triangles']))
controls['seam_physical_adjacency']=len(strict_pairs(seam_points,seam_control['triangles'],seam_control['physical_vertex_ids']))
assert controls['seam_raw_index_false_positive']==1 and controls['seam_physical_adjacency']==0
def sha(data):return hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
def body_snapshot(body,rig):
 return {'shape':sha({'vertices':[list(v.co) for v in body.data.vertices],'faces':[list(f.vertices) for f in body.data.polygons]}),
         'bones':sha([(b.name,[list(row) for row in b.matrix_local],list(b.head_local),list(b.tail_local),b.parent.name if b.parent else None) for b in rig.data.bones])}
source_points=[];source_bones=[];source_weights=[];rows={};max_motion_change=0;changed_vertices=set();measurements={};seam_duplicates=0
for label,path in [('body03',baseline),('body04',candidate),('exported_body04',glb)]:
 if label.startswith('exported'):
  bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(path))
 else:bpy.ops.wm.open_mainfile(filepath=str(path))
 body=bpy.data.objects['AvatarBody'];rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');scene=bpy.context.scene
 assert len(rig.data.bones)==56
 logical_ids=None
 if label.startswith('exported'):
  unique={};logical_ids=[]
  for v in body.data.vertices:
   key=(tuple(v.co),tuple(sorted((body.vertex_groups[g.group].name,g.weight) for g in v.groups)))
   logical_ids.append(unique.setdefault(key,len(unique)))
  seam_duplicates=len(logical_ids)-len(unique)
 if label=='body03':
  identity=body_snapshot(body,rig)
  source_weights=[[(body.vertex_groups[g.group].name,g.weight) for g in v.groups] for v in body.data.vertices]
 if label=='body04':
  assert body_snapshot(body,rig)==identity,'Changed body shape or skeleton'
  current_weights=[[(body.vertex_groups[g.group].name,g.weight) for g in v.groups] for v in body.data.vertices]
  changed_vertices={i for i,(a,b) in enumerate(zip(source_weights,current_weights)) if a!=b}
  assert len(body.data.vertices)==13380
  for i in changed_vertices:
   weights={n:w for n,w in current_weights[i] if n in rig.data.bones}
   assert len(weights)<=4 and abs(sum(weights.values())-1)<1e-6
   assert {n:w for n,w in current_weights[i] if n not in rig.data.bones}=={n:w for n,w in source_weights[i] if n not in rig.data.bones}
 # Classify the shoulder region from bind-space positions, so it follows
 # the same surface through all poses rather than a moving spatial cutoff.
 rig.data.pose_position='REST';scene.frame_set(1);bpy.context.view_layer.update()
 ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
 rest=[ev.matrix_world@v.co for v in mesh.vertices];ev.to_mesh_clear()
 height=max(p.z for p in rest)-min(p.z for p in rest);scale=height/1.803
 region={i for i,p in enumerate(rest) if .08*scale<abs(p.x)<.40*scale and 1.20*scale<p.z<1.55*scale}
 rig.data.pose_position='POSE';first,last=rig.animation_data.action.frame_range;assert abs(last-first-150)<1e-4
 results=[]
 for sample in range(151):
  frame=first+sample;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
  ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();mesh.calc_loop_triangles()
  points=[ev.matrix_world@v.co for v in mesh.vertices];tris=[tuple(t.vertices) for t in mesh.loop_triangles]
  assert all(math.isfinite(x) for p in points for x in p)
  pairs=strict_pairs(points,tris,logical_ids)
  shoulder_pairs=[(a,b) for a,b in pairs if any(i in region for t in [a,b] for i in tris[t])]
  results.append({'sample':sample,'all_body_pairs':len(pairs),'shoulder_region_pairs':len(shoulder_pairs)})
  matrices=[tuple(x for row in b.matrix for x in row) for b in rig.pose.bones]
  if label=='body03':source_points.append(points);source_bones.append(matrices)
  if label=='body04':
   assert matrices==source_bones[sample],'Changed diagnostic animation'
   differences=[(p-q).length for p,q in zip(points,source_points[sample])]
   max_motion_change=max(max_motion_change,max(differences))
   assert all(differences[i]<1e-6 for i in range(len(points)) if i not in changed_vertices)
  if sample==30:measurements[label]={'height_m':max(p.z for p in points)-min(p.z for p in points),'span_m':max(p.x for p in points)-min(p.x for p in points)}
  ev.to_mesh_clear()
  if sample%30==0:print('SKINNING_CHECK',label,sample,results[-1],flush=True)
 rows[label]={'summary':{'sampled_frames':151,'frames_with_shoulder_crossings':sum(r['shoulder_region_pairs']>0 for r in results),'maximum_shoulder_pairs':max(r['shoulder_region_pairs'] for r in results),'maximum_all_body_pairs':max(r['all_body_pairs'] for r in results)},'frames':results}
report={'source_sha256':hashes,'controls':controls,'export_seam_duplicate_vertices':seam_duplicates,'scope':'151-frame strict non-adjacent, non-coplanar triangle crossings, including actual GLB reimport. Exported seam vertices with identical bind position and skin weights share physical adjacency. Adjacent folds, coplanar overlap, subframes, GPU parity and garment fit remain outside scope.',
        'unchanged_body_shape_and_skeleton':identity,'unchanged_animation':True,'changed_weight_vertices':len(changed_vertices),'maximum_pose_change_m':max_motion_change,'tpose_measurements':measurements,'results':rows}
(OUT/f'{sex}-body04-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('BODY04_VALIDATED',{label:r['summary'] for label,r in rows.items()},flush=True)
