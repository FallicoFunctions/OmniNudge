"""Add masked thin-sheet transmission to the retained pearlescent coating.

Connection map: shell and knit keep shared topology, rigging and correctives.
Only the shell transmits light; the coating mask leaves all knit opaque.
"""
import argparse,json,sys
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT
from refine_complete_foil_finish import geometry_contract
from refine_complete_surfaces import Field,bake


def run(sex):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-foil-refined.blend'))
    before={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
    report={'meshes':len(before),'materials':{}}
    if sex=='female':
        bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=1
        for name,label,value in [('Structured armhole jacket','coat',.85),('PLURR folded hood','hood',.70)]:
            ob=bpy.data.objects[name];mat=ob.data.materials[0].copy();ob.data.materials[0]=mat
            tree=mat.node_tree;bs=tree.nodes['Principled BSDF'];f=Field(mat)
            if label=='coat':
                film=next(n for n in tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.name=='female-knit-film')
                split=tree.nodes.new('ShaderNodeSeparateColor');tree.links.new(film.outputs['Color'],split.inputs[0])
                coverage=split.outputs['Red']
            else:coverage=1
            source=f.math('MULTIPLY',coverage,value)
            # A mostly dielectric substrate lets the thin film supply colored
            # reflection without the strong absorption of a metallic base.
            mix=tree.nodes.new('ShaderNodeMixRGB');f.input(mix.inputs[0],f.math('MULTIPLY',coverage,.42))
            tree.links.new(bs.inputs['Base Color'].links[0].from_socket,mix.inputs[1]);mix.inputs[2].default_value=(.90,.80,.88,1)
            metal=f.math('ADD',.05,f.math('MULTIPLY',coverage,.07))
            for channel,suffix,field in [('Base Color','color',mix.outputs[0]),('Metallic','metal',metal)]:
                tex,_=bake(ob,mat,f'female-transmission-{label}-{suffix}',field,size=2048 if label=='coat' else 1024,linear=suffix=='metal',background=.12 if suffix=='metal' else None)
                tree.links.new(tex.outputs['Color'],bs.inputs[channel])
            tex,_=bake(ob,mat,f'female-transmission-{label}',source,size=2048 if label=='coat' else 1024,linear=True,background=value)
            tree.links.new(tex.outputs['Color'],bs.inputs['Transmission Weight'])
            mat['launchTransmission']=True
            mat['launchTransmissionTexture']=tex.image.name+'.png'
            report['materials'][name]={'image':tex.image.name,'shellTransmission':value,'knitTransmission':0,'shellMetallic':.12,'knitMetallic':.05,'substrateLightening':.42,'thinSheet':True}
    assert before=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
    report['allGeometryUVWeightsAndShapesPreserved']=True
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-transmission-refined.blend'),compress=True)
    (OUT/f'{sex}-transmission-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex)
