"""Verify that the pigment pass changes neither fit nor alpha coverage."""
import json,sys
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT
from refine_complete_foil_finish import geometry_contract
from refine_brunette_fibers import NAMES

p=OUT/'hair-likeness-20260921';d=p/'fiber-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
contracts={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
old=json.loads((d/'before/female-native-validation.json').read_text())['materials']
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert contracts=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
native=json.loads((p/'female-native-validation.json').read_text());materials=native['materials']
changed={bpy.data.objects[name].data.materials[0].name for name in NAMES}
assert {k:v for k,v in old.items() if k not in changed}=={k:v for k,v in materials.items() if k not in changed}
def pixels(name):
    image=bpy.data.images[name];return np.array(image.pixels[:]).reshape(image.size[1],image.size[0],4)
base=pixels('female-reference-hair-fibers');brunette=pixels('female-brunette-fibers')
assert np.array_equal(base[:,:,3],brunette[:,:,3])
n=pixels('female-brunette-fiber-normal')[:,:,:3]*2-1
length=np.linalg.norm(n,axis=2);assert length.min()>.98 and length.max()<1.02
colors={}
for name in NAMES:
    ob=bpy.data.objects[name];attr=ob.data.color_attributes['ReferenceHairTint'];v=np.array([a.color[:] for a in attr.data])
    assert np.isfinite(v).all() and v.min()>=0 and v.max()<=1 and np.all(v[:,3]==1)
    colors[name]={'vertices':len(v),'uniquePigments':len(np.unique(v,axis=0)),'alphaAlwaysOne':True}
report={'unchangedMeshContracts':len(contracts),'retainedGeometryUVWeightsAndShapes':True,'unchangedOtherHairMaterials':len(materials)-len(changed),
        'alphaCoverageIdentical':True,'vertexColors':colors,'textureDimensions':[256,1024],
        'additionalTextureImages':2,'additionalBaseLevelTextureBytes':2*256*1024*4,
        'normalLengthRange':[float(length.min()),float(length.max())],
        'scope':'Native geometry, UVs, skin weights and all shape coordinates exactly match the preceding front-wave source. Its finite motion and clearance results remain applicable; this does not add continuous collision or self-contact guarantees.'}
(d/'native-fiber-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('FIBER_VALIDATED',json.dumps(report),flush=True)
