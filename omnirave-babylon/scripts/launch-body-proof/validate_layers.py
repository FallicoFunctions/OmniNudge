"""Probe non-coplanar crossings between the shirt and jacket, with explicit controls."""
from pathlib import Path
import bpy,json,hashlib,sys,argparse
from mathutils.bvhtree import BVHTree
OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof'
parser=argparse.ArgumentParser();parser.add_argument('--version',choices=['outfit01','outfit02','outfit03'],default='outfit02')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []);stem='male-'+args.version
base=BVHTree.FromPolygons([(0,0,0),(2,0,0),(0,2,0)],[(0,1,2)])
controls={}
for label,points in [('crossing',[(.5,.5,-1),(.5,.5,1),(1,.5,0)]),('separated',[(3,3,-1),(3,3,1),(4,3,0)]),('disjoint_overlapping_bounds',[(1.8,1.8,0),(1.8,.5,0),(.5,1.8,0)]),('coplanar_inside',[(.2,.2,0),(.3,.2,0),(.2,.3,0)])]:
 controls[label]=len(base.overlap(BVHTree.FromPolygons(points,[(0,1,2)])))
assert controls['crossing'] and not controls['separated'] and not controls['disjoint_overlapping_bounds']
source=OUT/(stem+'.blend');source_hash=hashlib.sha256(source.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(source));rows=[]
shirt=bpy.data.objects['Luxury_Black shirt draft'];coat=bpy.data.objects['Luxury_Bomber continuous shell']
for frame in range(1,152):
 bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
 pairs=BVHTree.FromObject(shirt,dg).overlap(BVHTree.FromObject(coat,dg))
 rows.append({'frame':frame,'crossing_polygon_pairs':len(pairs),'example_pairs':pairs[:10]})
report={'source_sha256':source_hash,'scope':'Non-coplanar shirt/jacket surface crossings only; coplanar overlap is a known blind spot, demonstrated by controls. Pair counts do not measure visible pixels or penetration depth. Other accessories and self-intersections are not tested.','controls':controls,'summary':{'frames_with_crossings':sum(r['crossing_polygon_pairs']>0 for r in rows),'maximum_pairs':max(r['crossing_polygon_pairs'] for r in rows)},'poses':rows}
(OUT/(stem+'-layer-check.json')).write_text(json.dumps(report,indent=2)+'\n');print('LAYER_CHECK',report['summary'])
