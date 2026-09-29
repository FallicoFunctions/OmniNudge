"""Lower the male frontal hairline on the measured forehead surface.

Connection map: the scalp edge remains 1.2+ mm outside the head. The rooted
underlayer follows the scalp's triangle deformation. Main-lock and flyaway
roots use that same carrier deformation, fading toward unchanged free ends.
These are thin hair layers, not structural 5 mm overlaps. Existing origins,
indices, UVs, weights and relative morph offsets are preserved.
"""
import bpy
import numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface, smooth
from refine_complete_groom_finish import islands
from build_rigged_jacket_hardware import barycentric
from audit_complete_expressions import POSES,set_pose
from refine_male_loose_fringe import skin_gap

NAMES = ['Complete scalp', 'Polished male rooted hairline',
         'Luxury retained swept groom', 'Polished male flyaways']


def clear_flyaways(ob, original, rig, mapping, report, apply):
    """Check the newly carried fine hairs in their actual evaluated poses."""
    poses={**POSES,'hair-mixed-left':{'Secondary_HairSide':-1,'Secondary_HairBack':1},
           'hair-mixed-right':{'Secondary_HairSide':1,'Secondary_HairBack':-1}}
    previous=rig.data.pose_position
    for iteration in range(5):
        current=array(ob);changed=np.flatnonzero(np.linalg.norm(current-original,axis=1)>2e-7)
        rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle']
        bpy.context.scene.frame_set(1);set_pose({})
        matrix=rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()
        inverse=np.linalg.inv(np.asarray(matrix)[:3,:3])
        center=np.mean([array(bpy.data.objects['AvatarEye_'+s],True).mean(0) for s in ['l','r']],axis=0);center[1]+=.065;center[2]+=.023
        corrections={}
        for label,values in poses.items():
            set_pose(values);body=Surface(rig,bpy.data.objects['AvatarBody']);points=array(ob,True)
            for index in changed:
                point=Vector(points[index]);gap,_=skin_gap(body.tree,point)
                if gap>=.0012:continue
                direction=(point-Vector(center)).normalized()
                outer,_,_,_=body.tree.ray_cast(Vector(center)+direction*.32,-direction,.64)
                assert outer is not None
                delta=inverse@(np.array(direction)*max(.0007,.002-(point-outer).dot(direction)))
                pair=int(index)//2*2
                assert pair%20//2<7,'An unchanged flyaway end needs fitting'
                if pair not in corrections or np.linalg.norm(delta)>np.linalg.norm(corrections[pair]):corrections[pair]=delta
                print('HAIRLINE_FINE_EDGE',iteration,label,int(index),float(gap*1000),flush=True)
        set_pose({});rig.data.pose_position=previous;bpy.context.view_layer.update()
        if not corrections:return
        for pair,delta in corrections.items():current[pair:pair+2]+=delta
        apply(ob,current,mapping,report)
    raise AssertionError('Fine-hair skin fitting did not converge')


def lower_hairline(mapping, report, apply):
    rig=bpy.data.objects['AvatarSkeleton']
    body=Surface(rig,bpy.data.objects['AvatarBody'])
    cap=bpy.data.objects['Complete scalp'];old_cap=Surface(rig,cap)
    original=array(cap);revised=original.copy()
    for i,p in enumerate(original):
        front=float(smooth((-.008-p[1])/.070))
        low=float(1-smooth((p[2]-1.760)/.040))
        amount=front*low
        if amount<1e-9:continue
        drop=amount*(.0345+.0025*np.exp(-((p[0]+.028)/.022)**2)-.001*np.cos(p[0]*90))
        hit,n,_,_=body.tree.find_nearest(Vector(p))
        gap=max(.0012,(Vector(p)-hit).dot(n))
        proposed=p.copy();proposed[2]-=drop
        hit,n,_,_=body.tree.find_nearest(Vector(proposed))
        revised[i]=np.array(hit+n*gap)
    cap_delta=revised-original
    old_meta=report.get(cap.name,{})
    apply(cap,revised,mapping,report)
    report[cap.name]={**old_meta,**report[cap.name],'loweredFrontalHairline':True}
    # A barycentric carrier keeps the four existing layers connected while
    # projecting only the scalp itself onto the skin, preserving strand volume.
    def carrier_delta(point):
        hit,_,triangle,_=old_cap.tree.find_nearest(Vector(point))
        ids=old_cap.faces[triangle]
        weights=np.maximum(barycentric(np.array(hit),old_cap.array[ids]),0)
        weights/=weights.sum()
        return weights@cap_delta[ids]
    movement={cap.name:float(np.linalg.norm(cap_delta,axis=1).max()*1000)}
    for name in NAMES[1:]:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy()
        if name=='Polished male rooted hairline':
            for i,point in enumerate(p):q[i]+=carrier_delta(point)
        else:
            for ids in islands(ob):
                r=p[ids].reshape(-1,2,3);t=np.linspace(0,1,len(r))
                follow=1-smooth(t/.72)
                # Translate each pair together, retaining the ribbon width.
                for j,point in enumerate(r.mean(1)):
                    r[j]+=carrier_delta(point)*follow[j]
                q[ids]=r.reshape(-1,3)
        previous=report.get(name,{}).copy();added_uv=mapping.get(name,{}).get('addedUv')
        apply(ob,q,mapping,report)
        if name=='Polished male flyaways':clear_flyaways(ob,p,rig,mapping,report,apply)
        if added_uv is not None:mapping[name]['addedUv']=added_uv
        report[name]={**previous,**report[name],'followsLoweredHairline':True}
        movement[name]=float(np.linalg.norm(q-p,axis=1).max()*1000)
    bpy.context.view_layer.update()
    # Measure the central edge itself rather than the hanging fringe tips.
    central=np.flatnonzero((original[:,1]<-.125)&(np.abs(original[:,0])<.018)&(original[:,2]<1.774))
    result={'meshes':movement,'centralEdgeVertices':len(central),
            'centralHairlineDropMm':float(np.mean(original[central,2]-revised[central,2])*1000),
            'maxScalpDisplacementMm':movement[cap.name],
            'preservedCrownVertices':int(np.count_nonzero(np.linalg.norm(cap_delta,axis=1)<1e-9))}
    print('MALE_HAIRLINE',result,flush=True)
    return result
