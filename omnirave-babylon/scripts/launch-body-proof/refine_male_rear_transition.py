"""Feather the male rear undercut and quiet isolated bright rear fibers.

The scalp, rooted underlayer, and main groom share a measured boundary-height
field. Only vertex pigment/coverage changes; all geometry, skin attachments,
UVs, origins, and relative morph offsets remain exact. Forehead locks retain
white, opaque vertex factors. The native shader mirrors glTF COLOR_0 factors.
"""
import math
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface, smooth
from build_rigged_jacket_hardware import barycentric

NAMES=['Complete scalp','Polished male rooted hairline','Luxury retained swept groom']
ATTRIBUTE='MaleRearFinish'


def prepare_rear_transition(mapping,report):
    rig=bpy.data.objects['AvatarSkeleton'];cap=bpy.data.objects[NAMES[0]]
    surface=Surface(rig,cap);cap_points=array(cap)
    uv=np.zeros((len(cap_points),2))
    for loop in cap.data.loops:uv[loop.vertex_index]=cap.data.uv_layers.active.data[loop.index].uv
    edge=uv[:,1]>.999;edge_u=uv[edge,0];edge_z=cap_points[edge,2]
    order=np.argsort(edge_u);edge_u=edge_u[order];edge_z=edge_z[order]
    result={}
    for name in NAMES:
        ob=bpy.data.objects[name];points=array(ob);colors=np.ones((len(points),4))
        u=np.empty(len(points))
        if name==NAMES[0]:u=uv[:,0].copy()
        else:
            for i,p in enumerate(points):
                hit,_,triangle,_=surface.tree.find_nearest(Vector(p));ids=surface.faces[triangle]
                weights=np.maximum(barycentric(np.array(hit),surface.array[ids]),0);weights/=weights.sum()
                columns=uv[ids,0].copy()
                if np.ptp(columns)>.5:columns[columns<.5]+=1
                u[i]=float(weights@columns)%1
        boundary=np.interp(u,edge_u,edge_z,period=1)
        rear=smooth((points[:,1]+.112)/.075)
        variation=.0012*np.sin(u*math.tau*19)+.0007*np.sin(u*math.tau*43)
        coverage=smooth((points[:,2]-boundary+.0005-variation)/.014)
        colors[:,3]=1-rear*(1-coverage)
        if name==NAMES[2]:
            # Leave hanging outer locks intact. Only the two dense support
            # layers receive the skin transition; the main groom gets tint.
            colors[:,3]=1
            material=np.zeros(len(points),dtype=int)
            for face in ob.data.polygons:material[list(face.vertices)]=face.material_index
            back=smooth((points[:,1]+.080)/.070)*smooth((points[:,2]-1.729)/.040)
            quiet=1-.52*back*(material==3)
            colors[:,:3]*=quiet[:,None]
            ribbons=points.reshape(-1,12,2,3).mean(2)
            protected=ribbons[:,-1,1]<-.105
            colors.reshape(-1,24,4)[protected]=1
        # The frontal hairline itself stays fully covered, on every layer.
        colors[points[:,1]<-.112]=1
        colors=np.clip(colors,0,1).astype(np.float32)
        attr=ob.data.color_attributes.get(ATTRIBUTE) or ob.data.color_attributes.new(name=ATTRIBUTE,type='FLOAT_COLOR',domain='POINT')
        attr.data.foreach_set('color',colors.ravel())
        assert name in mapping, name+' is missing its retained vertex mapping'
        mapping[name]['addedColors']=colors.tolist()
        result[name]={'vertices':len(points),'fadedVertices':int(np.count_nonzero(colors[:,3]<.9999)),
                      'tintedVertices':int(np.count_nonzero(colors[:,:3].min(1)<.9999)),
                      'minCoverage':float(colors[:,3].min()),'minPigmentFactor':float(colors[:,:3].min()),
                      'frontVerticesExact':int(np.count_nonzero(points[:,1]<-.112))}
        report[name]={**report.get(name,{}),'rearVertexFinish':result[name]}
    print('MALE_REAR_TRANSITION',result,flush=True)
    return result


def finish_rear_transition():
    """Multiply existing native color and alpha by the same exported factors."""
    for name in NAMES:
        ob=bpy.data.objects[name]
        assert ob.data.color_attributes.get(ATTRIBUTE)
        for mat in ob.data.materials:
            tree=mat.node_tree;bs=tree.nodes.get('Principled BSDF');assert bs
            # Incremental rebuilds start from an immutable earlier source.
            # Rebinding an existing finish need not add a second factor.
            if tree.nodes.get('Male rear pigment'):continue
            attr=tree.nodes.new('ShaderNodeAttribute');attr.attribute_name=ATTRIBUTE
            mix=tree.nodes.new('ShaderNodeMixRGB');mix.name='Male rear pigment';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
            if bs.inputs['Base Color'].is_linked:tree.links.new(bs.inputs['Base Color'].links[0].from_socket,mix.inputs[1])
            else:mix.inputs[1].default_value=bs.inputs['Base Color'].default_value
            tree.links.new(attr.outputs['Color'],mix.inputs[2]);tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
            alpha=tree.nodes.new('ShaderNodeMath');alpha.name='Male rear coverage';alpha.operation='MULTIPLY'
            if bs.inputs['Alpha'].is_linked:tree.links.new(bs.inputs['Alpha'].links[0].from_socket,alpha.inputs[0])
            else:alpha.inputs[0].default_value=bs.inputs['Alpha'].default_value
            tree.links.new(attr.outputs['Alpha'],alpha.inputs[1]);tree.links.new(alpha.outputs[0],bs.inputs['Alpha'])
