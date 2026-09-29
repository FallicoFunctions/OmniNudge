"""Drape an outer pony layer beside the head and over the left shoulder.

Connection map: retain the first four pairs at the existing crown attachment;
the remaining same-topology cards follow grouped curves beside the left ear.
Above the ear, locks remain behind the measured head. Lower lengths lie ahead
of the measured collar with allowance for all four secondary-motion corners.
No object origins, weights, UVs, indices or relative morph deltas are changed.
"""
import math
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths
from refine_female_crown import bezier


def drape_shoulder(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton']
    trees=[Surface(rig,bpy.data.objects[n]).tree for n in
        ['AvatarBody','Structured armhole jacket','PLURR folded hood']]
    names=[f'PLURR pony strands {i}' for i in range(3)]
    original={n:array(bpy.data.objects[n]) for n in names};rows=[]
    deltas={}
    for n,p in original.items():
        keys=bpy.data.objects[n].data.shape_keys.key_blocks
        deltas[n]=[np.array([v.co[:] for v in keys[k].data])-p
            for k in ['Secondary_HairSide','Secondary_HairBack']]
        for ids in islands(bpy.data.objects[n]):
            if len(ids)==36:rows.append((n,ids,p[ids].reshape(18,2,3)))
    paths=np.array([r.mean(1) for _,_,r in rows]);groups=group_paths(paths,26)
    guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    # Pick the most forward outer groups so the new layer grows naturally
    # from the exposed side of the pony, with the rear volume kept intact.
    selected=sorted(guides,key=lambda g:guides[g][6:13,1].mean())[:9]
    revised={n:p.copy() for n,p in original.items()};counts={n:0 for n in names}
    t=np.linspace(0,1,18);start_index=3;v=np.clip((t-t[start_index])/(1-t[start_index]),0,1)
    for i,(name,ids,r) in enumerate(rows):
        g=int(groups[i])
        if g not in selected:continue
        guide=guides[g];old=r.mean(1);phase=g*2.399963
        start=guide[start_index];control=start+(start-guide[start_index-1])*3.0
        control[0]=min(control[0],start[0]-.022);control[2]=min(control[2],1.768)
        tip=np.array([-.113-.029*math.sin(phase),-.114+.019*math.cos(phase),
            1.465+.070*(.5+.5*math.sin(phase+.8))])
        c=bezier([start,control,[-.117-.025*math.cos(phase),-.111,1.590],tip],v)
        # Gather the lower fibers into their parent lock and stagger their
        # actual ends. Sparse, stretched tails previously read as dark lines
        # drawn over the jacket instead of tapering naturally at the collar.
        c+=(old-guide)*(.65-.53*smooth(v))[:,None]
        c[:,2]+=.010*math.sin(i*2.399963)*smooth((v-.55)/.45)
        c[:,0]+=.018*np.sin(v*math.pi*2.8+phase)*np.sin(math.pi*v)
        c[:,1]+=.011*np.sin(v*math.pi*2.4+phase+.7)*np.sin(math.pi*v)
        c[:start_index+1]=old[:start_index+1]
        a,b=[x[ids].reshape(18,2,3).mean(1) for x in deltas[name]]
        variants=[np.zeros_like(a),a+b,a-b,-a+b,-a-b]
        # Passing locks go around the outer ear, which front/back fitting
        # alone can miss when a narrow card straddles its lateral silhouette.
        left=np.full(18,np.inf)
        for delta in variants:
            for j,p in enumerate(c+delta):
                if j<=start_index or not 1.57<p[2]<1.71:continue
                hit,_,_,_=trees[0].ray_cast(Vector((-.5,p[1],p[2])),Vector((1,0,0)),1)
                if hit is not None:left[j]=min(left[j],hit.x-.011-delta[j,0])
        c[:,0]=np.minimum(c[:,0],left)
        for _ in range(2):
            x=c[:,0].copy();x[start_index+1:-1]=.15*x[start_index:-2]+.70*x[start_index+1:-1]+.15*x[start_index+2:]
            c[:,0]=np.minimum(x,left)
        front=np.full(18,np.inf);back=np.full(18,-np.inf)
        for delta in variants:
            for j,p in enumerate(c+delta):
                if j<=start_index:continue
                ahead=p[2]<1.615
                for k,tree in enumerate(trees):
                    if k and not ahead:continue
                    origin=Vector((p[0],-.5 if ahead else .5,p[2]))
                    direction=Vector((0,1 if ahead else -1,0))
                    hit,_,_,_=tree.ray_cast(origin,direction,1)
                    if hit is None:continue
                    if ahead:front[j]=min(front[j],hit.y-(.012 if k==0 else .022)-delta[j,1])
                    else:back[j]=max(back[j],hit.y+.010-delta[j,1])
        assert not np.any(front<back),'Shoulder layer crosses head/coat fit constraints'
        c[:,1]=np.minimum(np.maximum(c[:,1],back),front)
        for _ in range(2):
            y=c[:,1].copy();y[start_index+1:-1]=.15*y[start_index:-2]+.70*y[start_index+1:-1]+.15*y[start_index+2:]
            c[:,1]=np.minimum(np.maximum(y,back),front)
        # Collar fitting changes depth. Recheck the ear at that final depth
        # so the previous lateral margin cannot disappear around its rim.
        for delta in variants:
            for j,p in enumerate(c+delta):
                if j<=start_index or not 1.57<p[2]<1.71:continue
                hit,_,_,_=trees[0].ray_cast(Vector((-.5,p[1],p[2])),Vector((1,0,0)),1)
                if hit is not None:c[j,0]=min(c[j,0],hit.x-.011-delta[j,0])
        half=(r[:,1]-r[:,0])*.5;h=[]
        for j in range(18):
            old_t=Vector(old[min(j+1,17)]-old[max(j-1,0)]).normalized()
            new_t=Vector(c[min(j+1,17)]-c[max(j-1,0)]).normalized()
            fullness=1+.30*smooth((v[j]-.35)/.25)*(1-smooth((v[j]-.76)/.24))
            h.append(np.array(old_t.rotation_difference(new_t)@Vector(half[j]))*fullness)
        h=np.array(h);rr=np.stack([c-h,c+h],axis=1);rr[:start_index+1]=r[:start_index+1]
        # Check the real ribbon edges too. The ear rim can project almost a
        # centimeter beyond the surface hit by a card's center ray.
        da,db=[x[ids].reshape(18,2,3) for x in deltas[name]]
        edge_shift=np.zeros(18)
        for delta in [np.zeros_like(da),da+db,da-db,-da+db,-da-db]:
            for j,pair in enumerate(rr+delta):
                if j<=start_index:continue
                for point in pair:
                    if not 1.57<point[2]<1.71:continue
                    hit,_,_,_=trees[0].ray_cast(Vector((-.5,point[1],point[2])),Vector((1,0,0)),1)
                    if hit is not None:edge_shift[j]=min(edge_shift[j],hit.x-.008-point[0])
        for _ in range(2):
            smoothed=edge_shift.copy();smoothed[start_index+1:-1]=.20*edge_shift[start_index:-2]+.60*edge_shift[start_index+1:-1]+.20*edge_shift[start_index+2:]
            edge_shift=np.minimum(edge_shift,smoothed)
        rr[:,:,0]+=edge_shift[:,None]
        revised[name][ids]=rr.reshape(-1,3);counts[name]+=1
    for n,q in revised.items():
        apply(bpy.data.objects[n],q,mapping,report)
        report[n]['shoulderCascadeCards']=counts[n]
    report['shoulderCascade']={'guideGroups':len(selected),'cards':sum(counts.values()),
        'retainedRootPairsPerCard':start_index+1,'addedGeometry':0}
