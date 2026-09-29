"""Sample hanging pony edges against the body and either side of the jacket."""
import sys,json,bpy,numpy as np
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_groom_finish import islands
from audit_complete_expressions import set_pose,POSES

folder=OUT/'hair-likeness-20260921'
bpy.ops.wm.open_mainfile(filepath=str(folder/'female-hair-refined.blend'))
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';scene=bpy.context.scene
names=['PLURR pony strands 0','PLURR pony strands 1','PLURR pony strands 2']
indices={}
for name in names:
    # Cover the hanging portion through 88% of each ribbon, including both
    # outer edges. The remaining feathered tail is outside this finite check.
    indices[name]=np.concatenate([np.array(ids).reshape(18,2)[5:16].ravel()
        for ids in islands(bpy.data.objects[name]) if len(ids)==36])
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
    body_min=float('inf');coat_min=float('inf');body_count=0;coat_count=0;closest=None
    for name in names:
        points=array(bpy.data.objects[name],True)[indices[name]]
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
                    coat_min=min(coat_min,gap);coat_count+=1
    report.append({'clip':clip,'frame':frame,'shape':pose,'bodySamples':body_count,'closestBodyPoint':closest,
        'minimumBodyClearanceMm':body_min*1000,'jacketSurfaceSamples':coat_count,
        'minimumJacketClearanceMm':coat_min*1000 if coat_count else None})
result={'samples':report,'minimumBodyClearanceMm':min(r['minimumBodyClearanceMm'] for r in report),
    'minimumJacketClearanceMm':min(r['minimumJacketClearanceMm'] for r in report if r['jacketSurfaceSamples']),
    'scope':'31 finite native clip/secondary-shape poses; edges of existing long pony cards from samples 5–15 of 18. Body side uses front/back Y-ray columns and nearest-surface distance; jacket clearance accepts either exterior Y-ray surface through height 1.63 m. Not continuous collision, self-contact, hidden carrier, simplified LOD or arbitrary runtime-pose proof.'}
(folder/'female-cascade-clearance.json').write_text(json.dumps(result,indent=2)+'\n')
print('CASCADE_CLEARANCE',json.dumps({k:v for k,v in result.items() if k!='samples'}),flush=True)
assert result['minimumBodyClearanceMm']>0,result['minimumBodyClearanceMm']
assert result['minimumJacketClearanceMm']>0,result['minimumJacketClearanceMm']
