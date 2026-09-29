"""Probe non-adjacent triangle self-crossings at four diagnostic poses.

BVH candidates are confirmed with a strict segment/triangle intersection test;
shared vertices and boundary-only contacts are excluded. Coplanar intersections,
adjacent folds and unsampled animation frames remain outside this check.
"""
from pathlib import Path
import argparse, hashlib, json, sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof'
parser=argparse.ArgumentParser();parser.add_argument('--version',choices=['outfit02','outfit03'],default='outfit03')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
stem='male-'+args.version;source=OUT/(stem+'.blend');source_hash=hashlib.sha256(source.read_bytes()).hexdigest()

def pierces(start,end,tri):
 a,b,c=tri;direction=end-start;e1=b-a;e2=c-a;h=direction.cross(e2);det=e1.dot(h)
 if abs(det)<1e-12:return False
 s=start-a;u=s.dot(h)/det;q=s.cross(e1);v=direction.dot(q)/det;t=e2.dot(q)/det
 return 1e-6<t<1-1e-6 and u>1e-6 and v>1e-6 and u+v<1-1e-6

def crossing(a,b):
 return any(pierces(a[i],a[(i+1)%3],b) or pierces(b[i],b[(i+1)%3],a) for i in range(3))

base=[Vector(p) for p in [(0,0,0),(2,0,0),(0,2,0)]]
controls={label:crossing(base,[Vector(p) for p in points]) for label,points in [
 ('crossing',[(.5,.5,-1),(.5,.5,1),(1,.5,0)]),
 ('separated',[(3,3,-1),(3,3,1),(4,3,0)]),
 ('touch_only',[(.5,.5,0),(.5,.5,1),(1,.5,1)]),
 ('coplanar_inside',[(.2,.2,0),(.3,.2,0),(.2,.3,0)])]}
assert controls==dict(crossing=True,separated=False,touch_only=False,coplanar_inside=False)
bpy.ops.wm.open_mainfile(filepath=str(source));rows=[]
for frame in [1,31,61,91]:
 bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
 for name in ['AvatarBody','Luxury_Black shirt draft','Luxury_Bomber continuous shell']:
  obj=bpy.data.objects[name];ev=obj.evaluated_get(dg);mesh=ev.to_mesh();mesh.calc_loop_triangles()
  points=[v.co.copy() for v in mesh.vertices];tris=[tuple(t.vertices) for t in mesh.loop_triangles]
  polygon_ids=[t.polygon_index for t in mesh.loop_triangles]
  tree=BVHTree.FromPolygons(points,tris,all_triangles=True)
  candidates=[(a,b) for a,b in tree.overlap(tree) if a<b and not set(tris[a]).intersection(tris[b])]
  pairs=[(a,b) for a,b in candidates if crossing([points[i] for i in tris[a]],[points[i] for i in tris[b]])]
  centers=[sum((points[i] for i in tris[a]),Vector())/3 for a,b in pairs]
  # A diagnostic region around the positive-X armpit; crouch lowers the pelvis.
  rig=bpy.data.objects['AvatarSkeleton'];dz=rig.pose.bones['pelvis'].head.z-rig.data.bones['pelvis'].head_local.z
  near=[(a,b) for (a,b),p in zip(pairs,centers) if .08<p.x<.22 and 1.25+dz<p.z<1.43+dz]
  rows.append(dict(frame=frame,mesh=name,candidate_pairs=len(candidates),strict_crossing_pairs=len(pairs),
                   underarm_region_pairs=len(near),underarm_example_polygon_pairs=[(polygon_ids[a],polygon_ids[b]) for a,b in near[:12]]))
  ev.to_mesh_clear()
report=dict(source_sha256=source_hash,controls=controls,
 scope='Four-pose non-adjacent, non-coplanar self-crossings with strict interior segment/triangle confirmation. No adjacent-fold, coplanar, all-frame, subframe, or GPU parity claim. Region counts localize findings; they do not measure visible severity.',poses=rows)
(OUT/(stem+'-self-intersection-check.json')).write_text(json.dumps(report,indent=2)+'\n')
for r in rows:print('SELF_INTERSECTION',r['frame'],r['mesh'],r['strict_crossing_pairs'],'underarm',r['underarm_region_pairs'])
