"""Soften the forehead/temple strands and compact the green crown accent.

Connection map: cheek cards retain their first four pairs under the goggles;
front locks retain their first three rows on the cap; the green tuft retains
its first two pairs at the pony core. Hair uses millimeter surface clearance,
not structural overlap. All long pink cards, origins, topology, UVs, weights
and relative secondary deltas remain intact. Free front edges fit the actual
skin and sit behind the projected goggle lenses.
"""
import math
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands


def soften_face_wisps(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton']
    body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
    counts={};fitted=0
    def fit(points,retained):
        nonlocal fitted
        for row in points[retained:]:
            for point in row:
                old=point.copy()
                hit,_,_,_=body.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                if hit is not None:point[1]=min(point[1],hit.y-.0035)
                # A depth-only gap shrinks to less than a millimeter on the
                # steep temple. Preserve actual surface clearance there too.
                skin,normal,_,distance=body.find_nearest(Vector(point))
                if distance<.0028:point[:]=skin+normal*.0028
                front,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                if front is not None:point[1]=max(point[1],front.y+.0015)
                skin_front,_,_,_=body.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                if skin_front is not None:assert point[1]<skin_front.y-.001,'No room between skin and lens'
                fitted+=int(np.linalg.norm(point-old)>1e-8)
        return points
    def keep_report(ob,q):
        old=dict(report.get(ob.name,{}));existing=ob.name in mapping
        apply(ob,q,mapping,report)
        # Added front locks are exported in full by export_additions. They
        # have no counterpart in the archived original GLB to transfer onto.
        if not existing:mapping.pop(ob.name)
        for key,value in old.items():
            if key not in report[ob.name]:report[ob.name][key]=value

    for name in ['PLURR pony strands 0','PLURR pony strands 2']:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy();count=0
        for i,ids in enumerate(islands(ob)):
            if len(ids)!=34:continue
            r=p[ids].reshape(17,2,3);old=r.mean(1);half=(r[:,1]-r[:,0])*.5
            t=np.linspace(0,1,17);v=np.clip((t-t[3])/(1-t[3]),0,1)
            side=np.sign(old[0,0]);phase=i*2.399963
            length=.82+.18*(.5+.5*math.sin(phase))
            sample=t[3]+v*(1-t[3])*length
            c=np.stack([np.interp(sample,t,old[:,axis]) for axis in range(3)],axis=1)
            c[:,0]+=side*.0035*np.sin(v*1.5*math.pi+phase)*np.sin(math.pi*v)
            c[:,1]-=.0018*np.sin(math.pi*v)**2
            # A small number of longer wisps breaks the comb-like row of ends.
            c[:,2]-=(.012 if i%6==0 else -.003*math.sin(phase))*smooth(v)
            c[:4]=old[:4];h=half.copy()
            for j in range(4,17):
                a=Vector(old[min(j+1,16)]-old[j-1]).normalized()
                b=Vector(c[min(j+1,16)]-c[j-1]).normalized()
                width=1-(.25+.18*(.5+.5*math.sin(phase)))*smooth(v[j]/.40)
                h[j]=np.array(a.rotation_difference(b)@Vector(half[j]))*width
            rr=np.stack([c-h,c+h],axis=1);rr[:4]=r[:4]
            q[ids]=fit(rr,4).reshape(-1,3);count+=1
        keep_report(ob,q);counts[name]=count

    name='PLURR loose brunette front locks';ob=bpy.data.objects[name];p=array(ob);q=p.copy()
    for i,ids in enumerate(islands(ob)):
        r=p[ids].reshape(28,3,3);old=(r[:,0]+r[:,2])*.5;half=(r[:,2]-r[:,0])*.5
        relief=r[:,1]-old;lock=i//5;layer=i%5;family=[0,0,0,1,1,2,2][lock]
        t=np.linspace(0,1,28);v=np.clip((t-t[2])/(1-t[2]),0,1);tail=smooth((v-.55)/.45)
        c=old.copy();c[:,0]+=.0018*np.sin(math.tau*v+lock*.7)*np.sin(math.pi*v)
        c[:,0]+=[0,.003,.010][family]*tail
        c[:,2]-=([0,.004,.010][family]+.0008*(layer-2))*tail
        h=half.copy();rel=relief.copy()
        for j in range(3,28):
            a=Vector(old[min(j+1,27)]-old[j-1]).normalized()
            b=Vector(c[min(j+1,27)]-c[j-1]).normalized();rotation=a.rotation_difference(b)
            width=1-(.20+.06*math.sin(lock+layer))*smooth(v[j]/.40)
            h[j]=np.array(rotation@Vector(half[j]))*width
            rel[j]=rotation@Vector(relief[j])
        rr=np.stack([c-h,c+rel,c+h],axis=1);rr[:3]=r[:3]
        q[ids]=fit(rr,3).reshape(-1,3)
    keep_report(ob,q);counts[name]=len(islands(ob))

    name='PLURR pony strands 3';ob=bpy.data.objects[name];p=array(ob);q=p.copy()
    for i,ids in enumerate(islands(ob)):
        r=p[ids].reshape(18,2,3);old=r.mean(1);half=(r[:,1]-r[:,0])*.5
        t=np.linspace(0,1,18);free=smooth((t-t[1])/.50);c=old.copy();root=old[0]
        c[:,0]-=(old[:,0]-root[0])*.28*free
        c[:,2]-=(old[:,2]-root[2])*(.13+.10*(.5+.5*math.sin(i*2.4)))*free
        c[:,1]+=.0035*math.sin(i*2.399963)*np.sin(math.pi*t)*free
        h=half.copy()
        for j in range(2,18):
            a=Vector(old[min(j+1,17)]-old[j-1]).normalized()
            b=Vector(c[min(j+1,17)]-c[j-1]).normalized()
            h[j]=np.array(a.rotation_difference(b)@Vector(half[j]))*(1-.15*free[j])
        rr=np.stack([c-h,c+h],axis=1);rr[:2]=r[:2];q[ids]=rr.reshape(-1,3)
    keep_report(ob,q);counts[name]=len(islands(ob))
    report['faceWisps']={'cards':counts,'fittedFreeVertices':fitted,
        'retainedCheekRootPairs':4,'retainedFrontRootRows':3,'retainedTuftRootPairs':2,
        'longPonyUnchanged':True,'addedGeometry':0,'relativeSecondaryShapesRetained':True}
