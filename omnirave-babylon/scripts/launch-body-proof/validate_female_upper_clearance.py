"""Check the edited upper pony, fiber and flyaway spans in 31 poses."""
import sys,json,bpy,numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_groom_finish import islands
from audit_complete_expressions import set_pose,POSES

folder=OUT/'hair-likeness-20260921'
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--output-directory',default='upper-flow-pass')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(folder/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';scene=bpy.context.scene
from refine_female_upper_flow import NAMES as names,active_card,end_pair
indices={};card_indices={}
for name in names:
    card_indices[name]=[np.array(ids).reshape(-1,2) for i,ids in enumerate(islands(bpy.data.objects[name])) if active_card(name,ids,i)]
    indices[name]=np.concatenate([ids[4:end_pair(len(ids))].ravel() for ids in card_indices[name]])
cases=[]
for clip in ['idle','walk','run']:
    action=bpy.data.actions[clip]
    for frame in np.linspace(*action.frame_range,9):cases.append((clip,float(frame),{}))
cases += [('idle',1,POSES['hair-left']),('idle',1,POSES['hair-right'])]
cases += [('idle',1,{'Secondary_HairSide':side,'Secondary_HairBack':back}) for side,back in [(-1,1),(1,-1)]]
report=[]
for clip,frame,pose in cases:
    rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(int(frame),subframe=frame%1);set_pose(pose)
    body=Surface(rig,bpy.data.objects['AvatarBody'])
    coats=[Surface(rig,bpy.data.objects[n]) for n in ['Structured armhole jacket','PLURR folded hood']]
    body_min=float('inf');coat_min=float('inf');body_count=0;coat_count=0;closest=None;closest_coat=None
    intersections=0;body_intersections=0;witnesses=[]
    for name in names:
        all_points=array(bpy.data.objects[name],True);points=all_points[indices[name]]
        for vertex,p in zip(indices[name],points):
            _,_,_,distance=body.tree.find_nearest(Vector(p))
            # A nearest triangle's normal misclassifies points beside the
            # concave ear: its plane extends far outside the body. Determine
            # side from front/back body ray intersections at this X/Z instead.
            back,_,_,_=body.tree.ray_cast(Vector((p[0],.5,p[2])),Vector((0,-1,0)),1)
            front,_,_,_=body.tree.ray_cast(Vector((p[0],-.5,p[2])),Vector((0,1,0)),1)
            inside=back is not None and front is not None and front.y<=p[1]<=back.y
            gap=-distance if inside else distance
            if gap<body_min:closest={'mesh':name,'vertex':int(vertex),'position':p.tolist()}
            body_min=min(body_min,gap);body_count+=1
            if p[2]>1.63:continue
            for coat in coats:
                front,_,_,_=coat.tree.ray_cast(Vector((p[0],-.5,p[2])),Vector((0,1,0)),1)
                back,_,_,_=coat.tree.ray_cast(Vector((p[0],.5,p[2])),Vector((0,-1,0)),1)
                if front is not None and back is not None:
                    # Either exterior side is valid for hair: some locks hang
                    # behind the jacket while the new layer drapes in front.
                    gap=max(front.y-p[1],p[1]-back.y)
                    if gap<coat_min:closest_coat={'mesh':name,'vertex':int(vertex),'position':p.tolist(),
                        'jacket':coat.body.name,'frontY':front.y,'backY':back.y}
                    coat_min=min(coat_min,gap);coat_count+=1
        # Endpoints outside a folded surface can still straddle a fold. Check
        # the free longitudinal and cross-card edges against actual triangles.
        for ids in card_indices[name]:
            card=all_points[ids]
            for j in range(4,end_pair(len(ids))+1):
                for a,b in [(card[j-1,0],card[j,0]),(card[j-1,1],card[j,1]),(card[j,0],card[j,1])]:
                    direction=Vector(b-a);length=direction.length
                    if length<1e-8:continue
                    hit,_,_,_=body.tree.ray_cast(Vector(a),direction.normalized(),length)
                    if hit is not None:body_intersections+=1
                    if min(a[2],b[2])>1.63:continue
                    for coat in coats:
                        hit,_,_,_=coat.tree.ray_cast(Vector(a),direction.normalized(),length)
                        if hit is not None:
                            intersections+=1
                            if len(witnesses)<5:witnesses.append({'mesh':name,'pair':j,'firstVertex':int(ids[0,0]),'jacket':coat.body.name,'hit':list(hit)})
    report.append({'clip':clip,'frame':frame,'shape':pose,'bodySamples':body_count,'closestBodyPoint':closest,
        'minimumBodyClearanceMm':body_min*1000,'jacketSurfaceSamples':coat_count,
        'closestJacketPoint':closest_coat,
        'strandEdgeBodyIntersections':body_intersections,'strandEdgeJacketIntersections':intersections,'intersectionWitnesses':witnesses,
        'minimumJacketClearanceMm':coat_min*1000 if coat_count else None})
result={'samples':report,'minimumBodyClearanceMm':min(r['minimumBodyClearanceMm'] for r in report),
    'minimumJacketClearanceMm':min((r['minimumJacketClearanceMm'] for r in report if r['jacketSurfaceSamples']),default=None),
    'maximumStrandEdgeBodyIntersections':max(r['strandEdgeBodyIntersections'] for r in report),
    'maximumStrandEdgeJacketIntersections':max(r['strandEdgeJacketIntersections'] for r in report),
    'scope':'31 finite native clip/secondary-shape poses. Both edges of changed upper spans in 852 long pony, 240 inner fiber and 120 long flyaway cards, plus longitudinal/cross-card edges through both retained joins. Body side uses front/back Y-ray columns and nearest-surface distance; edges ray-test actual body triangles. Jacket accepts either exterior Y surface below 1.63 m with edge/triangle checks. Excludes continuous contact, full triangle interiors, self-contact, hidden carrier, simplified LODs and arbitrary runtime poses.'}
(folder/args.output_directory/'upper-span-clearance.json').write_text(json.dumps(result,indent=2)+'\n')
print('CASCADE_CLEARANCE',json.dumps({k:v for k,v in result.items() if k!='samples'}),flush=True)
assert result['minimumBodyClearanceMm']>0,result['minimumBodyClearanceMm']
assert result['minimumJacketClearanceMm'] is None or result['minimumJacketClearanceMm']>0,result['minimumJacketClearanceMm']
assert result['maximumStrandEdgeBodyIntersections']==0,result['maximumStrandEdgeBodyIntersections']
assert result['maximumStrandEdgeJacketIntersections']==0,result['maximumStrandEdgeJacketIntersections']
