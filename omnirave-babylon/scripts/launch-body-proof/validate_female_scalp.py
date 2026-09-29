"""Finite scalp-card edge clearance and exact preservation of other meshes.

The existing attachment/animation audit covers all clips. This probe separately
checks the changed scalp edges in the seven authored expression/hair poses.
Goggle lens checks concern projected visible occlusion, not hardware contact.
"""
import json, sys
from pathlib import Path
import bpy, numpy as np
from mathutils import Vector

sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from audit_complete_expressions import POSES,set_pose

folder=OUT/'hair-likeness-20260921'
name='PLURR swept scalp groom'
bpy.ops.wm.open_mainfile(filepath=str(folder/'scalp-pass/before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=name}
bpy.ops.wm.open_mainfile(filepath=str(folder/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=name}
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST'
bpy.context.view_layer.update()

def inside(tree,point):
    # Recheck negative nearest-normal signs by ray parity; concave ears can
    # otherwise misclassify nearby exterior points.
    votes=0
    for direction in [Vector((.231,.941,.247)).normalized(),Vector((-.723,.317,.614)).normalized(),Vector((.831,-.514,.211)).normalized()]:
        origin=Vector(point);count=0
        for _ in range(30):
            hit,_,_,_=tree.ray_cast(origin,direction,1)
            if hit is None:break
            count+=1;origin=hit+direction*.000003
        votes+=count%2
    return votes>=2

rows=[]
for label,values in POSES.items():
    set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
    points=array(bpy.data.objects[name],True);gaps=[];covered=[]
    for p in points:
        hit,n,_,distance=body.find_nearest(Vector(p))
        signed=(Vector(p)-hit).dot(n)
        gaps.append(-distance if signed<0 and inside(body,p) else distance)
        front,_,_,_=lens.ray_cast(Vector((p[0],-.5,p[2])),Vector((0,1,0)),1)
        if front is not None and p[1]<front.y+.0005:covered.append(p.tolist())
    rows.append({'pose':label,'cardEdges':len(points),'minimumSkinClearanceMm':min(gaps)*1000,
                 'verticesInFrontOfLens':len(covered),'lensWitnesses':covered[:3],
                 'closestPoint':points[int(np.argmin(gaps))].tolist()})
report={'unchangedOtherMeshContracts':len(contracts),'samples':rows,
        'minimumSkinClearanceMm':min(r['minimumSkinClearanceMm'] for r in rows),
        'maximumVerticesInFrontOfLens':max(r['verticesInFrontOfLens'] for r in rows),
        'scope':'All scalp-card vertices in seven finite rest-rig expression/hair poses. No continuous or triangle-interior collision, goggle frame contact, or hair self-contact guarantee.'}
(folder/'scalp-pass/female-scalp-clearance.json').write_text(json.dumps(report,indent=2)+'\n')
print('SCALP_CLEARANCE',json.dumps(report),flush=True)
assert report['minimumSkinClearanceMm']>.5,report['minimumSkinClearanceMm']
assert report['maximumVerticesInFrontOfLens']==0,report['maximumVerticesInFrontOfLens']
