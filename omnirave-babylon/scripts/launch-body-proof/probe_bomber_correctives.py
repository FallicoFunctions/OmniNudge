"""Probe a local jacket surface corrective without saving a model candidate.

One selected authored pose, left side only; no interpolation or export claim.
The contact-seeded patch is smoothed against the body and the outer top wall,
with eight-ring falloff and pinned ribbing plus two adjacent edge rings. The
opposite side remains an unchanged control. Paired fabric walls are rebuilt
locally. A passing count would still require shape review, motion and actual
GLB validation; this diagnostic never promotes an avatar.
"""
# Connection map: retain all jacket triangles, shared seams and paired walls.
# Correct only a graph neighborhood of left-side contact faces in pose space.
import bpy,sys,json,hashlib,argparse,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from validate_body05_tops import geometry,between,body_snapshot
from surface_crossings import strict_pairs,crossing
P=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof';bpy.ops.wm.open_mainfile(filepath=str(P/'male-outfit04.blend'));s=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];coat=bpy.data.objects['Luxury_Bomber rebuilt shell'];body=bpy.data.objects['AvatarBody'];top=bpy.data.objects['AvatarTop_tailored'];h=len(coat.data.vertices)//2
parser=argparse.ArgumentParser();parser.add_argument('--frame',type=int,choices=[1,31,61,91,121],default=1);parser.add_argument('--iterations',type=int,choices=[20,60,160],default=160);parser.add_argument('--render',action='store_true');parser.add_argument('--require-clear',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
source_hash=hashlib.sha256((P/'male-outfit04.blend').read_bytes()).hexdigest();original_body=body_snapshot(body);original_top=body_snapshot(top)
fixture=json.loads((P/'top01-diagonal-control.json').read_text());detected=sum(crossing(*[[Vector(p) for p in t] for t in sample['points']]) for sample in fixture['examples']);assert detected==8
s.frame_set(args.frame);bpy.context.view_layer.update();p,t=geometry(coat);q,u=geometry(body);v,w=geometry(top)
mid0=[(p[i]+p[i+h])*.5 for i in range(h)];mt=[ids for ids in t if max(ids)<h];adj=[set() for _ in range(h)]
for tri in mt:
 for a in tri:adj[a].update(set(tri)-{a})
sh=strict_pairs(p,t);bh=between(p,t,q,u);th=between(p,t,v,w)
seed={i%h for a,b in sh for ti in (a,b) for i in t[ti] if mid0[i%h].x>.02}|{i%h for a,b in bh+th for i in t[a] if mid0[i%h].x>.02}
mask=[0. for _ in range(h)];seen=set(seed);front=set(seed)
for i in seed:mask[i]=1
for step in range(1,9):
 front={j for i in front for j in adj[i] if j not in seen and mid0[j].x>.015};seen.update(front)
 for i in front:mask[i]=(1-step/9)**2*(1+2*step/9)
# Keep all ribbed border geometry and two adjacent edge rings fixed.
pinned={i%h for f in coat.data.polygons if f.material_index!=0 for i in f.vertices}
for _ in range(2):pinned|={j for i in pinned for j in adj[i]}
for i in pinned:mask[i]=0
colliders=[BVHTree.FromPolygons(q,u,all_triangles=True),BVHTree.FromPolygons(v,[ids for ids in w if max(ids)<len(v)//2],all_triangles=True)]
def walls(mid):
 ns=[Vector() for _ in range(h)]
 for a,b,c in mt:
  n=(mid[b]-mid[a]).cross(mid[c]-mid[a])
  for i in (a,b,c):ns[i]+=n
 out=[]
 for wall in [0,1]:
  for i in range(h):
   if mask[i]==0:
    out.append(p[i+wall*h].copy());continue
   target=mid[i]+ns[i].normalized()*(.0005 if wall==0 else -.0005)
   # Midpoints already have falloff. Apply it only to the wall-normal change.
   delta=target-mid[i]-(p[i+wall*h]-mid0[i]);out.append(p[i+wall*h]+(mid[i]-mid0[i])+delta*mask[i])
 return out
rows=[]
def check(points,it):
 sh=strict_pairs(points,t);bh=between(points,t,q,u);th=between(points,t,v,w)
 left=lambda hits,own:sum(any(points[i].x>0 for ti in ((a,b) if own else (a,)) for i in t[ti]) for a,b in hits)
 row={'iteration':it,'self':len(sh),'body':len(bh),'top':len(th),'left_self':left(sh,True),'left_body':left(bh,False),'left_top':left(th,False),'max_change_m':max((a-b).length for a,b in zip(points,p))};print('LOCAL_FAIR',row,flush=True);rows.append(row)
check(p,0);mid=[x.copy() for x in mid0]
for it in range(1,args.iterations+1):
 nxt=[]
 for i,x in enumerate(mid):
  if not mask[i]:nxt.append(x);continue
  average=sum((mid[j] for j in adj[i]),Vector())/len(adj[i]);n=x.lerp(average,.45*mask[i])
  for _ in range(2):
   for ci,tree in enumerate(colliders):
    hit,normal,idx,d=tree.find_nearest(n);signed=(n-hit).dot(normal)
    if signed<.003 and (ci==0 or d<.012):n+=(normal*min(.004,.003-signed))*mask[i]
  nxt.append(n)
 mid=nxt
 if it in [5,20,60,160]:
  check(walls(mid),it)


result=walls(mid)
assert all(math.isfinite(x) for point in result for x in point)
assert all(tuple(result[i+wall*h])==tuple(p[i+wall*h]) for i in range(h) if mask[i]==0 for wall in [0,1]),'Pinned or opposite-side geometry changed'
assert body_snapshot(body)==original_body and body_snapshot(top)==original_top,'Body or top changed'
last=rows[-1];passed=not (last['self'] or last['body'] or last['top'])
report={'source':'male-outfit04.blend','source_sha256':source_hash,'scope':__doc__,'frame':args.frame,'iterations':args.iterations,'body_and_top_preserved_in_memory':True,'pinned_and_opposite_side_vertices_exact':True,'recorded_crossing_control_detected':detected,'local_contact_seed_vertices':len(seed),'nonzero_falloff_vertices_after_pinning':sum(v>0 for v in mask),'pinned_border_vertices_per_wall':len(pinned),'parameters':{'smoothing_factor':.45,'falloff_edge_rings':8,'border_pin_edge_rings':2,'midsurface_clearance_m':.003,'maximum_projection_step_m':.004,'top_projection_search_limit_m':.012,'fabric_wall_m':.001},'rows':rows,'passed':passed,'status':'DIAGNOSTIC_ONLY_NO_MODEL_EXPORT'}
output=P/f'male-outfit04-local-corrective-frame{args.frame}.json';output.write_text(json.dumps(report,indent=2)+'\n')
if args.render:
 from mathutils import Matrix
 from build_bodies import review
 skin={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
 for vert,point in zip(coat.data.vertices,result):
  matrix=Matrix(((0,0,0,0),)*4)
  for g in vert.groups:matrix+=skin[coat.vertex_groups[g.group].name]*g.weight
  vert.co=matrix.inverted()@point
 coat.data.update();bpy.context.view_layer.update()
 # Diagnostic materials exist in this render only. The source is never saved.
 sh=strict_pairs(result,t);bh=between(result,t,q,u);th=between(result,t,v,w)
 marked={i for pair in sh for i in pair}|{a for a,b in bh+th}
 red=bpy.data.materials.new('Unresolved garment contacts');red.use_nodes=True;bs=red.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(.65,.005,.008,1);bs.inputs['Roughness'].default_value=.65;slot=len(coat.data.materials);coat.data.materials.append(red)
 for i in marked:coat.data.polygons[i].material_index=slot
 camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=1.14;camera.location=(1,-4,1.35);review.look_at(camera,Vector((0,0,1.28)));s.render.resolution_x=960;s.render.resolution_y=900;s.render.filepath=str(P/f'male-outfit04-local-corrective-frame{args.frame}.png');bpy.ops.render.render(write_still=True)
assert hashlib.sha256((P/'male-outfit04.blend').read_bytes()).hexdigest()==source_hash
print('LOCAL_CORRECTIVE_DIAGNOSTIC',report['status'],passed,flush=True)
if args.require_clear:assert passed,'Local jacket corrective still has contacts; no model was exported'
