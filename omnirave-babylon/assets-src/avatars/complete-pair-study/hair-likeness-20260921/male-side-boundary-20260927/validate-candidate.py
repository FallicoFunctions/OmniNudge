"""Male side-boundary structure, morph, attachment and pose checks."""
import hashlib,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_reference_hair import PASS
from refine_complete_foil_finish import geometry_contract
from complete_pair_geometry import Surface
from audit_complete_expressions import POSES,set_pose
from refine_male_loose_fringe import skin_gap
from validate_reference_hair import run as validate_motion

folder=PASS/'male-side-boundary-20260927'
names=['Complete scalp','Polished male rooted hairline','Luxury retained swept groom']
def structure(ob):
    h=hashlib.sha256()
    for face in ob.data.polygons:
        h.update(np.asarray(face.vertices,dtype=np.int32).tobytes())
        h.update(str(face.material_index).encode())
    for layer in ob.data.uv_layers:
        h.update(np.asarray([v.uv[:] for v in layer.data],dtype=np.float32).tobytes())
    for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
    h.update(repr([m.name for m in ob.data.materials]).encode())
    h.update(repr(tuple(tuple(row) for row in ob.matrix_world)).encode())
    return h.hexdigest()

bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
old_cap=bpy.data.objects['Complete scalp'];old_image=next(n.image for n in old_cap.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
old_pixels=np.empty(len(old_image.pixels),dtype=np.float32);old_image.pixels.foreach_get(old_pixels)
unchanged={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in names}
old={};
for name in names:
    ob=bpy.data.objects[name];p=array(ob)
    old[name]={'points':p,'structure':structure(ob),
               'colors':{a.name:np.asarray([d.color[:] for d in a.data]) for a in ob.data.color_attributes},
               'shapes':{k.name:np.asarray([v.co[:] for v in k.data])-p for k in ob.data.shape_keys.key_blocks} if ob.data.shape_keys else {}}
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
new_cap=bpy.data.objects['Complete scalp'];new_image=next(n.image for n in new_cap.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
new_pixels=np.empty(len(new_image.pixels),dtype=np.float32);new_image.pixels.foreach_get(new_pixels)
assert np.array_equal(old_pixels.reshape(-1,4)[:,:3],new_pixels.reshape(-1,4)[:,:3]),'Scalp pigment changed'
assert np.count_nonzero(old_pixels.reshape(-1,4)[:,3]!=new_pixels.reshape(-1,4)[:,3])>0,'Side coverage did not change'
assert unchanged=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in names}
changed={};morph_error=0
for name in names:
    ob=bpy.data.objects[name];p=array(ob);b=old[name]
    assert structure(ob)==b['structure'],name
    assert np.isfinite(p).all()
    for a in ob.data.color_attributes:assert np.array_equal(np.asarray([d.color[:] for d in a.data]),b['colors'][a.name]),(name,a.name)
    for k in ob.data.shape_keys.key_blocks if ob.data.shape_keys else []:
        err=float(np.abs(np.asarray([v.co[:] for v in k.data])-p-b['shapes'][k.name]).max())
        morph_error=max(morph_error,err)
    assert np.array_equal(p[b['points'][:,1]<-.090],b['points'][b['points'][:,1]<-.090]),name+' front changed'
    ids=np.flatnonzero(np.linalg.norm(p-b['points'],axis=1)>2e-7)
    assert len(ids)>0,name
    changed[name]=ids
assert morph_error<3e-7,morph_error
mapping=json.loads((PASS/'male-vertex-mapping.json').read_text())
before_mapping=json.loads((folder/'before/male-vertex-mapping.json').read_text())
for name in before_mapping:
    if name not in names:assert mapping[name]==before_mapping[name],name
    else:assert {k:v for k,v in mapping[name].items() if k not in ('after','afterNormals')}=={k:v for k,v in before_mapping[name].items() if k not in ('after','afterNormals')},name

rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
bpy.context.scene.frame_set(1)
poses={**POSES,'hair-mixed-left':{'Secondary_HairSide':-1,'Secondary_HairBack':1},
       'hair-mixed-right':{'Secondary_HairSide':1,'Secondary_HairBack':-1}}
clearance={}
for label,values in poses.items():
    set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody'])
    clearance[label]={}
    for name in names:
        ob=bpy.data.objects[name];evaluated=array(ob,True);ids=changed[name]
        if name!='Complete scalp' and len(ids)>800:
            ids=np.unique(np.linspace(0,len(ids)-1,800,dtype=int));ids=changed[name][ids]
        gaps=[skin_gap(body.tree,Vector(evaluated[i]))[0] for i in ids]
        clearance[label][name]={'sampledVertices':len(ids),'minSkinGapMm':float(min(gaps)*1000),
                                'belowHalfMm':sum(v<.0005 for v in gaps)}
        assert clearance[label][name]['belowHalfMm']==0,(label,name,clearance[label][name])
set_pose({})
report={'unchangedMeshes':len(unchanged),'changedVertices':{n:len(changed[n]) for n in names},
        'topologyUVWeightsMaterialsTransformsAndColorsExact':True,'frontHairExact':True,'scalpTextureRgbExact':True,
        'maximumRelativeMorphErrorMm':morph_error*1000,'sampledSkinClearance':clearance,
        'scope':'All changed cap vertices and up to 800 changed vertices per card mesh in nine pose/secondary-motion corners; finite sample, not continuous collision proof.'}
(folder/'native-checks.json').write_text(json.dumps(report,indent=2)+'\n')
validate_motion('male',False)
print('MALE_SIDE_BOUNDARY_VALIDATED',json.dumps({k:v for k,v in report.items() if k!='sampledSkinClearance'}),flush=True)
