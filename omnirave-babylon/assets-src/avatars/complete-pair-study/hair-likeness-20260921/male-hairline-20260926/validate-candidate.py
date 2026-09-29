"""Check the lowered male hairline, carrier attachments and unchanged rig."""
import hashlib,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_reference_hair import PASS
from refine_male_hairline import NAMES
from refine_male_loose_fringe import skin_gap,point_inside
from refine_complete_foil_finish import geometry_contract
from complete_pair_geometry import Surface
from audit_complete_expressions import POSES,set_pose
from validate_reference_hair import run as validate_motion

folder=PASS/'male-hairline-20260926'
def structure(ob):
    h=hashlib.sha256()
    for f in ob.data.polygons:
        h.update(np.array(f.vertices,dtype=np.int32).tobytes());h.update(str(f.material_index).encode())
    for layer in ob.data.uv_layers:h.update(np.array([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
    for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
    h.update(repr([m.name for m in ob.data.materials]).encode())
    h.update(repr(tuple(tuple(row) for row in ob.matrix_world)).encode())
    return h.hexdigest()

bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
unchanged={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
originals={};contracts={};shapes={};triangles={};degenerate={}
for name in NAMES:
    ob=bpy.data.objects[name];p=array(ob);originals[name]=p;contracts[name]=structure(ob)
    shapes[name]={k.name:np.array([v.co[:] for v in k.data])-p for k in ob.data.shape_keys.key_blocks} if ob.data.shape_keys else {}
    ob.data.calc_loop_triangles();tri=np.array([t.vertices[:] for t in ob.data.loop_triangles]);triangles[name]=tri
    degenerate[name]=np.linalg.norm(np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]]),axis=1)<1e-14
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
assert unchanged=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
changed={};morph_error=0
for name in NAMES:
    ob=bpy.data.objects[name];p=array(ob);old=originals[name];tri=triangles[name]
    assert structure(ob)==contracts[name],name
    assert np.isfinite(p).all(),name
    area=np.linalg.norm(np.cross(p[tri[:,1]]-p[tri[:,0]],p[tri[:,2]]-p[tri[:,0]]),axis=1)
    assert not np.any((area<1e-14)&~degenerate[name]),name
    changed[name]=np.flatnonzero(np.linalg.norm(p-old,axis=1)>2e-7)
    if ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:
            morph_error=max(morph_error,float(np.abs(np.array([v.co[:] for v in key.data])-p-shapes[name][key.name]).max()))
    if name=='Complete scalp':assert np.array_equal(p[old[:,2]>=1.8],old[old[:,2]>=1.8])
    if name in ['Luxury retained swept groom','Polished male flyaways']:
        stride=12 if name.startswith('Luxury') else 10
        unchanged_end=np.linspace(0,1,stride)>=.72
        assert np.array_equal(p.reshape(-1,stride,2,3)[:,unchanged_end],old.reshape(-1,stride,2,3)[:,unchanged_end]),name
assert morph_error<3e-7,morph_error
rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE'
rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
poses={**POSES,'hair-mixed-left':{'Secondary_HairSide':-1,'Secondary_HairBack':1},'hair-mixed-right':{'Secondary_HairSide':1,'Secondary_HairBack':-1}}
clearance={}
for label,values in poses.items():
    set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody'])
    center=np.mean([array(bpy.data.objects['AvatarEye_'+s],True).mean(0) for s in ['l','r']],axis=0);center[1]+=.065;center[2]+=.023
    assert point_inside(body.tree,Vector(center)) and not point_inside(body.tree,Vector(center)+Vector((.3,0,0)))
    for name in NAMES:
        points=array(bpy.data.objects[name],True)[changed[name]]
        gaps=np.array([skin_gap(body.tree,Vector(p))[0] for p in points])
        row={'minimumSkinClearanceMm':float(gaps.min()*1000),'belowHalfMm':int(np.count_nonzero(gaps<.0005))}
        clearance[label+' / '+name]=row
        print('HAIRLINE_CLEARANCE',label,name,json.dumps(row),flush=True)
    scalp=Surface(rig,bpy.data.objects['Complete scalp'])
    roots=array(bpy.data.objects['Polished male flyaways'],True).reshape(-1,10,2,3)[:,0].mean(1)
    root_gap=max(scalp.tree.find_nearest(Vector(p))[3] for p in roots)
    assert root_gap<.003,(label,'flyaway root attachment',root_gap)
report={'unchangedMeshes':len(unchanged),'changedVertices':{k:len(v) for k,v in changed.items()},
        'topologyUVsWeightsMaterialsTransformsPreserved':True,'preservedCrownAndFringeEnds':True,
        'maxRelativeMorphErrorMm':morph_error*1000,'noNewDegenerateTriangles':True,
        'sampledSkinClearance':clearance,'scope':'Nine expression/secondary-motion samples across four edited hair meshes; nearest skin distances with five-ray parity for ambiguous negative normal signs. No continuous or hair self-contact guarantee.'}
(folder/'native-checks.json').write_text(json.dumps(report,indent=2)+'\n')
assert all(v['belowHalfMm']==0 for v in clearance.values()),'Inspect hairline/skin contact'
validate_motion('male',False)
print('MALE_HAIRLINE_CHECKS_PASSED',flush=True)
