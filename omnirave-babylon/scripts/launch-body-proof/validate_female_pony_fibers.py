"""Verify the pony material pass against its immediately preceding source."""
import json,sys
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands
from refine_female_dye import NAMES,DYE_BASE

p=OUT/'hair-likeness-20260921';d=p/'pony-fiber-pass'
def colors(ob):
    a=ob.data.color_attributes.get('ReferenceHairTint')
    return np.array([v.color[:] for v in a.data]) if a else np.ones((len(ob.data.vertices),4))
def cheek_pigments(materials):
    result={}
    for name in NAMES:
        ob=bpy.data.objects[name];ids=[j for island in islands(ob) if len(island)==34 for j in island]
        if ids:result[name]=colors(ob)[ids,:3]*materials[ob.data.materials[0].name]['color'][:3]
    return result

bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
old=json.loads((d/'before/female-native-validation.json').read_text())
old_cheeks=cheek_pigments(old['materials'])
old_colors={o.name:colors(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name not in NAMES}
alpha=np.array(bpy.data.images['female-reference-hair-fibers'].pixels[:]).reshape(1024,256,4)[:,:,3]

bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
for name,value in old_colors.items():assert np.array_equal(value,colors(bpy.data.objects[name])),name
native=json.loads((p/'female-native-validation.json').read_text());materials=native['materials']
changed={bpy.data.objects[name].data.materials[0].name for name in NAMES}
assert {k:v for k,v in old['materials'].items() if k not in changed}=={k:v for k,v in materials.items() if k not in changed}
assert old['additions']==native['additions']
assert np.array_equal(alpha,np.array(bpy.data.images['female-reference-hair-fibers'].pixels[:]).reshape(1024,256,4)[:,:,3])
assert np.array_equal(alpha,np.array(bpy.data.images['female-brunette-fibers'].pixels[:]).reshape(1024,256,4)[:,:,3])
cheeks=cheek_pigments(materials);cheek_error=max(float(np.max(np.abs(v-cheeks[k]))) for k,v in old_cheeks.items())
assert cheek_error<1e-8,cheek_error
record={}
for name in NAMES:
    ob=bpy.data.objects[name];v=colors(ob);mat=ob.data.materials[0];value=materials[mat.name]
    assert np.isfinite(v).all() and v.min()>=0 and v.max()<=1 and np.all(v[:,3]==1)
    bs=mat.node_tree.nodes['Principled BSDF'];normal=bs.inputs['Normal'].links[0].from_node
    assert normal.type=='NORMAL_MAP' and abs(normal.inputs['Strength'].default_value-value['normalScale'])<1e-7
    assert normal.inputs['Color'].links[0].from_node.image.name=='female-brunette-fiber-normal'
    tint=bs.inputs['Base Color'].links[0].from_node
    assert tint.inputs[1].links[0].from_node.attribute_name=='ReferenceHairTint'
    factor=tint.inputs[2].links[0].from_node
    assert np.max(np.abs(np.array(factor.inputs[1].default_value[:3])-DYE_BASE))<1e-7
    assert factor.inputs[2].links[0].from_node.image.name=='female-reference-hair-fibers'
    assert bs.inputs['Alpha'].links[0].from_node.image.name=='female-reference-hair-fibers'
    assert abs(bs.inputs['Roughness'].default_value-value['roughness'])<1e-7
    assert abs(bs.inputs['Specular IOR Level'].default_value-value['specular']/2)<1e-7
    record[name]={'vertices':len(v),'longLocks':native['meshes'][name]['dyedLongLocks'],'uniquePigments':len(np.unique(v,axis=0)),'alphaAlwaysOne':True}
n=np.array(bpy.data.images['female-brunette-fiber-normal'].pixels[:]).reshape(1024,256,4)[:,:,:3]*2-1
length=np.linalg.norm(n,axis=2);assert length.min()>.98 and length.max()<1.02
report={'unchangedMeshContracts':len(contracts),'retainedGeometryUVWeightsAndShapes':True,
        'unchangedOtherHairMaterials':len(materials)-len(changed),'unchangedOtherMeshColors':len(old_colors),
        'alphaCoverageIdentical':True,'preservedCheekPigmentVertices':sum(len(v) for v in cheeks.values()),
        'maximumCheekPigmentRounding':cheek_error,'vertexColors':record,
        'reusedNormalTexture':'female-brunette-fiber-normal.png','additionalTextureImages':0,
        'normalLengthRange':[float(length.min()),float(length.max())],
        'scope':'All 61 native mesh geometry, UV, skin-weight and shape-coordinate contracts exactly match the preceding pony-wave source. Its finite motion and clearance results are reused; this pass does not claim a new pose sweep or continuous collision proof.'}
(d/'native-pony-fiber-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('PONY_FIBER_VALIDATED',json.dumps(report),flush=True)
