"""Prove this coverage/pigment pass keeps all geometry and original data exact."""
import hashlib,json,sys
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_complete_foil_finish import geometry_contract
from refine_reference_hair import PASS
from refine_male_rear_transition import NAMES,ATTRIBUTE
from validate_reference_hair import run as validate_motion

folder=PASS/'male-rear-transition-20260926'
def contract():
    values={}
    for ob in bpy.context.scene.objects:
        if ob.type!='MESH':continue
        colors={a.name:hashlib.sha256(np.asarray([v.color[:] for v in a.data],dtype=np.float32).tobytes()).hexdigest() for a in ob.data.color_attributes if a.name!=ATTRIBUTE}
        materials=[]
        for mat in ob.data.materials:
            bs=mat.node_tree.nodes.get('Principled BSDF')
            materials.append((mat.name,[(k,tuple(bs.inputs[k].default_value) if k=='Base Color' else bs.inputs[k].default_value) for k in ['Base Color','Alpha','Roughness','Metallic','Specular IOR Level']] if bs else None))
        values[ob.name]=(geometry_contract(ob),tuple(tuple(r) for r in ob.matrix_world),materials,colors,tuple(f.material_index for f in ob.data.polygons))
    return values

bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'));before=contract()
assert all(ATTRIBUTE not in ob.data.color_attributes for ob in bpy.context.scene.objects if ob.type=='MESH')
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'));assert contract()==before
mapping=json.loads((PASS/'male-vertex-mapping.json').read_text());original_mapping=json.loads((folder/'before/male-vertex-mapping.json').read_text())
for name,entry in mapping.items():
    retained={k:v for k,v in entry.items() if not (name in NAMES and k=='addedColors')}
    assert retained==original_mapping[name],name+' retained export mapping changed'
checks={}
protected_fringe=json.loads((PASS/'male-fringe-locks-20260926/authoring-report.json').read_text())['editedRibbonIndices']
for name in NAMES:
    ob=bpy.data.objects[name];attr=ob.data.color_attributes[ATTRIBUTE]
    assert attr.domain=='POINT' and attr.data_type=='FLOAT_COLOR'
    colors=np.array([v.color[:] for v in attr.data]);assert np.isfinite(colors).all() and colors.min()>=0 and colors.max()<=1
    assert np.array_equal(colors,np.array(mapping[name]['addedColors']))
    points=array(ob);front=points[:,1]<-.112;assert np.all(colors[front]==1)
    if name==NAMES[2]:
        assert np.all(colors[:,3]==1),'Hanging outer locks lost coverage'
        assert np.all(colors.reshape(-1,24,4)[protected_fringe]==1),'Resolved forehead curls changed'
    for mat in ob.data.materials:
        tree=mat.node_tree;bs=tree.nodes['Principled BSDF']
        assert bs.inputs['Base Color'].links[0].from_node.name=='Male rear pigment'
        assert bs.inputs['Alpha'].links[0].from_node.name=='Male rear coverage'
        assert tree.nodes['Male rear coverage'].inputs[1].links[0].from_node.attribute_name==ATTRIBUTE
    checks[name]={'vertices':len(colors),'frontVerticesUnchanged':int(front.sum()),'coverageBelowOne':int((colors[:,3]<.9999).sum()),'pigmentBelowOne':int((colors[:,:3].min(1)<.9999).sum())}
report={'exactGeometryMeshes':len(before),'originalMaterialsUVsWeightsMorphsTransformsAndColorsExact':True,
        'exportMappingsExactApartFromThreeVertexColorArrays':True,'exactProtectedFringeRibbons':len(protected_fringe),
        'nativeShaderFactorsMatchGltfVertexFactors':True,'vertexFinish':checks,
        'collisionScope':'No geometry changed; skin-clearance evidence from the preceding crown pass remains applicable.'}
(folder/'native-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print('MALE_REAR_NATIVE_CHECKS',json.dumps(report),flush=True)
validate_motion('male',False)
print('MALE_NATIVE_CHECKS_PASSED',flush=True)
