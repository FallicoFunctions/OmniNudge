"""Check preserved controls, complete body05 motion, and actual exported geometry."""
from pathlib import Path
import argparse,hashlib,json,math,sys
import bpy,bmesh
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_bodies import OUT
from surface_crossings import strict_pairs,crossing

def hash_data(value):return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
def bones_snapshot(rig):
 return hash_data([(b.name,list(b.head_local),list(b.tail_local),[list(row) for row in b.matrix_local],b.parent.name if b.parent else None) for b in rig.data.bones])
def weights_snapshot(body):return [{body.vertex_groups[g.group].name:g.weight for g in v.groups} for v in body.data.vertices]

def validate(sex,sampling_fps=60):
 paths=[OUT/f'{sex}-body04.blend',OUT/f'{sex}-body05.blend',OUT/f'{sex}-body05.glb']
 hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
 recipe=json.loads((OUT/f'{sex}-body05-repair.json').read_text())
 expected_foot=set(recipe['modified_foot_vertices']);expected_weights={r['vertex'] for r in recipe['thumb_weight_changes']}
 base=[Vector(p) for p in [(0,0,0),(2,0,0),(0,2,0)]]
 controls={name:crossing(base,[Vector(p) for p in points]) for name,points in [
  ('crossing',[(.5,.5,-1),(.5,.5,1),(1,.5,0)]),('separated',[(3,3,-1),(3,3,1),(4,3,0)]),
  ('touch_only',[(.5,.5,0),(.5,.5,1),(1,.5,1)]),('coplanar_inside',[(.2,.2,0),(.3,.2,0),(.2,.3,0)])]}
 assert controls==dict(crossing=True,separated=False,touch_only=False,coplanar_inside=False)
 seam=json.loads((OUT/'body04-export-seam-control.json').read_text());points=[Vector(p) for p in seam['points']]
 controls['seam_raw_false_positive']=len(strict_pairs(points,seam['triangles']))
 controls['seam_physical_adjacency']=len(strict_pairs(points,seam['triangles'],seam['physical_vertex_ids']))
 assert controls['seam_raw_false_positive']==1 and controls['seam_physical_adjacency']==0
 before_basis=[];results={};measurements={};topology={};seam_duplicates=0;maximum_rest_change=0
 for label,path in zip(['body04','body05','exported_body05'],paths):
  if label=='exported_body05':
   bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(path))
  else:bpy.ops.wm.open_mainfile(filepath=str(path))
  body=bpy.data.objects['AvatarBody'];rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');scene=bpy.context.scene
  assert len(rig.data.bones)==56
  assert all(m.type!='MASK' or not m.show_viewport for m in body.modifiers)
  if label=='body04':
   before_positions=[v.co.copy() for v in body.data.vertices];before_polygons=[tuple(p.vertices) for p in body.data.polygons]
   before_bones=bones_snapshot(rig);before_weights=weights_snapshot(body)
  if label=='body05':
   assert len(body.data.vertices)==13380 and [tuple(p.vertices) for p in body.data.polygons]==before_polygons
   assert bones_snapshot(rig)==before_bones
   ds=[(v.co-p).length for v,p in zip(body.data.vertices,before_positions)];maximum_rest_change=max(ds)
   assert maximum_rest_change<=.010 and all(d==0 for i,d in enumerate(ds) if i not in expected_foot)
   assert all(before_positions[i].z<.15 for i,d in enumerate(ds) if d>0)
   weights=weights_snapshot(body)
   assert all(a==b for i,(a,b) in enumerate(zip(before_weights,weights)) if i not in expected_weights)
   for i in expected_weights:
    assert {n:w for n,w in weights[i].items() if n not in rig.data.bones}=={n:w for n,w in before_weights[i].items() if n not in rig.data.bones}
    assert abs(sum(w for n,w in weights[i].items() if n in rig.data.bones)-1)<1e-6
  if label!='exported_body05':
   bm=bmesh.new();bm.from_mesh(body.data)
   topology[label]={'vertices':len(bm.verts),'faces':len(bm.faces),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'degenerate_faces':sum(f.calc_area()<1e-12 for f in bm.faces)};bm.free()
  logical=None
  if label=='exported_body05':
   unique={};logical=[]
   for v in body.data.vertices:
    key=(tuple(v.co),tuple(sorted((body.vertex_groups[g.group].name,g.weight) for g in v.groups)))
    logical.append(unique.setdefault(key,len(unique)))
   seam_duplicates=len(logical)-len(unique)
  # Regions are attached to bind-space vertices, not world-space boxes per pose.
  rig.data.pose_position='REST';scene.frame_set(1);bpy.context.view_layer.update()
  ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();mesh.calc_loop_triangles()
  rest=[ev.matrix_world@v.co for v in mesh.vertices];tris=[tuple(t.vertices) for t in mesh.loop_triangles]
  rest_pairs=strict_pairs(rest,tris,logical);ev.to_mesh_clear()
  height=max(p.z for p in rest)-min(p.z for p in rest);scale=height/1.803
  feet={i for i,p in enumerate(rest) if p.z<.15}
  shoulders={i for i,p in enumerate(rest) if .08*scale<abs(p.x)<.40*scale and 1.20*scale<p.z<1.55*scale}
  rig.data.pose_position='POSE';first,last=rig.animation_data.action.frame_range;assert abs(last-first-150)<1e-4
  rows=[];sample_count=5*sampling_fps+1
  for sample in range(sample_count):
   frame=first+sample*30/sampling_fps;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
   basis={b.name:tuple(x for row in b.matrix_basis for x in row) for b in rig.pose.bones}
   if label=='body04':before_basis.append(basis)
   if label=='body05':
    allowed={'lowerarm_l','lowerarm_r'} if sex=='female' else set()
    assert all(value==before_basis[sample][name] for name,value in basis.items() if name not in allowed),'Unexpected animation change'
    if sample in [sampling_fps,2*sampling_fps]:assert basis==before_basis[sample],'T-pose or reach changed'
   ev=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();mesh.calc_loop_triangles()
   points=[ev.matrix_world@v.co for v in mesh.vertices];tris=[tuple(t.vertices) for t in mesh.loop_triangles]
   assert all(math.isfinite(x) for p in points for x in p)
   pairs=strict_pairs(points,tris,logical)
   foot_pairs=sum(all(i in feet for t in [a,b] for i in tris[t]) for a,b in pairs)
   shoulder_pairs=sum(any(i in shoulders for t in [a,b] for i in tris[t]) for a,b in pairs)
   rows.append({'sample':sample,'source_frame':frame,'all_body_pairs':len(pairs),'foot_pairs':foot_pairs,'shoulder_pairs':shoulder_pairs,'other_pairs':len(pairs)-foot_pairs-shoulder_pairs})
   if sample==sampling_fps:measurements[label]={'height_m':max(p.z for p in points)-min(p.z for p in points),'span_m':max(p.x for p in points)-min(p.x for p in points)}
   ev.to_mesh_clear()
   if sample%sampling_fps==0:print('CONTACT_CHECK',sex,label,sample,rows[-1],flush=True)
  results[label]={'rest_crossing_pairs':len(rest_pairs),'summary':{'sampled_frames':sample_count,'sampling_fps':sampling_fps,'frames_with_crossings':sum(r['all_body_pairs']>0 for r in rows),'maximum_pairs':max(r['all_body_pairs'] for r in rows),'maximum_foot_pairs':max(r['foot_pairs'] for r in rows),'maximum_shoulder_pairs':max(r['shoulder_pairs'] for r in rows)},'frames':rows}
 assert topology['body05']['nonmanifold_edges']==topology['body04']['nonmanifold_edges']
 assert topology['body05']['degenerate_faces']==0
 report={'source_sha256':hashes,'scope':f'Rest plus the five-second motion sampled at {sampling_fps} Hz: strict non-adjacent, non-coplanar body triangle crossings, including actual GLB reimport with seam adjacency. Adjacent folds, coplanar overlap, continuous-time guarantees, GPU parity, clothing fit, locomotion and likeness remain outside scope.',
 'controls':controls,'unchanged_bind_skeleton_sha256':before_bones,'unchanged_topology':True,'mesh_topology':topology,'maximum_rest_change_m':maximum_rest_change,'changed_weight_vertices':len(expected_weights),
 'animation_changes':'Female lowered-forearm rotation channels only; T-pose/reach and all other local bone transforms unchanged' if sex=='female' else 'None',
 'export_seam_duplicate_vertices':seam_duplicates,'tpose_measurements':measurements,'results':results}
 (OUT/f'{sex}-body05-validation.json').write_text(json.dumps(report,indent=2)+'\n')
 print('BODY05_VALIDATED',sex,{k:v['summary'] for k,v in results.items()},flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--sex',choices=['male','female'],default='male');parser.add_argument('--sampling-fps',type=int,choices=[30,60],default=60)
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);validate(args.sex,args.sampling_fps)
