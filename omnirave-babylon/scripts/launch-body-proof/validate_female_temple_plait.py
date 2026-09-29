"""Verify the two revised meshes against the preceding delivered source."""
import json,sys,hashlib
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
from audit_complete_expressions import POSES,set_pose

p=OUT/'hair-likeness-20260921';d=p/'temple-plait-pass'
names=['PLURR reference temple braid','PLURR swept scalp groom']
def structure(ob):
    h=hashlib.sha256()
    for f in ob.data.polygons:h.update(np.asarray(f.vertices,dtype=np.int32).tobytes())
    for layer in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
    for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
    for attr in ob.data.color_attributes:h.update(np.asarray([v.color[:] for v in attr.data],dtype=np.float32).tobytes())
    return h.hexdigest()
def keys(ob):
    return {k.name:np.array([v.co[:] for v in k.data]) for k in ob.data.shape_keys.key_blocks} if ob.data.shape_keys else {}
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in names}
before={n:{'points':array(bpy.data.objects[n]),'structure':structure(bpy.data.objects[n]),'keys':keys(bpy.data.objects[n])} for n in names}
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in names}
checks={};tested={}
for name in names:
    ob=bpy.data.objects[name];q=array(ob);old=before[name]
    assert structure(ob)==old['structure'],name
    changed=np.flatnonzero(np.linalg.norm(q-old['points'],axis=1)>1e-7)
    assert len(changed)>0
    kept=[];upper=[]
    if name==names[1]:
        for ids in islands(ob):
            kept.extend(ids[:4]+ids[-4:])
            rows=np.array(ids).reshape(24,2)
            upper.extend(rows[old['points'][ids].reshape(24,2,3).mean(1)[:,2]>=1.716].ravel().tolist())
        assert np.array_equal(q[kept],old['points'][kept])
        assert np.array_equal(q[upper],old['points'][upper])
    drift=0.
    for key,value in keys(ob).items():
        if kept:assert np.array_equal(value[kept],old['keys'][key][kept])
        drift=max(drift,float(np.max(np.abs((value-q)-(old['keys'][key]-old['points'])))))
    assert drift<3e-7
    ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
    def area(points):
        v=points[tri];return np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)*.5
    assert np.isfinite(q).all() and not np.any((area(old['points'])>1e-12)&(area(q)<1e-14)),name
    checks[name]={'changedVertices':len(changed),'retainedEndVertices':len(kept),'retainedUpperCrownVertices':len(upper),'relativeShapeRoundingMm':drift*1000,'newDegenerateTriangles':0}
    tested[name]=changed
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';bpy.context.view_layer.update()
rows=[]
for label,values in POSES.items():
    set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
    scalp=Surface(rig,bpy.data.objects['Complete scalp']).tree
    for name in names:
        points=array(bpy.data.objects[name],True)[tested[name]];gaps=[];cap_gaps=[];covered=0
        for point in points:
            hit,n,_,dist=body.find_nearest(Vector(point));gaps.append((Vector(point)-hit).dot(n)*1000)
            hit,n,_,dist=scalp.find_nearest(Vector(point));cap_gaps.append((Vector(point)-hit).dot(n)*1000)
            front,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
            if front is not None and point[1]<front.y+.0005:covered+=1
        rows.append({'pose':label,'mesh':name,'vertices':len(points),'minimumSkinGapMm':min(gaps),
            'minimumCapGapMm':min(cap_gaps),'maximumCapGapMm':max(cap_gaps),'verticesInFrontOfLens':covered})
report={'unchangedOtherMeshContracts':len(contracts),'meshChecks':checks,'topologyUVWeightsColorsRetained':True,
    'poses':len(POSES),'samples':rows,'minimumSkinGapMm':min(r['minimumSkinGapMm'] for r in rows),
    'minimumCapGapMm':min(r['minimumCapGapMm'] for r in rows),'maximumVerticesInFrontOfLens':max(r['verticesInFrontOfLens'] for r in rows),
    'scope':'Changed braid and scalp-card vertices in seven finite rest-rig expression/secondary poses; no continuous, triangle-interior or hair-self-contact guarantee. Other geometry and shapes exact; preceding face-wisp and long-pony clearance remain applicable.'}
(d/'native-temple-plait-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('TEMPLE_PLAIT_CHECKS',json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
assert report['minimumSkinGapMm']>1.5
assert report['minimumCapGapMm']>.5
assert report['maximumVerticesInFrontOfLens']==0
