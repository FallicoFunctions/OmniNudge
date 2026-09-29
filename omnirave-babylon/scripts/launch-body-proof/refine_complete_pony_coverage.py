"""Widen existing pony ribbons without adding geometry or changing their roots.

Connection map: every ribbon's first vertex pair retains its measured attachment
to the existing pony core (under 2 mm). The tie, gathered root, scalp and face
strands stay fixed. Existing armature transforms and origins must remain intact.
The same offset is applied to every shape so secondary displacement is retained.
"""
import json, sys
from pathlib import Path
import bpy, numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array
from refine_complete_groom_finish import islands
from refine_complete_foil_finish import geometry_contract
from refine_complete_surfaces import set_value

PASS = OUT / 'launch-release-20260913' / 'pony-coverage'
PASS.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(PASS / 'before/female-runtime.blend'))
names = [f'PLURR pony strands {i}' for i in range(4)]
retained = {o.name: geometry_contract(o) for o in bpy.context.scene.objects if o.type == 'MESH' and o.name not in names}
mapping, report = {}, {'meshes': {}, 'materials': {}}
convert = lambda p: np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=1).tolist()
for name in names:
    ob = bpy.data.objects[name]
    before = array(ob).copy()
    oldnormal = np.array([v.normal[:] for v in ob.data.vertices])
    revised = before.copy(); count = 0
    roots = []
    for ids in islands(ob):
        if len(ids) != 36: continue  # Preserve the shorter face-framing strands.
        ribbon = before[ids].reshape(18, 2, 3)
        middle = ribbon.mean(1)
        t = np.linspace(0, 1, 18)
        width = 1 + 2.0 * np.minimum(t / .14, 1)
        q = middle[:, None, :] + (ribbon-middle[:, None, :])*width[:, None, None]
        q[0] = ribbon[0]
        revised[ids] = q.reshape(-1, 3); roots.extend(ids[:2]); count += 1
    offset = revised-before
    old_shapes = [np.array([v.co[:] for v in k.data]) for k in ob.data.shape_keys.key_blocks]
    for key, old in zip(ob.data.shape_keys.key_blocks, old_shapes):
        key.data.foreach_set('co', (old+offset).astype(np.float32).ravel())
    ob.data.vertices.foreach_set('co', revised.astype(np.float32).ravel()); ob.data.update()
    after = array(ob)
    assert np.array_equal(after[roots], before[roots])
    assert np.isfinite(after).all()
    for key, old in zip(ob.data.shape_keys.key_blocks, old_shapes):
        new = np.array([v.co[:] for v in key.data])
        assert np.max(np.abs((new-after)-(old-before))) < 3e-7
    mapping[name] = {'before': convert(before), 'after': convert(after), 'beforeNormals': convert(oldnormal), 'afterNormals': convert(np.array([v.normal[:] for v in ob.data.vertices]))}
    report['meshes'][name] = {'ribbons': count, 'addedVertices': 0, 'rootDriftMm': 0, 'maximumMovementMm': float(np.linalg.norm(after-before,axis=1).max()*1000), 'bounds': [after.min(0).tolist(),after.max(0).tolist()]}
for owner, color, roughness in [('PLURR pony strands 1', (.80,.008,.22), .40), ('PLURR gathered pony bundle', (.24,.003,.065), .56), ('PLURR pony surface fibers', (.48,.006,.14), .45), ('Polished female flyaways', (.72,.008,.20), .48)]:
    mat=bpy.data.objects[owner].data.materials[0]
    set_value(mat,'Base Color',(*color,1)); set_value(mat,'Roughness',roughness)
    report['materials'][owner] = {'color':[*color,1], 'roughness':roughness}
assert retained == {o.name: geometry_contract(o) for o in bpy.context.scene.objects if o.type == 'MESH' and o.name not in names}
report['preservedMeshes'] = len(retained)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'female-runtime.blend'),compress=True)
(PASS/'native-validation.json').write_text(json.dumps(report,indent=2)+'\n')
(PASS/'vertex-mapping.json').write_text(json.dumps(mapping)+'\n')
print('PONY_COVERAGE',json.dumps(report),flush=True)
