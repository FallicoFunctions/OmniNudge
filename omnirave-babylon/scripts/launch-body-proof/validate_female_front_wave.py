"""Finite front-lock edge clearance and exact preservation of other meshes.

The existing attachment/animation audit covers all clips. This probe separately
checks the changed front-lock edges in the seven authored expression/hair poses.
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
from refine_complete_groom_finish import islands

folder=OUT/'hair-likeness-20260921'
changed=['Complete scalp','PLURR swept scalp groom','PLURR reference temple braid','PLURR loose brunette front locks']
face_names=['PLURR pony strands 0','PLURR pony strands 2']
changed+=face_names
bpy.ops.wm.open_mainfile(filepath=str(folder/'front-wave-pass/before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in changed}
retained={}
for name in face_names:
    ob=bpy.data.objects[name];ids=np.concatenate([part for part in islands(ob) if len(part)!=34])
    retained[name]=(ids,array(ob)[ids],{k.name:np.array([v.co[:] for v in k.data])[ids] for k in ob.data.shape_keys.key_blocks})
bpy.ops.wm.open_mainfile(filepath=str(folder/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in changed}
for name,(ids,points,keys) in retained.items():
    ob=bpy.data.objects[name];assert np.array_equal(points,array(ob)[ids]),name
    for key,points in keys.items():assert np.array_equal(points,np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[key].data])[ids]),(name,key)
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
    for name in changed:
        points=array(bpy.data.objects[name],True);gaps=[];covered=[]
        root_distance=None
        if name in face_names:
            parts=[ids for ids in islands(bpy.data.objects[name]) if len(ids)==34]
            scalp=Surface(rig,bpy.data.objects['Complete scalp']).tree
            root_distance=max(scalp.find_nearest(Vector(points[ids[:2]].mean(0)))[3] for ids in parts)*1000
            assert root_distance<3,(name,label,root_distance)
            points=points[np.concatenate(parts)]
        for p in points:
            hit,n,_,distance=body.find_nearest(Vector(p))
            signed=(Vector(p)-hit).dot(n)
            gaps.append(-distance if signed<0 and inside(body,p) else distance)
            front,_,_,_=lens.ray_cast(Vector((p[0],-.5,p[2])),Vector((0,1,0)),1)
            if front is not None and p[1]<front.y+.0005:covered.append(p.tolist())
        rows.append({'pose':label,'mesh':name,'vertices':len(points),'minimumSkinClearanceMm':min(gaps)*1000,
                     'verticesInFrontOfLens':len(covered),'lensWitnesses':covered[:3],
                     'cheekRootDistanceMm':root_distance,'closestPoint':points[int(np.argmin(gaps))].tolist()})
report={'unchangedOtherMeshContracts':len(contracts),'samples':rows,
        'minimumSkinClearanceMm':min(r['minimumSkinClearanceMm'] for r in rows),
        'maximumVerticesInFrontOfLens':max(r['verticesInFrontOfLens'] for r in rows),
        'poses':len(POSES),'changedMeshes':changed,
        'unchangedLongPonyVertices':sum(len(v[0]) for v in retained.values()),
        'scope':'All vertices of four revised scalp/front/braid meshes plus retained cheek-lock edges in seven finite rest-rig expression/hair poses. Long pony vertices and shape coordinates on the shared meshes match the preceding source exactly. No continuous or triangle-interior collision, goggle frame contact, or hair self-contact guarantee.'}
(folder/'front-wave-pass/female-front-wave-clearance.json').write_text(json.dumps(report,indent=2)+'\n')
print('FRONT_WAVE_CLEARANCE',json.dumps(report),flush=True)
assert report['minimumSkinClearanceMm']>.5,report['minimumSkinClearanceMm']
assert report['maximumVerticesInFrontOfLens']==0,report['maximumVerticesInFrontOfLens']
