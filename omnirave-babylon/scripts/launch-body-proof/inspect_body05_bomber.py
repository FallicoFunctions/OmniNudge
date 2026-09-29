"""Inspect outfit04's unchanged body/top, connected jacket and actual GLB.

A rest and five-pose diagnostic, not an all-frame acceptance test. Strict
non-adjacent, non-coplanar crossings exclude adjacent folds and coplanar
contacts. Findings are expected while the jacket remains a fitting experiment.
Use --require-clear to make any recorded contact finding fail the command.
"""
from pathlib import Path
import bpy,bmesh,json,hashlib,sys,argparse
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from validate_body05_tops import geometry,between,body_snapshot,basis
from validate_body_contacts import bones_snapshot
from surface_crossings import strict_pairs,crossing
from build_bodies import review
P=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof';STEM='male-outfit04';NAME='Luxury_Bomber rebuilt shell'

def inspect():
 paths=[P/'male-top01.blend',P/(STEM+'.blend'),P/(STEM+'.glb')];hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
 bpy.ops.wm.open_mainfile(filepath=str(paths[0]));rig=bpy.data.objects['AvatarSkeleton'];scene=bpy.context.scene
 original={name:body_snapshot(bpy.data.objects[name]) for name in ['AvatarBody','AvatarTop_tailored']};bones=bones_snapshot(rig);poses={}
 for frame in [1,31,61,91,121]:scene.frame_set(frame);bpy.context.view_layer.update();poses[frame]=basis(rig)
 fixture=json.loads((P/'top01-diagonal-control.json').read_text());controls={'recorded_wall_crossings':sum(crossing(*[[Vector(p) for p in t] for t in example['points']]) for example in fixture['examples'])};assert controls['recorded_wall_crossings']==8
 base=[Vector(p) for p in [(0,0,0),(2,0,0),(0,2,0)]]
 controls['separated']=crossing(base,[Vector(p) for p in [(3,3,-1),(3,3,1),(4,3,0)]]);controls['touch_only']=crossing(base,[Vector(p) for p in [(.5,.5,0),(.5,.5,1),(1,.5,1)]])
 assert not controls['separated'] and not controls['touch_only']
 results={};diagnostic_faces=set()
 for label,path in zip(['source','export'],paths[1:]):
  if label=='source':bpy.ops.wm.open_mainfile(filepath=str(path))
  else:bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(path))
  scene=bpy.context.scene;rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');coat=bpy.data.objects[NAME];body=bpy.data.objects['AvatarBody'];top=bpy.data.objects['AvatarTop_tailored'];assert len(rig.data.bones)==56
  if label=='source':
   assert all(body_snapshot(bpy.data.objects[n])==v for n,v in original.items()),'Body or top changed'
   assert bones_snapshot(rig)==bones,'Bind rig changed'
  bm=bmesh.new();bm.from_mesh(coat.data);unseen=set(bm.verts);components=0
  while unseen:
   front={unseen.pop()};components+=1
   while front:
    front={e.other_vert(v) for v in front for e in v.link_edges}&unseen;unseen-=front
  topo={'vertices':len(bm.verts),'triangles':len(bm.faces),'components_before_seam_welding':components,'nonmanifold_edges_before_seam_welding':sum(not e.is_manifold for e in bm.edges),'degenerate_faces':sum(f.calc_area()<1e-12 for f in bm.faces)};bm.free()
  if label=='source':assert components==1 and topo['nonmanifold_edges_before_seam_welding']==0 and topo['degenerate_faces']==0,topo
  logical=None
  if label=='export':
   unique={};logical=[]
   for v in coat.data.vertices:
    key=(tuple(v.co),tuple(sorted((coat.vertex_groups[g.group].name,g.weight) for g in v.groups)));logical.append(unique.setdefault(key,len(unique)))
  if label=='export':
   physical=bmesh.new();coordinates={}
   for v,index in zip(coat.data.vertices,logical):coordinates.setdefault(index,v.co.copy())
   vs=[physical.verts.new(coordinates[i]) for i in range(len(coordinates))]
   for f in coat.data.polygons:physical.faces.new([vs[logical[i]] for i in f.vertices])
   remaining=set(physical.verts);islands=0
   while remaining:
    front={remaining.pop()};islands+=1
    while front:
     front={e.other_vert(v) for v in front for e in v.link_edges}&remaining;remaining-=front
   topo['physical_vertices_after_seam_welding']=len(physical.verts);topo['physical_components_after_seam_welding']=islands;topo['physical_nonmanifold_edges_after_seam_welding']=sum(not e.is_manifold for e in physical.edges);physical.free()
   assert islands==1 and topo['physical_nonmanifold_edges_after_seam_welding']==0,topo
  first,last=rig.animation_data.action.frame_range;assert abs(last-first-150)<1e-4
  rows=[]
  for frame in [0,1,31,61,91,121]:
   rig.data.pose_position='REST' if frame==0 else 'POSE';f=max(1,frame) if label=='source' else first+max(0,frame-1);scene.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update()
   if label=='source' and frame:assert basis(rig)==poses[frame],'Body motion changed'
   p,t=geometry(coat);q,u=geometry(body);v,w=geometry(top);self_hits=strict_pairs(p,t,logical);body_hits=between(p,t,q,u);top_hits=between(p,t,v,w)
   rows.append({'frame':frame,'pose':'rest' if frame==0 else {1:'relaxed',31:'tpose',61:'reach',91:'crouch',121:'step'}[frame],'self_pairs':len(self_hits),'body_pairs':len(body_hits),'top_pairs':len(top_hits)})
   if label=='source' and frame==1:diagnostic_faces={a for a,b in body_hits+top_hits}|{i for pair in self_hits for i in pair}
   print('BOMBER_PROBE',label,rows[-1],flush=True)
  results[label]={'topology':topo,'poses':rows}
 report={'hashes':hashes,'scope':__doc__,'controls':controls,'preserved_body_and_top':original,'preserved_bind_skeleton':bones,'preserved_sampled_body_animation':True,'results':results,'passed':all(not (r['self_pairs'] or r['body_pairs'] or r['top_pairs']) for data in results.values() for r in data['poses'])}
 (P/(STEM+'-validation.json')).write_text(json.dumps(report,indent=2)+'\n')
 bpy.ops.wm.open_mainfile(filepath=str(paths[1]));scene=bpy.context.scene;scene.frame_set(1);coat=bpy.data.objects[NAME]
 red=bpy.data.materials.new('Diagnostic crossing triangles');red.use_nodes=True;red.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.65,.005,.008,1);red.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.65;slot=len(coat.data.materials);coat.data.materials.append(red)
 # Saved source and export stay unchanged; material marking exists only in this render.
 assert all(len(f.vertices)==3 for f in coat.data.polygons)
 for i in diagnostic_faces:coat.data.polygons[i].material_index=slot
 camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=1.14;camera.location=(1,-4,1.35);review.look_at(camera,Vector((0,0,1.28)));scene.render.resolution_x=960;scene.render.resolution_y=900;scene.render.filepath=str(P/(STEM+'-contact-diagnostic.png'));bpy.ops.render.render(write_still=True)
 return report

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--require-clear',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);r=inspect();print('BOMBER_CLEAR',r['passed'],flush=True)
 if args.require_clear:assert r['passed'],'Jacket contact findings remain open'
