"""Measure directional body/top-to-arm gaps in the preserved jacket control.

The +X ray grid samples only the left side at four authored poses. Majority
skin influence distinguishes torso/arm surfaces from unrelated body folds.
These directional samples do not establish a global minimum, garment fit,
continuous-time safety or an impossibility result. No model file is written.
"""
import bpy,sys,json,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from validate_body05_tops import geometry
P=Path(__file__).resolve().parents[2]/'assets-src/avatars/launch-body-proof';bpy.ops.wm.open_mainfile(filepath=str(P/'male-outfit04.blend'));s=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];body=bpy.data.objects['AvatarBody'];top=bpy.data.objects['AvatarTop_tailored'];rows=[]
def hits(tree,y,z):
 x=.001;out=[]
 for _ in range(20):
  point,normal,i,d=tree.ray_cast(Vector((x,y,z)),Vector((1,0,0)),.5-x)
  if point is None:break
  if not out or abs(point.x-out[-1]['x'])>1e-5:out.append({'x':point.x,'nx':normal.x,'triangle':i})
  x=point.x+1e-5
  if x>=.5:break
 return out
# Independent ray calibration: known 5 mm gap between two closed boxes.
def calibration_box(x0,x1):
 points=[Vector((x,y,z)) for z in [1.,1.5] for x,y in [(x0,-.1),(x1,-.1),(x1,.1),(x0,.1)]]
 faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
 return points,faces
a,at=calibration_box(0,.15);b,bt=calibration_box(.155,.20)
control_hits=hits(BVHTree.FromPolygons(a+b,at+[tuple(i+8 for i in f) for f in bt]),0,1.25)
assert len(control_hits)==3 and control_hits[0]['nx']>0 and control_hits[1]['nx']<0
control_gap=control_hits[1]['x']-control_hits[0]['x'];assert abs(control_gap-.005)<1e-6
for frame in [1,61,91,121]:
 s.frame_set(frame);bpy.context.view_layer.update();p,t=geometry(body);q,u=geometry(top);bvh=BVHTree.FromPolygons(p,t,all_triangles=True);tv=BVHTree.FromPolygons(q,u,all_triangles=True)
 for zi in range(97,143):
  z=zi/100
  for yi in range(-16,15):
   y=yi*.005;bh=hits(bvh,y,z)
   # Torso exit followed by an arm entry and exit along the same horizontal ray.
   if len(bh)<3 or not (bh[0]['nx']>0 and bh[1]['nx']<0 and bh[2]['nx']>0):continue
   def role(hit):
    influence={}
    for vi in t[hit['triangle']]:
     for g in body.data.vertices[vi].groups:
      name=body.vertex_groups[g.group].name;influence[name]=influence.get(name,0)+g.weight/3
    return {'arm':sum(influence.get(n,0) for n in ['upperarm_l','lowerarm_l']),'torso':sum(weight for name,weight in influence.items() if name.startswith('spine_') or name=='pelvis')}
   exit_role=role(bh[0]);entry_role=role(bh[1])
   if exit_role['torso']<.5 or entry_role['arm']<.5:continue
   left,right=bh[0]['x'],bh[1]['x'];th=hits(tv,y,z);top_exit=max((x['x'] for x in th if left<x['x']<right and x['nx']>0),default=None)
   rows.append({'frame':frame,'y':y,'z':z,'torso_exit_x':left,'arm_entry_x':right,'body_gap_m':right-left,'torso_exit_influence':exit_role,'arm_entry_influence':entry_role,'top_outer_x':top_exit,'remaining_after_top_m':None if top_exit is None else right-top_exit})
summary=[]
for f in [1,61,91,121]:
 subset=[r for r in rows if r['frame']==f];layered=[r for r in subset if r['remaining_after_top_m'] is not None]
 row={'frame':f,'body_gap_rays':len(subset),'layered_rays':len(layered),'under_2mm_after_top_rays':sum(r['remaining_after_top_m']<.002 for r in layered),'smallest_body_gaps':sorted(subset,key=lambda r:r['body_gap_m'])[:5],'smallest_layered_gaps':sorted(layered,key=lambda r:r['remaining_after_top_m'])[:8]};summary.append(row);print('GAP_SUMMARY',json.dumps(row),flush=True)
(P/'male-outfit04-clearance-probe.json').write_text(json.dumps({'source':'male-outfit04.blend','source_sha256':hashlib.sha256((P/'male-outfit04.blend').read_bytes()).hexdigest(),'calibration':{'expected_gap_m':.005,'measured_gap_m':control_gap,'passed':True},'scope':'Horizontal +X rays on a 5 mm Y by 10 mm Z grid, left side only. Require torso/pelvis majority influence on exit and upper/lower-arm majority influence on entry; unrelated thigh folds are excluded. Directional sampled gaps, not global minimum distances or proof of impossibility.','summary':summary,'total_classified_rays':len(rows),'status':'DIAGNOSTIC_ONLY_NOT_A_GARMENT_CLEARANCE_PASS'},indent=2))
