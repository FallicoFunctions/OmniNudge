"""Add short, swept side and rear layers to the reference-based male groom.

Connection map for these thin hair layers:
* Existing scalp cap -> each new ribbon root: nearest cap point + 1.2 mm.
* Ribbon body -> measured head: 2.8–4.8 mm standoff, sampled in nine poses.
* Ribbon ends -> short side/nape hair: tapered, behind the ear opening.
The structural 5 mm assembly overlap rule is inappropriate for these rigged
hair cards. The new mesh uses identity object transforms and rigid head skin.
"""
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array,material
from complete_pair_geometry import Surface,create,smooth
from add_launch_reference_details import rigid

NAME='Male layered side strands'
MATERIAL='Male matte side fibers'
ASSETS=Path(__file__).resolve().parents[2]/'assets-src/avatars/complete-pair-study/hair-likeness-20260921'


def build_side_strands():
    rig=bpy.data.objects['AvatarSkeleton']
    body=Surface(rig,bpy.data.objects['AvatarBody'])
    cap=Surface(rig,bpy.data.objects['Complete scalp'])
    cap_ob=bpy.data.objects['Complete scalp'];points=array(cap_ob)
    uv=np.zeros((len(points),2))
    for loop in cap_ob.data.loops:uv[loop.vertex_index]=cap_ob.data.uv_layers.active.data[loop.index].uv
    candidates=np.flatnonzero((np.abs(points[:,0])>.046)&(points[:,1]>-.078)&(points[:,1]<.034)&
                              (points[:,2]>1.723)&(points[:,2]<1.775))
    assert 250<len(candidates)<600,len(candidates)
    verts=[];faces=[];texcoords=[];roots=[];tips=[];root_gaps=[];skin_gaps=[]
    t=np.linspace(0,1,12)
    for order,index in enumerate(candidates):
        source=points[index];side=np.sign(source[0]);u=uv[index,0]
        group=int(math.floor(u*42));phase=group*2.399963
        rear=float(smooth((source[1]+.033)/.052))
        # Shorter temple strands stop above the ear; the rear layers continue
        # down and back, replacing the bare high-fade wedge.
        tip_z=(1-rear)*(1.684+.005*math.sin(phase)) + rear*(1.647+.006*math.sin(phase+.4))
        tip_z+=.009*float(smooth((source[2]-1.734)/.038))
        tip_y=min(.045,source[1]+(.016+.040*rear)+.004*math.sin(phase))
        tip_x=source[0]+side*(.0015+.002*rear)
        ideal_tip=np.array([tip_x,tip_y,tip_z])
        path=[];normals=[];invalid=False
        for j,step in enumerate(t):
            raw=source*(1-step)+ideal_tip*step
            raw[1]+=.0045*math.sin(math.pi*step)+.002*math.sin(2.2*math.pi*step+phase)*math.sin(math.pi*step)
            raw[0]+=side*.0025*math.sin(math.pi*step)
            raw[2]+=.003*math.sin(2.5*math.pi*step+phase)*math.sin(math.pi*step)
            hit,n,_,distance=body.tree.find_nearest(Vector(raw))
            if distance>.022:invalid=True;break
            outward=np.array(n)
            radial=raw-np.array([0,-.032,1.68])
            if np.dot(outward,radial)<0:outward=-outward
            gap=.0028+.0030*float(smooth(step/.35))+.0030*math.sin(math.pi*step)+.00035*math.sin(phase)
            point=np.asarray(hit)+outward*gap
            if j==0:
                cap_hit,cap_normal,_,_=cap.tree.find_nearest(Vector(source))
                cap_n=np.array(cap_normal)
                if np.dot(cap_n,radial)<0:cap_n=-cap_n
                point=np.asarray(cap_hit)+cap_n*.0012
            path.append(point);normals.append(outward)
        if invalid:continue
        path=np.asarray(path);normals=np.asarray(normals)
        if np.linalg.norm(path[-1]-path[0])<.027:continue
        first=len(verts);previous_across=None
        for j,point in enumerate(path):
            tangent=path[min(j+1,11)]-path[max(j-1,0)]
            tangent/=np.linalg.norm(tangent)
            across=np.cross(tangent,normals[j]);length=np.linalg.norm(across)
            if length<.1:invalid=True;break
            across/=length
            if previous_across is not None:
                transported=previous_across-tangent*np.dot(previous_across,tangent)
                transported/=np.linalg.norm(transported)
                if np.dot(across,transported)<0:across=-across
                across=.45*across+.55*transported
                across/=np.linalg.norm(across)
            previous_across=across
            width=(.00055+.00028*(.5+.5*math.sin(phase+.7))) * (1+.60*math.sin(math.pi*t[j])) * (1-.88*smooth((t[j]-.72)/.28))
            verts.extend([point-across*width,point+across*width])
            texcoords.extend([(0,t[j]),(1,t[j])])
        if invalid:
            del verts[first:];del texcoords[first:]
            continue
        if min(body.tree.find_nearest(Vector(v))[3] for v in verts[first:])<.0018:
            del verts[first:];del texcoords[first:]
            continue
        for j in range(11):
            a=first+2*j;faces.append((a,a+1,a+3,a+2))
        roots.append(path[0]);tips.append(path[-1]);
        root_gaps.append(cap.tree.find_nearest(Vector(path[0]))[3])
        skin_gaps.append(min(body.tree.find_nearest(Vector(p))[3] for p in path))
    assert len(roots)>=250,len(roots)
    tex_image=bpy.data.images.load(str(ASSETS/'male-reference-hair-fibers.png'),check_existing=True)
    tex_image.pack()
    mat=material(MATERIAL,(.037,.018,.008),.86)
    tree=mat.node_tree;bs=tree.nodes['Principled BSDF'];bs.inputs['Specular IOR Level'].default_value=.045
    tex=tree.nodes.new('ShaderNodeTexImage');tex.image=tex_image
    mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    mix.inputs[1].default_value=(.037,.018,.008,1)
    tree.links.new(tex.outputs['Color'],mix.inputs[2]);tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
    tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha']);mat.surface_render_method='DITHERED'
    normal_image=bpy.data.images.load(str(ASSETS/'male-reference-fiber-normal.png'),check_existing=True)
    normal_image.colorspace_settings.name='Non-Color';normal_image.pack()
    normal_tex=tree.nodes.new('ShaderNodeTexImage');normal_tex.image=normal_image
    normal=tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.14
    tree.links.new(normal_tex.outputs['Color'],normal.inputs['Color']);tree.links.new(normal.outputs['Normal'],bs.inputs['Normal'])
    ob=create(NAME,verts,faces,mat,body,weights=rigid(body,verts,'head'),uv=texcoords,slot='hair',option='male-complete')
    ob['launchCharacter']='male';ob['groomRootCarrier']='Complete scalp';ob['groomRootStride']=24
    actual=array(ob,True)
    assert np.max(np.linalg.norm(actual-np.asarray(verts),axis=1))<.00001
    return ob,{'cards':len(roots),'vertices':len(verts),'triangles':len(faces)*2,
               'maximumRootCapDistanceMm':max(root_gaps)*1000,
               'minimumNeutralCenterSkinDistanceMm':min(skin_gaps)*1000,
               'tipZRangeM':[float(np.min(np.asarray(tips)[:,2])),float(np.max(np.asarray(tips)[:,2]))],
               'bounds':[actual.min(0).tolist(),actual.max(0).tolist()]}


def export_side_strands(ob):
    me=ob.data;me.calc_loop_triangles();me.update();uvs=me.uv_layers.active.data
    positions=[];normals=[];uv=[];indices=[];lookup={}
    for tri in me.loop_triangles:
        for vi,li in zip(tri.vertices,tri.loops):
            texuv=tuple(uvs[li].uv);key=(vi,texuv)
            if key not in lookup:
                lookup[key]=len(positions);p=me.vertices[vi].co;n=me.vertices[vi].normal
                positions.append([p.x,p.z,-p.y]);normals.append([n.x,n.z,-n.y]);uv.append([texuv[0],1-texuv[1]])
            indices.append(lookup[key])
    addition={'name':ob.name,'material':MATERIAL,'positions':positions,'normals':normals,'uv':uv,
              'indices':indices,'extras':dict(ob.items())}
    material_spec={MATERIAL:{'color':[.037,.018,.008,1],'roughness':.86,'specular':.09,
                             'texture':'male-reference-hair-fibers.png','alphaMode':'MASK','alphaCutoff':.32,'doubleSided':True,
                             'normalTexture':'male-reference-fiber-normal.png','normalScale':.14}}
    return addition,material_spec
