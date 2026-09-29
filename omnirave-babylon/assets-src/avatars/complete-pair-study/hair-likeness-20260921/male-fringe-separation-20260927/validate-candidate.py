"""Prove coverage-only edits and recheck the retained native movement."""
import hashlib,json,sys
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from assemble_complete_pair import array
from refine_complete_foil_finish import geometry_contract
from validate_reference_hair import run as validate_motion
from refine_male_fringe_separation import NAMES,ATTRIBUTE

folder=PASS/'male-fringe-separation-20260927'
def configuration(ob):
    return [tuple(tuple(r) for r in ob.matrix_world),[m.name for m in ob.data.materials],
            [int(p.material_index) for p in ob.data.polygons],[(m.type,m.name) for m in ob.modifiers]]
def materials():
    rows=[]
    for m in bpy.data.materials:
        if not m.use_nodes:continue
        rows.append([m.name,m.surface_render_method,
                     [(n.name,n.type,[(s.name,list(s.default_value) if hasattr(s.default_value,'__len__') else s.default_value) for s in n.inputs if hasattr(s,'default_value')]) for n in m.node_tree.nodes],
                     [(l.from_node.name,l.from_socket.name,l.to_node.name,l.to_socket.name) for l in m.node_tree.links]])
    return repr(rows)
def textures():
    # Blender rebases relative image paths when saving an archived source to
    # its runtime path. Packed filenames and bytes determine these textures;
    # compare external paths exactly only for images without packed data.
    return {im.name:[im.colorspace_settings.name,list(im.size),
                     [(p.filepath,hashlib.sha256(p.packed_file.data).hexdigest()) for p in im.packed_files],
                     None if im.packed_files else im.filepath] for im in bpy.data.images}
bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
geometry={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
config={o.name:configuration(o) for o in bpy.context.scene.objects if o.type=='MESH'}
colors={o.name:{a.name:np.asarray([d.color[:] for d in a.data],dtype=np.float32) for a in o.data.color_attributes} for o in bpy.context.scene.objects if o.type=='MESH'}
shader=materials();images=textures();old_map=json.loads((folder/'before/male-vertex-mapping.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
assert geometry=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
assert config=={o.name:configuration(o) for o in bpy.context.scene.objects if o.type=='MESH'}
assert shader==materials(),'Native material nodes, links or values changed'
assert images==textures(),'Native packed image data changed'
new_map=json.loads((PASS/'male-vertex-mapping.json').read_text())
author=json.loads((folder/'authoring-report.json').read_text());checked={}
for ob in [o for o in bpy.context.scene.objects if o.type=='MESH']:
    for attr in ob.data.color_attributes:
        old=colors[ob.name][attr.name];new=np.asarray([d.color[:] for d in attr.data],dtype=np.float32)
        if ob.name not in NAMES or attr.name!=ATTRIBUTE:
            assert np.array_equal(old,new),(ob.name,attr.name)
            continue
        assert np.array_equal(old[:,:3],new[:,:3]),'Pigment changed'
        assert np.all(new[:,3]<=old[:,3]) and np.all(new[:,3]>=0)
        assert np.array_equal(old.reshape(-1,12,2,4)[:,:3],new.reshape(-1,12,2,4)[:,:3]),'Root coverage changed'
        keep=np.ones(len(new)//24,dtype=bool)
        keep[author['meshes'][ob.name]['affectedRibbonIndices']]=False
        assert np.array_equal(old.reshape(-1,24,4)[keep],new.reshape(-1,24,4)[keep])
        paths=array(ob).reshape(-1,12,2,3).mean(2)
        rear=paths[:,0,1]>=-.095
        assert np.array_equal(old.reshape(-1,24,4)[rear],new.reshape(-1,24,4)[rear]),'Rear coverage changed'
        boundary=-.110 if ob.name=='Luxury retained swept groom' else -.085
        behind=paths[:,:,1]>=boundary
        assert np.array_equal(old.reshape(-1,12,2,4)[behind],new.reshape(-1,12,2,4)[behind]),'Coverage behind the frontal fall changed'
        assert new_map[ob.name]['addedColors']==new.tolist()
        checked[ob.name]={'alphaVerticesChanged':int(np.count_nonzero(old[:,3]!=new[:,3])),
                          'minimumAlpha':float(new[:,3].min()),'rootPairsExact':3,
                          'exactUnselectedRibbons':int(keep.sum()),'exactRearRibbons':int(rear.sum()),
                          'exactBehindFringePairs':int(behind.sum()),'behindFringeBoundaryYm':boundary,'RGBExact':True}
for name,old in old_map.items():
    assert name in new_map
    if name not in NAMES:assert old==new_map[name],name
    else:assert {k:v for k,v in old.items() if k!='addedColors'}=={k:v for k,v in new_map[name].items() if k!='addedColors'},name
report={'geometryRigWeightsUVsMorphsExact':True,'exactMeshCount':len(geometry),
        'materialsTexturesAndRGBExact':True,'meshes':checked,
        'collisionEvidence':'Geometry and relative motion shapes match the previously validated source exactly; its vertex and face skin-clearance evidence remains applicable.'}
(folder/'native-checks.json').write_text(json.dumps(report,indent=2)+'\n')
validate_motion('male',False)
print('MALE_COVERAGE_CHECKS_PASSED',json.dumps(report),flush=True)
