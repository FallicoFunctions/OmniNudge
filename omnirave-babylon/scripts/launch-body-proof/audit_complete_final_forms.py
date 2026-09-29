"""Compare final shape inputs with outputs at the native asset boundary."""
import sys,json,hashlib
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from refine_complete_foil_finish import geometry_contract
from refine_complete_groom_finish import islands


def capture(sex,stage):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{stage}.blend'))
    result={}
    for ob in bpy.context.scene.objects:
        if ob.type!='MESH':continue
        h=hashlib.sha256()
        for p in ob.data.polygons:h.update(np.asarray(p.vertices,dtype=np.int32).tobytes())
        for uv in ob.data.uv_layers:h.update(np.asarray([v.uv[:] for v in uv.data],dtype=np.float32).tobytes())
        for v in ob.data.vertices:h.update(repr([(g.group,g.weight) for g in v.groups]).encode())
        roots=[]
        if ob.name.startswith('PLURR pony strands') or ob.name=='Polished female flyaways':
            for ids in islands(ob):
                if ob.name.startswith('Polished') or len(ids)==36:roots.extend(ids[:2])
        keys={k.name:np.asarray([v.co[:] for v in k.data]) for k in ob.data.shape_keys.key_blocks} if ob.data.shape_keys else {}
        if keys:
            basis=keys['Basis'].copy()
            keys={name:points-basis for name,points in keys.items()}
        result[ob.name]={'contract':geometry_contract(ob),'structure':h.hexdigest(),'points':array(ob),'roots':roots,'keys':keys}
    return result


report={}
for sex in ['male','female']:
    before=capture(sex,'transmission-refined');after=capture(sex,'final-forms')
    assert before.keys()==after.keys()
    changed=[];fixed_roots=0;corrective_error=0
    allowed={'Structured armhole jacket','Polished female flyaways',*[f'PLURR pony strands {i}' for i in range(4)]} if sex=='female' else set()
    for name,a in after.items():
        b=before[name];assert a['structure']==b['structure'],name
        if a['contract']!=b['contract']:
            changed.append(name);assert name in allowed,name
        assert a['keys'].keys()==b['keys'].keys(),name
        for key in a['keys']:
            error=float(np.abs(a['keys'][key]-b['keys'][key]).max());corrective_error=max(corrective_error,error)
            assert error<2e-7,(name,key,error)
        assert a['roots']==b['roots'],name
        if a['roots']:
            assert np.array_equal(a['points'][a['roots']],b['points'][b['roots']]),name
            fixed_roots+=len(a['roots'])
    assert set(changed)==allowed,(sex,changed)
    report[sex]={'meshes':len(after),'changedMeshes':changed,'unchangedMeshes':len(after)-len(changed),'allTopologyUVsAndWeightsPreserved':True,'fixedPonyRootVertices':fixed_roots,'maximumCorrectiveDeltaChangeM':corrective_error}
(OUT/'final-forms-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report),flush=True)
