"""Male-only finite-sample validation against this pass's archived source."""
import hashlib, json, sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0, str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_reference_hair import PASS
from refine_complete_foil_finish import geometry_contract
from complete_pair_geometry import Surface
from audit_complete_expressions import POSES, set_pose
from validate_reference_hair import run as validate_motion
from refine_male_loose_fringe import skin_gap, point_inside

folder = PASS/'male-crown-flow-20260926'
name = 'Luxury retained swept groom'
def structure(ob):
    h = hashlib.sha256()
    for face in ob.data.polygons:
        h.update(np.asarray(face.vertices, dtype=np.int32).tobytes())
        h.update(str(face.material_index).encode())
    for layer in ob.data.uv_layers:
        h.update(np.asarray([v.uv[:] for v in layer.data], dtype=np.float32).tobytes())
    for v in ob.data.vertices:
        h.update(repr([(g.group, g.weight) for g in v.groups]).encode())
    h.update(repr([m.name for m in ob.data.materials]).encode())
    h.update(repr(tuple(tuple(row) for row in ob.matrix_world)).encode())
    return h.hexdigest()

bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
unchanged = {o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=name}
ob = bpy.data.objects[name]; old = array(ob); old_structure = structure(ob)
old_shapes = {k.name:np.array([v.co[:] for v in k.data])-old for k in ob.data.shape_keys.key_blocks}
ob.data.calc_loop_triangles(); tri = np.array([t.vertices[:] for t in ob.data.loop_triangles])
area = lambda p: np.linalg.norm(np.cross(p[tri[:,1]]-p[tri[:,0]], p[tri[:,2]]-p[tri[:,0]]), axis=1)
old_degenerate = area(old)<1e-14

bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
assert unchanged == {o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=name}
ob = bpy.data.objects[name]; new = array(ob)
assert structure(ob)==old_structure
assert np.isfinite(new).all()
assert np.array_equal(new.reshape(-1,12,2,3)[:,:2], old.reshape(-1,12,2,3)[:,:2])
delta_error = max(float(np.abs(np.array([v.co[:] for v in k.data])-new-old_shapes[k.name]).max()) for k in ob.data.shape_keys.key_blocks)
assert delta_error<3e-7, delta_error
new_degenerate = area(new)<1e-14
assert not np.any(new_degenerate & ~old_degenerate)
changed = np.flatnonzero(np.linalg.norm(new-old,axis=1)>2e-7)
rig=bpy.data.objects['AvatarSkeleton']; rig.data.pose_position='POSE'
rig.animation_data.action=bpy.data.actions['idle']; bpy.context.scene.frame_set(1)
poses = {**POSES, 'hair-mixed-left':{'Secondary_HairSide':-1,'Secondary_HairBack':1},
         'hair-mixed-right':{'Secondary_HairSide':1,'Secondary_HairBack':-1}}
clearance={}
for label, values in poses.items():
    set_pose(values); body=Surface(rig,bpy.data.objects['AvatarBody'])
    points=array(ob,True)[changed]
    center = np.mean([array(bpy.data.objects['AvatarEye_'+side],True).mean(0) for side in ['l','r']],axis=0)
    center[1]+=.065; center[2]+=.023
    assert point_inside(body.tree,Vector(center)), 'Inside-head ray control failed'
    assert not point_inside(body.tree,Vector(center)+Vector((.3,0,0))), 'Outside-head ray control failed'
    gaps=[]; concave_normal_signs=0
    for point in points:
        gap,plane=skin_gap(body.tree,Vector(point));gaps.append(gap)
        concave_normal_signs += int(plane<0 and gap>0)
    gaps=np.array(gaps)
    clearance[label]={'minimumSkinClearanceMm':float(gaps.min()*1000),'belowHalfMm':int(np.count_nonzero(gaps<.0005)),
                      'outsideVerticesWithConcaveNormalSign':concave_normal_signs,'rayControlsPassed':True}
    print('MALE_CLEARANCE',label,json.dumps(clearance[label]),flush=True)
report={'unchangedMeshes':len(unchanged),'changedVertices':len(changed),'rootPairsExact':2,
        'topologyUVsWeightsMaterialsTransformsPreserved':True,'maxRelativeMorphErrorMm':delta_error*1000,
        'noNewDegenerateTriangles':True,'sampledSkinClearance':clearance,
        'scope':'Nine expression/secondary-motion samples; nearest skin distances on changed vertices with five-ray parity resolving concave normal signs. Inside/outside ray controls tested per pose. No continuous or hair-to-hair collision guarantee.'}
(folder/'native-checks.json').write_text(json.dumps(report,indent=2)+'\n')
assert all(v['belowHalfMm']==0 for v in clearance.values()), 'Inspect sampled hair/skin clearance'
validate_motion('male',False)
print('MALE_NATIVE_CHECKS_PASSED',flush=True)
