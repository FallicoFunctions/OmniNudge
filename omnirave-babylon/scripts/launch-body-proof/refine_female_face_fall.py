"""Bring a fuller outer pony layer beside the face toward the shoulder.

Connection map: four crown pairs retain their exact attachment and shape
coordinates. Existing long cards follow fourteen shared fall guides outside
the left ear; short cheek cards are untouched. Front collar clearance is fitted
in 31 evaluated motion/secondary poses. Hair uses millimeter surface margins;
object origins, topology, weights, colors and relative secondary shapes stay.
"""
import math
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_female_crown import bezier
from audit_complete_expressions import POSES,set_pose

NAMES=[f'PLURR pony strands {i}' for i in range(3)]


def apply_retained(ob,q,mapping,report,apply):
    old=dict(report[ob.name]);apply(ob,q,mapping,report)
    report[ob.name].update({k:v for k,v in old.items() if k not in report[ob.name]})


def shape_face_fall(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    bases={n:array(bpy.data.objects[n]) for n in NAMES};rows=[];deltas={}
    for name,p in bases.items():
        ob=bpy.data.objects[name]
        deltas[name]=[np.array([v.co[:] for v in ob.data.shape_keys.key_blocks[k].data])-p for k in ['Secondary_HairSide','Secondary_HairBack']]
        for ids in islands(ob):
            if len(ids)==36:rows.append((name,ids,p[ids].reshape(18,2,3)))
    paths=np.array([r.mean(1) for _,_,r in rows]);groups=group_paths(paths,26)
    guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    selected=sorted(guides,key=lambda g:guides[g][9:16,1].mean())[:14]
    tips=[1.445,1.415,1.475,1.435,1.465,1.405,1.485,1.450,1.425,1.470,1.430,1.495,1.455,1.440]
    revised={n:p.copy() for n,p in bases.items()};selected_ids={n:[] for n in NAMES}
    t=np.linspace(0,1,18);v=np.clip((t-t[3])/(1-t[3]),0,1)
    for i,(name,ids,r) in enumerate(rows):
        g=int(groups[i])
        if g not in selected:continue
        guide=guides[g];old=r.mean(1);rank=selected.index(g);phase=g*2.399963
        start=guide[3];control=start+(start-guide[2])*2
        control[0]=min(control[0],start[0]-.022);control[2]=min(control[2],1.768)
        tip=np.array([-.143-.024*math.sin(phase),-.120+.012*math.cos(phase),tips[rank]])
        c=bezier([start,control,[-.160-.017*math.cos(phase),-.100,tip[2]+.085],tip],v)
        c+=(old-guide)*(.48-.20*smooth(v))[:,None]
        c[:,0]+=.012*np.sin(v*math.tau+phase)*np.sin(math.pi*v)
        c[:,1]+=.008*np.sin(v*math.tau+phase+.7)*np.sin(math.pi*v)
        c[:,2]+=.006*math.sin(i*2.399963)*smooth((v-.55)/.45)
        # Small depth variation keeps a group from reading as one broad
        # flat ribbon. Fair the sparse control rows before width transport.
        strand=i*2.399963
        c[:,0]+=.004*math.cos(strand)*np.sin(math.pi*v)
        c[:,1]+=.007*math.sin(strand)*np.sin(math.pi*v)
        c[:4]=old[:4]
        for _ in range(3):
            relaxed=c.copy();relaxed[4:-1]=.22*c[3:-2]+.56*c[4:-1]+.22*c[5:]
            c=relaxed
        half=(r[:,1]-r[:,0])*.5;h=[]
        for j in range(18):
            a=Vector(old[min(j+1,17)]-old[max(j-1,0)]).normalized()
            b=Vector(c[min(j+1,17)]-c[max(j-1,0)]).normalized()
            width=1+.35*math.sin(math.pi*v[j])**1.5
            h.append(np.array(a.rotation_difference(b)@Vector(half[j]))*width)
        h=np.array(h);rr=np.stack([c-h,c+h],axis=1);rr[:4]=r[:4]
        da,db=[x[ids].reshape(18,2,3) for x in deltas[name]]
        shift=np.zeros(18)
        for delta in [np.zeros_like(da),da+db,da-db,-da+db,-da-db]:
            for j in range(4,18):
                for point in (rr+delta)[j]:
                    hit,_,_,_=body.ray_cast(Vector((-.5,point[1],point[2])),Vector((1,0,0)),1)
                    if hit is not None:shift[j]=min(shift[j],hit.x-.009-point[0])
        for _ in range(2):
            smoothed=shift.copy();smoothed[4:-1]=.15*shift[3:-2]+.70*shift[4:-1]+.15*shift[5:]
            shift=np.minimum(shift,smoothed)
        rr[:,:,0]+=shift[:,None];assert np.array_equal(rr[:4],r[:4])
        revised[name][ids]=rr.reshape(-1,3);selected_ids[name].append(ids)
    for name,q in revised.items():apply_retained(bpy.data.objects[name],q,mapping,report,apply)
    collar=fit_front_collar(selected_ids,mapping,report,apply)
    # Retain pigment and texture images, but carry visible strand coverage
    # farther along selected existing cards before their geometric fine tips.
    for name,parts in selected_ids.items():
        ob=bpy.data.objects[name];layer=ob.data.uv_layers.active.data;uv=np.zeros((len(ob.data.vertices),2))
        for loop in ob.data.loops:uv[loop.vertex_index]=layer[loop.index].uv[:]
        for ids in parts:
            old=uv[ids,1].copy();uv[ids,1]=old-.07*smooth((old-.20)/.80)
        for loop in ob.data.loops:layer[loop.index].uv=uv[loop.vertex_index]
        mapping[name]['addedUv']=np.stack([uv[:,0],1-uv[:,1]],axis=1).tolist()
    report['faceFall']={'cards':sum(map(len,selected_ids.values())),'byMesh':{n:len(x) for n,x in selected_ids.items()},
        'guideGroups':14,'tipHeights':tips,'retainedRootPairs':4,'maximumCoverageUvShift':.07,
        'frontCollarFit':collar,'selectedCardFirstVertices':{n:[x[0] for x in parts] for n,parts in selected_ids.items()},
        'addedGeometry':0,'relativeSecondaryShapesRetained':True}


def fit_front_collar(cards,mapping,report,apply,retained_pairs=4):
    rig=bpy.data.objects['AvatarSkeleton'];scene=bpy.context.scene
    bases={n:array(bpy.data.objects[n]) for n in NAMES};amplitudes={n:np.zeros(len(cards[n])) for n in NAMES}
    ramp=smooth((np.linspace(0,1,18)-(retained_pairs-1)/17)/.48)
    cases=[]
    for clip in ['idle','walk','run']:
        for frame in np.linspace(*bpy.data.actions[clip].frame_range,9):cases.append((clip,float(frame),{}))
    cases += [('idle',1,POSES['hair-left']),('idle',1,POSES['hair-right'])]
    cases += [('idle',1,{'Secondary_HairSide':s,'Secondary_HairBack':b}) for s,b in [(-1,1),(1,-1)]]
    rig.data.pose_position='POSE';rounds=[]
    for iteration in range(5):
        largest=0
        for clip,frame,shape in cases:
            rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(int(frame),subframe=frame%1);set_pose(shape)
            transform=rig.matrix_world@rig.pose.bones['head'].matrix@rig.data.bones['head'].matrix_local.inverted()@rig.matrix_world.inverted()
            direction=np.array(transform.to_3x3())[:,1];assert direction[1]>.8
            coats=[Surface(rig,bpy.data.objects[n]).tree for n in ['Structured armhole jacket','PLURR folded hood']]
            for name in NAMES:
                points=array(bpy.data.objects[name],True)
                for i,ids in enumerate(cards[name]):
                    old=amplitudes[name][i];needed=old;card=points[ids].reshape(18,2,3)
                    posed=card-direction[None,None,:]*old*ramp[:,None,None]
                    for j in range(retained_pairs,18):
                        for point in posed[j]:
                            if point[2]>1.63:continue
                            for tree in coats:
                                hit,_,_,_=tree.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                                if hit is not None:needed=max(needed,old+(point[1]-hit.y+.012)/(direction[1]*ramp[j]))
                        for a,b,ra,rb in [(posed[j-1,0],posed[j,0],ramp[j-1],ramp[j]),(posed[j-1,1],posed[j,1],ramp[j-1],ramp[j]),(posed[j,0],posed[j,1],ramp[j],ramp[j])]:
                            if min(a[2],b[2])>1.63:continue
                            edge=Vector(b-a);length=edge.length
                            if length<1e-8:continue
                            for tree in coats:
                                hit,_,_,distance=tree.ray_cast(Vector(a),edge.normalized(),length)
                                if hit is None:continue
                                f=distance/length;weight=ra*(1-f)+rb*f
                                if weight<.001:continue
                                front,_,_,_=tree.ray_cast(Vector((hit.x,-.5,hit.z)),Vector((0,1,0)),1)
                                if front is not None:needed=max(needed,old+(hit.y-front.y+.014)/(direction[1]*weight))
                    largest=max(largest,needed-old);amplitudes[name][i]=needed
        rounds.append(largest*1000);print('FRONT_FALL_FIT',iteration+1,'increase mm',rounds[-1],flush=True)
        if largest<.0001:break
    maximum=max(float(x.max(initial=0)) for x in amplitudes.values());assert maximum<.18,maximum
    rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({});rig.data.pose_position='REST';bpy.context.view_layer.update()
    for name in NAMES:
        q=bases[name].copy()
        for i,ids in enumerate(cards[name]):q[ids,1]-=np.repeat(ramp*amplitudes[name][i],2)
        apply_retained(bpy.data.objects[name],q,mapping,report,apply)
    return {'poseSamples':len(cases),'maximumShiftMm':maximum*1000,'iterationIncreasesMm':rounds,'targetMarginMm':12}
