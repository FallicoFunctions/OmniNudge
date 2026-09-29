"""Soften the reference male's crest and ear layers on retained hair ribbons.

Connection map: every first ribbon pair stays on its existing scalp attachment.
The dark scalp and rooted underlayer are retained. Free locks share measured
guide curves, and stay at least 2 mm outside the measured head where needed.
Existing indices, UVs, skin weights, origins and relative morphs remain intact.
These thin layers use hair-scale clearance, not structural assembly overlap.
"""
import math, bpy, numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface, smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths


def soften_waves(mapping, report, apply):
    rig=bpy.data.objects['AvatarSkeleton']
    body=Surface(rig,bpy.data.objects['AvatarBody'])
    scalp=Surface(rig,bpy.data.objects['Complete scalp'])
    ob=bpy.data.objects['Luxury retained swept groom'];p=array(ob);q=p.copy()
    components=islands(ob)
    ribbons=np.array([p[ids].reshape(12,2,3) for ids in components])
    paths=ribbons.mean(2);groups=group_paths(paths,96)
    guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    t=np.linspace(0,1,12);free=smooth((t-.07)/.55)
    for i,(ids,r) in enumerate(zip(components,ribbons)):
        g=int(groups[i]);phase=g*2.399963;guide=guides[g];root=guide[0]
        # Long hanging side panels become shorter, irregular layers above the
        # ear. Forehead locks retain length for an asymmetric falling wave.
        side=float(smooth((abs(root[0])-.046)/.022))*float(smooth((root[1]+.110)/.055))
        length=(.92+.08*(.5+.5*math.sin(phase)))*(1-.25*side)
        c=np.stack([np.interp(t*length,t,guide[:,a]) for a in range(3)],axis=1)
        c+=(paths[i]-guide)*(1-.50*free[:,None])
        arch=np.sin(math.pi*t)**1.15
        front=float(smooth((-root[1]-.055)/.060))
        # Lower the front arch relative to its root, not to the highest point
        # on the skull. Otherwise a high forehead quiff hardly changes.
        c[:,2]-=(.012+.007*(.5+.5*math.sin(phase+.7)))*front*arch
        c[:,0]-=np.sign(c[:,0])*.013*side*free
        c[:,1]+=.010*side*free
        # Neighboring fibers share a gentle S curve; each lock has a distinct
        # bend and end direction rather than a repeated zigzag per strand.
        wave_scale=min(1,float(np.linalg.norm(np.diff(guide,axis=0),axis=1).sum())/.10)
        bend=np.sin(t*math.pi*1.7+phase)*free*wave_scale
        c[:,0]+=(.002+.002*(.5+.5*math.sin(phase)))*bend
        c[:,1]+=.003*np.sin(t*math.pi*1.6+phase+1.1)*free*wave_scale
        c[:,2]+=.002*np.sin(t*math.pi*1.7+phase+.4)*free*wave_scale
        curl=smooth((t-.55)/.45)
        c[:,0]+=.004*math.sin(phase+.8)*curl*wave_scale
        c[:,2]+=.004*(.4+.6*math.cos(phase))*curl*wave_scale
        if root[1]<-.105 and guide[-1,0]<-.04 and guide[-1,2]<1.755:
            # A falling forehead lock turns inward at its tip. It should read
            # as a loose curl, rather than a rigid pointed spike over the brow.
            bend=smooth((t-.22)/.52)
            c[:,0]+=.011*np.sin(t*math.pi*1.7)*bend
            c[:,1]-=.004*np.sin(t*math.pi)*bend
            c[:,0]+=.013*smooth((t-.64)/.36)
            c[:,2]+=.009*smooth((t-.64)/.36)
        # Twelve retained samples per ribbon need broad curves. Smooth only
        # free interiors; roots and tapered endpoints stay in their new places.
        for _ in range(2):
            c[1:-1]=.18*c[:-2]+.64*c[1:-1]+.18*c[2:]
        if side>.1:
            for j in range(1,len(t)):
                hit,n,_,_=scalp.tree.find_nearest(Vector(c[j]))
                fitted=np.array(hit+n*(.004+.006*math.sin(math.pi*t[j])))
                weight=.55*side*free[j]
                c[j]=c[j]*(1-weight)+fitted*weight
        # Resolve clearance against skin, retaining volume above the scalp.
        for j in range(1,len(t)):
            hit,n,_,_=body.tree.find_nearest(Vector(c[j]))
            gap=(Vector(c[j])-hit).dot(n)
            if gap<.0028:c[j]=np.array(hit+n*.0028)
        c[0]=r[0].mean(0)
        half=(r[:,1]-r[:,0])*.5
        half_new=[]
        for j,point in enumerate(c):
            tangent=Vector(c[min(j+1,11)]-c[max(j-1,0)]).normalized()
            old_tangent=Vector(paths[i,min(j+1,11)]-paths[i,max(j-1,0)]).normalized()
            # Transport the authored card frame with its curve. Rebuilding it
            # from nearest scalp normals introduces abrupt twists at facets.
            rotated=old_tangent.rotation_difference(tangent)@Vector(half[j])
            half_new.append(np.array(rotated)*(1-.15*free[j]))
        half_new=np.array(half_new)
        rr=np.stack([c-half_new,c+half_new],axis=1);rr[0]=r[0]
        q[ids]=rr.reshape(-1,3)
    apply(ob,q,mapping,report)
    report[ob.name]['waveGuides']=len(guides)
    # Keep outline fibers within the softened crest instead of leaving the old
    # quiff outline floating above the newly lowered foreground locks.
    ob=bpy.data.objects['Polished male flyaways'];p=array(ob);q=p.copy()
    for i,ids in enumerate(islands(ob)):
        r=p[ids].reshape(-1,2,3);t=np.linspace(0,1,len(r));c=r.mean(1)
        free=smooth(t/.35);half=(r[:,1]-r[:,0])*.5
        front=float(smooth((-c[0,1]-.060)/.060))
        c[:,2]-=.012*front*np.sin(math.pi*t)
        c[:,0]+=.003*math.sin(i*2.399963)*np.sin(math.pi*t)*free
        rr=np.stack([c-half*.75,c+half*.75],axis=1);rr[0]=r[0]
        q[ids]=rr.reshape(-1,3)
    apply(ob,q,mapping,report)
