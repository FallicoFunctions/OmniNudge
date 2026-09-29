"""Reference silhouette pass on the existing female scalp and pony topology.

Connection map: the cap follows the measured head at its retained clearance;
460 swept locks root 1.4 mm over the revised cap and gather into the same crown.
The braid is built after this surface edit. Pony and flyaway first pairs remain
at the existing carrier attachment. Hair layers use millimeter clearance rather
than structural overlaps. Existing origins, UVs, indices and head weights stay.
"""
import math, bpy, numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands
from refine_complete_male_hair import group_paths


def temple_shift(point):
    x,y,z=point
    side=float(smooth((abs(x)-.043)/.023))
    lower=float(smooth((1.684-z)/.048))
    return -.023*side*math.exp(-((y+.040)/.041)**2)*lower


def shape_scalp(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody'])
    cap=bpy.data.objects['Complete scalp'];p=array(cap);q=p.copy()
    for i,point in enumerate(p):
        dz=temple_shift(point)
        if abs(dz)<1e-7:continue
        hit,n,_,_=body.tree.find_nearest(Vector(point));gap=max(.0025,(Vector(point)-hit).dot(n))
        probe=point.copy();probe[2]+=dz
        hit,n,_,_=body.tree.find_nearest(Vector(probe));q[i]=hit+n*gap
    apply(cap,q,mapping,report)
    scalp=Surface(rig,cap)
    ob=bpy.data.objects['PLURR swept scalp groom'];p=array(ob);q=p.copy()
    parts=islands(ob);paths=np.array([p[ids].reshape(24,2,3).mean(1) for ids in parts])
    groups=group_paths(paths,38)
    for i,ids in enumerate(parts):
        r=p[ids].reshape(24,2,3);old=r.mean(1);c=old.copy();half=(r[:,1]-r[:,0])*.5
        t=np.linspace(0,1,len(r));phase=int(groups[i])*2.399963
        root=old[0];front=float(smooth((-root[1]-.032)/.07))
        side=float(smooth((abs(root[0])-.042)/.026))
        arch=np.sin(math.pi*t)**1.15
        for j,point in enumerate(c):
            probe=point.copy();probe[2]+=temple_shift(point)
            probe[0]-=.008*front*arch[j]
            probe[2]+=.0025*math.sin(phase)*arch[j]
            hit,n,_,_=scalp.tree.find_nearest(Vector(probe))
            lift=.0014+(.003+.009*front+.004*side)*arch[j]*(.72+.28*math.sin(phase)**2)
            c[j]=hit+n*lift
        # Rotate the original cross section with the curve, avoiding abrupt
        # changes from triangle normals on the low-density scalp carrier.
        widths=[]
        for j in range(len(t)):
            old_t=Vector(old[min(j+1,23)]-old[max(j-1,0)]).normalized()
            new_t=Vector(c[min(j+1,23)]-c[max(j-1,0)]).normalized()
            widths.append(np.array(old_t.rotation_difference(new_t)@Vector(half[j])))
        h=np.array(widths)
        q[ids]=np.stack([c-h,c+h],axis=1).reshape(-1,3)
    apply(ob,q,mapping,report)
    report[ob.name]['contourGuides']=38


def shape_pony(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton']
    clearance_trees=[Surface(rig,bpy.data.objects[name]).tree for name in
        ['AvatarBody','Structured armhole jacket','PLURR folded hood']]
    def fit_behind_character(curve,variants=None):
        # Locks wrap behind the measured head, shoulders and collar. The
        # former blanket translation also pulled some upper locks into the
        # skull. Head clearance is 8 mm; collar allowance is 14 mm at rest.
        required=np.full(len(curve),-np.inf)
        for delta in variants if variants is not None else [np.zeros_like(curve)]:
            for j,p in enumerate(curve+delta):
                for surface,tree in enumerate(clearance_trees):
                    if surface>0 and p[2]>1.57:continue
                    hit,_,_,_=tree.ray_cast(Vector((p[0],.5,p[2])),Vector((0,-1,0)),1)
                    if hit is not None:required[j]=max(required[j],hit.y+(.008 if surface==0 else .014)-delta[j,1])
        curve[:,1]=np.maximum(curve[:,1],required)
        for _ in range(2):
            y=curve[:,1].copy()
            y[1:-1]=.18*y[:-2]+.64*y[1:-1]+.18*y[2:]
            curve[:,1]=np.maximum(y,required)
        return curve
    names=['PLURR pony strands 0','PLURR pony strands 1','PLURR pony strands 2']
    originals={name:array(bpy.data.objects[name]) for name in names};rows=[]
    shape_offsets={}
    for name in names+['Polished female flyaways','PLURR pony surface fibers']:
        ob=bpy.data.objects[name];basis=array(ob);keys=ob.data.shape_keys.key_blocks if ob.data.shape_keys else []
        shape_offsets[name]=[np.array([v.co[:] for v in keys[k].data])-basis
            if k in keys else np.zeros_like(basis) for k in ['Secondary_HairSide','Secondary_HairBack']]
    def motion_variants(name,ids):
        a,b=[v[ids].reshape(-1,2,3).mean(1) for v in shape_offsets[name]]
        return [np.zeros_like(a),-a-b,-a+b,a-b,a+b]
    for name in names:
        for ids in islands(bpy.data.objects[name]):
            if len(ids)==36:rows.append((name,ids,originals[name][ids].reshape(18,2,3)))
    paths=np.array([r.mean(1) for _,_,r in rows]);groups=group_paths(paths,26)
    guides={g:paths[groups==g].mean(0) for g in np.unique(groups)}
    revised={name:p.copy() for name,p in originals.items()}
    t=np.linspace(0,1,18);free=smooth((t-.12)/.36)
    for i,(name,ids,r) in enumerate(rows):
        g=int(groups[i]);phase=g*2.399963;guide=guides[g];old=r.mean(1)
        c=guide.copy();v=np.clip((t-.21)/.79,0,1)
        # Keep a compact gathering point. The hanging length has coherent,
        # broad bends and a fan of unequal ends instead of a vertical curtain.
        c[:,0]+=.013*free
        c[:,1]-=.027*free
        c[:,0]+=(.015+.010*(.5+.5*math.sin(phase)))*np.sin(v*math.pi*2.5+phase)*free
        c[:,1]+=.012*np.sin(v*math.pi*2.1+phase+.8)*free
        c[:,2]+=.007*np.sin(v*math.pi*2.2+phase+.5)*free
        c+=(old-guide)*(1-.25*free[:,None])
        c=fit_behind_character(c,motion_variants(name,ids))
        half=(r[:,1]-r[:,0])*.5;h=[]
        for j in range(len(t)):
            a=Vector(old[min(j+1,17)]-old[max(j-1,0)]).normalized()
            b=Vector(c[min(j+1,17)]-c[max(j-1,0)]).normalized()
            h.append(np.array(a.rotation_difference(b)@Vector(half[j]))*(1+.18*math.sin(math.pi*t[j])))
        h=np.array(h);rr=np.stack([c-h,c+h],axis=1);rr[0]=r[0]
        revised[name][ids]=rr.reshape(-1,3)
    for name,q in revised.items():
        apply(bpy.data.objects[name],q,mapping,report)
    ob=bpy.data.objects['Polished female flyaways'];p=array(ob);q=p.copy()
    for i,ids in enumerate(islands(ob)):
        if i%3==0:continue # Short crown wisps keep their distinct upright fan.
        r=p[ids].reshape(-1,2,3);old=r.mean(1);c=old.copy();half=(r[:,1]-r[:,0])*.5
        t=np.linspace(0,1,len(r));v=np.clip((t-.21)/.79,0,1);free=smooth((t-.12)/.36);phase=i*2.399963
        c[:,0]+=(.013+.018*np.sin(v*math.pi*2.5+phase))*free
        c[:,1]+=(-.027+.012*np.sin(v*math.pi*2.1+phase+.8))*free
        c=fit_behind_character(c,motion_variants(ob.name,ids))
        h=[]
        for j in range(len(t)):
            a=Vector(old[min(j+1,len(t)-1)]-old[max(j-1,0)]).normalized()
            b=Vector(c[min(j+1,len(t)-1)]-c[max(j-1,0)]).normalized()
            h.append(np.array(a.rotation_difference(b)@Vector(half[j])))
        h=np.array(h);rr=np.stack([c-h,c+h],axis=1);rr[0]=r[0];q[ids]=rr.reshape(-1,3)
    apply(ob,q,mapping,report)
    roots=[]
    for name in names+['PLURR pony strands 3','Polished female flyaways']:
        ob=bpy.data.objects[name];p=array(ob)
        for ids in islands(ob):
            if name.startswith('PLURR pony strands') and len(ids)!=36:continue
            roots.append(p[ids[:2]].mean(0))
    tree=KDTree(len(roots))
    for i,point in enumerate(roots):tree.insert(Vector(point),i)
    tree.balance()
    # The opaque inner carrier is only visible near the tie. Move its outer
    # arc and supporting fibers with the same broad field as the pony locks.
    for name in ['PLURR gathered pony bundle','PLURR pony surface fibers']:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy()
        free=smooth((-p[:,0]-.042)/.050)
        # Freeze the carrier triangles supporting every existing pony root.
        # A spatial X cutoff alone misses roots on the outside of the tie.
        free*=np.array([float(smooth((tree.find(Vector(point))[2]-.025)/.025)) for point in p])
        q[:,0]+=.013*free;q[:,1]-=.027*free
        if name=='PLURR pony surface fibers':
            parts=islands(ob)
            groups=group_paths(np.array([q[ids].reshape(24,2,3).mean(1) for ids in parts]),12)
            for i,ids in enumerate(parts):
                r=q[ids].reshape(-1,2,3);center=r.mean(1);half=(r[:,1]-r[:,0])*.5
                t=np.linspace(0,1,len(r));phase=int(groups[i])*2.399963
                loose=smooth((t-.05)/.25)*(1-smooth((t-.36)/.24))
                shifted=center.copy()
                shifted[:,0]+=.009*np.sin(t*math.pi*4+phase)*loose
                shifted[:,1]+=.008*np.cos(t*math.pi*3+phase)*loose
                shifted[:,2]-=(.005+.004*math.sin(phase))*loose
                shifted=fit_behind_character(shifted,motion_variants(name,ids))
                h=[]
                for j in range(len(t)):
                    a=Vector(center[min(j+1,len(t)-1)]-center[max(j-1,0)]).normalized()
                    b=Vector(shifted[min(j+1,len(t)-1)]-shifted[max(j-1,0)]).normalized()
                    h.append(np.array(a.rotation_difference(b)@Vector(half[j]))*(1-.42*loose[j]))
                h=np.array(h);rr=np.stack([shifted-h,shifted+h],axis=1);rr[0]=r[0]
                q[ids]=rr.reshape(-1,3)
        apply(ob,q,mapping,report)
