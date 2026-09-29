"""Check the face-wisp revision, fixed attachments and nine evaluated poses."""
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

p=OUT/'hair-likeness-20260921';d=p/'face-wisp-pass'
face_names=['PLURR pony strands 0','PLURR pony strands 2']
changed=face_names+['PLURR loose brunette front locks','PLURR pony strands 3']
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
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in changed}
before={name:{'points':array(bpy.data.objects[name]),'structure':structure(bpy.data.objects[name]),'keys':keys(bpy.data.objects[name])} for name in changed}
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in changed}
old=json.loads((d/'before/female-native-validation.json').read_text())
native=json.loads((p/'female-native-validation.json').read_text());assert old['materials']==native['materials']
mesh_checks={};tested={};long_count=0
for name in changed:
    ob=bpy.data.objects[name];q=array(ob);old=before[name];roots=[];long=[];free=[]
    assert structure(ob)==old['structure'],name
    for ids in islands(ob):
        if name in face_names and len(ids)==36:long.extend(ids);continue
        retained=8 if name in face_names else (9 if name=='PLURR loose brunette front locks' else 4)
        roots.extend(ids[:retained]);free.extend(ids)
    kept=roots+long;assert np.array_equal(q[kept],old['points'][kept]),name
    drift=0.
    for key,value in keys(ob).items():
        assert np.array_equal(value[kept],old['keys'][key][kept]),(name,key)
        drift=max(drift,float(np.max(np.abs((value-q)-(old['keys'][key]-old['points'])))))
    assert drift<3e-7,(name,drift)
    ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles])
    def area(points):
        v=points[tri];return np.linalg.norm(np.cross(v[:,1]-v[:,0],v[:,2]-v[:,0]),axis=1)*.5
    assert np.isfinite(q).all() and not np.any((area(old['points'])>1e-12)&(area(q)<1e-14)),name
    mesh_checks[name]={'changedVertices':int(np.count_nonzero(np.linalg.norm(q-old['points'],axis=1)>1e-7)),
        'retainedRootVertices':len(roots),'retainedLongPonyVertices':len(long),'maxRelativeShapeDeltaChangeMm':drift*1000,'newlyDegenerateTriangles':0}
    tested[name]=free;long_count+=len(long)
assert long_count==14580
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';bpy.context.view_layer.update()
def inside(tree,point):
    votes=0
    for direction in [Vector((.231,.941,.247)).normalized(),Vector((-.723,.317,.614)).normalized(),Vector((.831,-.514,.211)).normalized()]:
        origin=Vector(point);count=0
        for _ in range(30):
            hit,_,_,_=tree.ray_cast(origin,direction,1)
            if hit is None:break
            count+=1;origin=hit+direction*.000003
        votes+=count%2
    return votes>=2
cases=dict(POSES)
cases['hair-cross-left']={'Secondary_HairSide':-1,'Secondary_HairBack':1}
cases['hair-cross-right']={'Secondary_HairSide':1,'Secondary_HairBack':-1}
rows=[]
for label,values in cases.items():
    set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
    for name in changed:
        points=array(bpy.data.objects[name],True)[tested[name]];gaps=[];covered=[]
        for point in points:
            hit,n,_,distance=body.find_nearest(Vector(point));signed=(Vector(point)-hit).dot(n)
            gaps.append(-distance if signed<0 and inside(body,point) else distance)
            front,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
            if front is not None and point[1]<front.y+.0005:covered.append(point.tolist())
        rows.append({'pose':label,'mesh':name,'vertices':len(points),'minimumSkinClearanceMm':min(gaps)*1000,
            'verticesInFrontOfLens':len(covered),'lensWitnesses':covered[:3],'closestPoint':points[int(np.argmin(gaps))].tolist()})
report={'unchangedOtherMeshContracts':len(contracts),'meshChecks':mesh_checks,'unchangedLongPonyVertices':long_count,
    'retainedTopologyUVWeightsAndColors':True,'hairMaterialManifestUnchanged':True,
    'poses':len(cases),'samples':rows,'minimumSkinClearanceMm':min(r['minimumSkinClearanceMm'] for r in rows),
    'maximumVerticesInFrontOfLens':max(r['verticesInFrontOfLens'] for r in rows),
    'scope':'All revised cheek/front/green-tuft vertices in nine finite rest-rig expression/secondary poses. Fixed roots and long pony coordinates/shapes retained exactly; 57 other mesh contracts retained. The prior 31-pose long-pony collar check remains applicable. No continuous, triangle-interior, goggle-frame or hair-self-contact guarantee.'}
(d/'native-face-wisp-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('FACE_WISPS_VALIDATED',json.dumps({k:v for k,v in report.items() if k!='samples'}),flush=True)
assert report['minimumSkinClearanceMm']>1.5,report['minimumSkinClearanceMm']
assert report['maximumVerticesInFrontOfLens']==0,report['maximumVerticesInFrontOfLens']
