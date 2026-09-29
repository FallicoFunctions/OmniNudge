"""Round the pulled-back locks and form a broad, flattened temple plait.

Connection map: swept cards keep their exact first and last two pairs on the
existing cap/crown. The plait follows the measured cap with a 0.8 mm minimum
fiber gap, entering the groom at both tapered ends. Hair uses millimeter
clearance, not structural-part overlaps. All origins, UVs and weights stay.
"""
import math
import bpy,numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands


def shape_temple_plait(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton']
    cap=Surface(rig,bpy.data.objects['Complete scalp']).tree
    lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
    from refine_female_crown import bezier
    t=np.linspace(0,1,97)
    guide=bezier([[-.070,-.072,1.630],[-.089,-.098,1.677],
                  [-.052,-.077,1.734],[-.011,.014,1.722]],t)
    base=[];normals=[]
    for point in guide:
        hit,n,_,_=cap.find_nearest(Vector(point));base.append(hit);normals.append(n)
    base=np.array(base);normal=np.array(normals)
    # Smooth low-density cap normals before constructing strand cross-sections.
    for _ in range(3):normal[1:-1]=.2*normal[:-2]+.6*normal[1:-1]+.2*normal[2:]
    normal/=np.linalg.norm(normal,axis=1)[:,None]
    tangent=np.gradient(base,axis=0);tangent/=np.linalg.norm(tangent,axis=1)[:,None]
    across=np.cross(tangent,normal);across/=np.linalg.norm(across,axis=1)[:,None]
    ob=bpy.data.objects['PLURR reference temple braid'];before=array(ob);points=[]
    taper=.18+.82*np.sin(math.pi*t)**.40
    for strand in range(3):
        phase=t*math.tau*6+strand*math.tau/3
        centers=base+across*(.0055*np.sin(phase)*taper)[:,None]
        centers+=normal*(.0035+.00135*np.sin(2*phase)*taper)[:,None]
        along=np.gradient(centers,axis=0);along/=np.linalg.norm(along,axis=1)[:,None]
        a=np.cross(along,normal);a/=np.linalg.norm(a,axis=1)[:,None]
        b=np.cross(a,along)
        for j,c in enumerate(centers):
            for k in range(6):
                angle=k*math.tau/6
                point=c+taper[j]*(.00215*math.cos(angle)*a[j]+.00110*math.sin(angle)*b[j])
                hit,n,_,_=cap.find_nearest(Vector(point));gap=(Vector(point)-hit).dot(n)
                if gap<.0008:point=np.array(hit+n*.0008)
                front,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                if front is not None:point[1]=max(point[1],front.y+.0015)
                points.append(point)
    q=np.array(points);assert q.shape==before.shape
    old=dict(report[ob.name]);apply(ob,q,mapping,report);mapping.pop(ob.name)
    report[ob.name].update({k:v for k,v in old.items() if k not in report[ob.name]})
    gaps=[]
    for point in array(ob):
        hit,n,_,_=cap.find_nearest(Vector(point));gaps.append((Vector(point)-hit).dot(n)*1000)
    report[ob.name]['templePlait']={'widthMm':15.3,'strandSectionMm':[4.3,2.2],
        'scalpClearanceMm':[min(gaps),max(gaps)],'vertices':len(q),'addedGeometry':0}
    assert min(gaps)>.75 and max(gaps)<8,gaps

    braid_tree=KDTree(len(base))
    for i,point in enumerate(base):braid_tree.insert(Vector(point),i)
    braid_tree.balance()
    ob=bpy.data.objects['PLURR swept scalp groom'];p=array(ob);q=p.copy();changed=0
    for i,ids in enumerate(islands(ob)):
        r=p[ids].reshape(24,2,3);center=r.mean(1);half=(r[:,1]-r[:,0])*.5;c=center.copy()
        root=center[0];front=float(smooth((-root[1]-.02)/.085))
        if front<1e-6:continue
        phase=math.atan2(root[0],root[1]+.032)*3;lifts=np.zeros(24)
        # Neighboring cards share broad relief, with exact attachments. A
        # narrow channel leaves the plait readable on top of the temple.
        for j in range(2,22):
            v=(j-1)/21;arch=math.sin(math.pi*v)**1.35
            hit,n,_,_=cap.find_nearest(Vector(center[j]))
            channel=float(smooth((braid_tree.find(hit)[2]-.006)/.015))
            # Raised alpha-masked cards expose dark gaps on the upper crown.
            # Keep its existing coverage, concentrating relief at the temple.
            crown_fade=1-float(smooth((center[j,2]-1.684)/.032))
            lift=(.0025+.0008*math.sin(phase)**2)*front*arch*channel*crown_fade
            lifts[j]=lift
            c[j]+=np.array(n)*lift
        h=[]
        for j in range(24):
            a=Vector(center[min(j+1,23)]-center[max(j-1,0)]).normalized()
            b=Vector(c[min(j+1,23)]-c[max(j-1,0)]).normalized()
            h.append(np.array(a.rotation_difference(b)@Vector(half[j])))
        rr=np.stack([c-np.array(h),c+np.array(h)],axis=1)
        for j in range(2,22):
            if lifts[j]<1e-8:
                rr[j]=r[j];continue
            for point in rr[j]:
                hit,n,_,_=cap.find_nearest(Vector(point));gap=(Vector(point)-hit).dot(n)
                if gap<.001:point[:]=hit+n*.001
                front_hit,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                if front_hit is not None:point[1]=max(point[1],front_hit.y+.0015)
        rr[:2]=r[:2];rr[-2:]=r[-2:];q[ids]=rr.reshape(-1,3);changed+=1
    old=dict(report[ob.name]);apply(ob,q,mapping,report)
    report[ob.name].update({k:v for k,v in old.items() if k not in report[ob.name]})
    report[ob.name]['templeRelief']={'roundedLocks':changed,'retainedEndPairs':2,'maximumAddedLiftMm':3.3,'upperCrownCoverageRetained':True}


def finish_temple_plait(materials):
    name='PLURR reference temple braid';mat=bpy.data.objects[name].data.materials[0]
    color=(.28,.118,.037,1)
    # export_additions owns the fiber texture and its multiplication node.
    bs=mat.node_tree.nodes['Principled BSDF']
    mix=bs.inputs['Base Color'].links[0].from_node
    assert mix.bl_idname=='ShaderNodeMixRGB'
    mix.inputs[1].default_value=color
    bs.inputs['Roughness'].default_value=.54;bs.inputs['Specular IOR Level'].default_value=.16
    materials[mat.name].update(color=color,roughness=.54,specular=.32)
