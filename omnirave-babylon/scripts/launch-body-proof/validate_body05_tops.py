"""Validate body preservation and the actual top01 source/export surfaces.

Checks all 301 samples of the authored five-second motion at 60 Hz. Crossings
are strict, non-coplanar triangle crossings; self-adjacency includes GLB seams.
Adjacent folds, continuous-time safety, other clothes and other animations are
outside this probe. No body masks or hidden garment faces are used.
"""
from pathlib import Path
import argparse,hashlib,json,math,sys
import bpy,bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from surface_crossings import strict_pairs,crossing
from validate_body_contacts import bones_snapshot,weights_snapshot,hash_data
OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof'

def geometry(obj):
 ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles()
 p=[ev.matrix_world@v.co for v in me.vertices];t=[tuple(t.vertices) for t in me.loop_triangles];ev.to_mesh_clear();return p,t

def body_snapshot(body):
 return hash_data({'points':[list(v.co) for v in body.data.vertices],'faces':[list(f.vertices) for f in body.data.polygons],'weights':weights_snapshot(body),'transform':[list(row) for row in body.matrix_world]})

def basis(rig):return {b.name:tuple(x for row in b.matrix_basis for x in row) for b in rig.pose.bones}
def between(p,t,q,u):
 left=BVHTree.FromPolygons(p,t,all_triangles=True);right=BVHTree.FromPolygons(q,u,all_triangles=True)
 return [(a,b) for a,b in left.overlap(right) if crossing([p[i] for i in t[a]],[q[i] for i in u[b]])]

def validate(sex,samples=301):
 stem=f'{sex}-top01';paths=[OUT/f'{sex}-body05.blend',OUT/(stem+'.blend'),OUT/(stem+'.glb')]
 hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
 base=[Vector(p) for p in [(0,0,0),(2,0,0),(0,2,0)]]
 controls={name:crossing(base,[Vector(p) for p in points]) for name,points in [('crossing',[(.5,.5,-1),(.5,.5,1),(1,.5,0)]),('separated',[(3,3,-1),(3,3,1),(4,3,0)]),('touch_only',[(.5,.5,0),(.5,.5,1),(1,.5,1)]),('coplanar',[(.2,.2,0),(.3,.2,0),(.2,.3,0)])]}
 assert controls==dict(crossing=True,separated=False,touch_only=False,coplanar=False)
 fixture=json.loads((OUT/'top01-diagonal-control.json').read_text())
 controls['recorded_wall_crossings']=sum(crossing(*[[Vector(p) for p in tri] for tri in example['points']]) for example in fixture['examples'])
 assert controls['recorded_wall_crossings']==8,'Recorded garment failure was missed'
 bpy.ops.wm.open_mainfile(filepath=str(paths[0]));scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];body=bpy.data.objects['AvatarBody']
 original_body=body_snapshot(body);original_bones=bones_snapshot(rig);original_names={o.name for o in bpy.data.objects if o.type=='MESH'}
 before=[]
 for sample in range(samples):
  frame=1+150*sample/(samples-1);scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();before.append(basis(rig))
 results={}
 for label,path in zip(['source','export'],paths[1:]):
  if label=='source':bpy.ops.wm.open_mainfile(filepath=str(path))
  else:
   bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(path))
  scene=bpy.context.scene;rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');body=bpy.data.objects['AvatarBody'];top=bpy.data.objects['AvatarTop_tailored']
  assert len(rig.data.bones)==56
  assert not any(m.type=='MASK' and m.show_viewport for m in body.modifiers)
  if label=='source':
   assert body_snapshot(body)==original_body,'Body changed'
   assert bones_snapshot(rig)==original_bones,'Bind skeleton changed'
   assert {o.name for o in bpy.data.objects if o.type=='MESH'}==original_names|{top.name}
  bm=bmesh.new();bm.from_mesh(top.data)
  topo={'vertices':len(bm.verts),'faces':len(bm.faces),'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'degenerate_faces':sum(f.calc_area()<1e-12 for f in bm.faces)};bm.free()
  if label=='source':assert topo['nonmanifold_edges']==0 and topo['degenerate_faces']==0
  assert all(1<=len(v.groups)<=4 and abs(sum(g.weight for g in v.groups)-1)<1e-5 for v in top.data.vertices)
  logical=None
  if label=='export':
   unique={};logical=[]
   for v in top.data.vertices:
    key=(tuple(v.co),tuple(sorted((top.vertex_groups[g.group].name,g.weight) for g in v.groups)))
    logical.append(unique.setdefault(key,len(unique)))
  first,last=rig.animation_data.action.frame_range;assert abs(last-first-150)<1e-3
  # Rest geometry as well as animated geometry; a posed pass cannot hide a bad bind surface.
  rig.data.pose_position='REST';scene.frame_set(1);bpy.context.view_layer.update();p,t=geometry(top);q,u=geometry(body)
  rest={'self_pairs':len(strict_pairs(p,t,logical)),'body_pairs':len(between(p,t,q,u))}
  rig.data.pose_position='POSE';rows=[]
  for sample in range(samples):
   frame=first+150*sample/(samples-1);scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
   if label=='source':assert basis(rig)==before[sample],'Authored body animation changed'
   p,t=geometry(top);q,u=geometry(body);assert all(math.isfinite(x) for point in p for x in point)
   self_pairs=strict_pairs(p,t,logical);body_pairs=between(p,t,q,u)
   rows.append({'sample':sample,'frame':frame,'self_pairs':len(self_pairs),'body_pairs':len(body_pairs)})
   if sample%60==0:print('TOP_CHECK',sex,label,rows[-1],flush=True)
  summary={'samples':samples,'sampling_fps':(samples-1)/5,'self_crossing_samples':sum(r['self_pairs']>0 for r in rows),'body_crossing_samples':sum(r['body_pairs']>0 for r in rows),'maximum_self_pairs':max(r['self_pairs'] for r in rows),'maximum_body_pairs':max(r['body_pairs'] for r in rows)}
  results[label]={'topology':topo,'rest':rest,'summary':summary,'samples':rows}
 report={'hashes':hashes,'controls':controls,'scope':__doc__,'unchanged_body_sha256':original_body,'unchanged_bind_skeleton_sha256':original_bones,'body_source_and_animation_preserved':True,'results':results}
 report['passed']=all(not any(r['rest'].values()) and not r['summary']['self_crossing_samples'] and not r['summary']['body_crossing_samples'] for r in results.values())
 (OUT/(stem+'-validation.json')).write_text(json.dumps(report,indent=2)+'\n');print('TOP_VALIDATION',sex,report['passed'],{k:v['summary'] for k,v in results.items()},flush=True)
 return report

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--sex',choices=['male','female'],default='male');parser.add_argument('--samples',type=int,choices=[5,31,151,301],default=301)
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);report=validate(args.sex,args.samples);assert report['passed'],'Top has body or self-crossings; see versioned validation report'
