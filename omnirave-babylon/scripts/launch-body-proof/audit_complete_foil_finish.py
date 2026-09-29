"""Check geometry preservation and the native polymer/knit material boundary."""
import sys,json
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT
from refine_complete_foil_finish import geometry_contract
from audit_complete_knit_finish import sample_image,smoother


def run(sex):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-hair-refined.blend'))
    before={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-foil-refined.blend'))
    after={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
    assert before==after,'Geometry, UVs, skin weights or shape coordinates changed'
    report={'allGeometryUVWeightsAndShapesPreserved':True,'meshes':len(after)}
    if sex=='male':return report
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'female-runtime.blend'))
    coat=bpy.data.objects['Structured armhole jacket'];mat=coat.data.materials[0];bs=mat.node_tree.nodes['Principled BSDF'];assert mat['launchPolymerFinish']
    rest=np.array([a.vector[:] for a in coat.data.attributes['TailorRest'].data]);faces=np.array([f.vertices[:] for f in coat.data.polygons]);assert faces.shape[1]==3
    node=bs.inputs['Metallic'].links[0].from_node;uvname=node.inputs['Vector'].links[0].from_node.uv_map;uv=np.array([a.uv[:] for a in coat.data.uv_layers[uvname].data]).reshape(-1,3,2)
    points=rest[faces].mean(1);texuv=uv.mean(1)
    hem=1-smoother((points[:,2]-1.027+.0006)/.0012);cuff=smoother((np.abs(points[:,0])-.707+.0006)/.0012);knit=np.maximum(hem,cuff)
    interior=(np.abs(points[:,2]-1.027)>.003)&(np.abs(np.abs(points[:,0])-.707)>.003)&(points[:,2]<1.48)
    area=np.abs(np.cross(uv[:,1]-uv[:,0],uv[:,2]-uv[:,0]))*.5*2048**2;interior&=area>=4
    assert np.sum(interior&(knit>.99))>100 and np.sum(interior&(knit<.01))>1000
    settings=json.loads((OUT/'visual-reference-pass-20260911/surface-parameters.json').read_text())['female'] if mat.get('launchReferenceSurfaceFinish') else None
    for channel,cloth,trim in [('Metallic',settings['jacketMetallic'] if settings else .12 if mat.get('launchTransmission') else .48,.05),('Coat Weight',settings['jacketCoat'] if settings else .28,0)]:
        image=bs.inputs[channel].links[0].from_node.image;assert image.colorspace_settings.name=='Non-Color'
        actual=sample_image(image,texuv)[:,0];expected=cloth*(1-knit)+trim*knit;error=np.abs(actual-expected)
        bad=int(np.sum(error[interior]>.08));assert bad==0,(channel,bad,float(error[interior].max()))
        report[channel]={'interiorSamples':int(interior.sum()),'maximumInteriorError':float(error[interior].max()),'errorsOver008':bad,'clothValue':cloth,'trimValue':trim}
    return report

if __name__=='__main__':
    report={s:run(s) for s in ['male','female']};(OUT/'foil-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
