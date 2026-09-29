"""Set the upper pony closer to the crown and lengthen four temple wisps.

Connection map: a shared displacement field acts on the upper carrier, long
cards, inner fibers and flyaways. It is zero at every measured pony root and
below 1.655 m. The carrier's scalp attachment stays fixed. Four cheek cards
retain their first four pairs under the goggles; the free tips follow the
cheek surface. Thin hair uses millimeter surface clearance. Existing origins,
head weights, UVs, colors and relative secondary offsets stay in place.
"""
import math
import bpy,numpy as np
from mathutils import Vector
from assemble_complete_pair import array
from complete_pair_geometry import Surface,smooth
from refine_complete_groom_finish import islands

NAMES=[f'PLURR pony strands {i}' for i in range(3)]+['PLURR pony surface fibers','Polished female flyaways','PLURR gathered pony bundle']


def settle_crown(mapping,report,apply):
    rig=bpy.data.objects['AvatarSkeleton'];body=Surface(rig,bpy.data.objects['AvatarBody']).tree
    lens=Surface(rig,bpy.data.objects['PLURR goggle lens']).tree
    rows={};cheek_ids={};root_ids={};fitted=0
    for name in NAMES:
        ob=bpy.data.objects[name];p=array(ob);q=p.copy();cheeks=[];roots=[]
        if name!='PLURR gathered pony bundle':
            for ids in islands(ob):
                if len(ids)==34:cheeks.append(ids)
                else:roots.extend(ids[:2])
        weight=smooth((-p[:,0]-.063)/.055)*smooth((p[:,2]-1.655)/.065)
        q+=weight[:,None]*np.array([.022,-.008,-.012])
        if cheeks:q[np.concatenate(cheeks)]=p[np.concatenate(cheeks)]
        if roots:assert np.array_equal(q[roots],p[roots]),(name,'root field')
        # Surface fitting is limited to displaced vertices, so hidden anchors
        # and existing intentional overlaps are not altered incidentally.
        for vi in np.flatnonzero(np.linalg.norm(q-p,axis=1)>1e-8):
            point=q[vi]
            hit,_,_,_=body.ray_cast(Vector((-.5,point[1],point[2])),Vector((1,0,0)),1)
            if hit is not None and point[0]>hit.x-.003:
                point[0]=hit.x-.003;fitted+=1
        selected=[]
        # Each side receives two slightly longer, curved tendrils. Keep the
        # many finer surrounding cheek fibers at their established length.
        for side in [-1,1]:
            candidates=[ids for ids in cheeks if np.sign(p[ids[:2]].mean(0)[0])==side]
            if not candidates:continue
            candidates.sort(key=lambda ids:p[ids[-2:]].mean(0)[2])
            for order,ids in enumerate(candidates[:2]):
                r=p[ids].reshape(17,2,3);old=r.mean(1);half=(r[:,1]-r[:,0])*.5
                v=np.clip((np.linspace(0,1,17)-3/16)/(1-3/16),0,1);free=smooth(v)
                c=old.copy();c[:,2]-=(.026 if order==0 else .016)*free
                c[:,0]+=side*(.004*np.sin(math.pi*v)-.003*free)
                h=half.copy()
                for j in range(4,17):
                    a=Vector(old[min(j+1,16)]-old[j-1]).normalized();b=Vector(c[min(j+1,16)]-c[j-1]).normalized()
                    h[j]=np.array(a.rotation_difference(b)@Vector(half[j]))*(1+.22*np.sin(math.pi*v[j]))
                rr=np.stack([c-h,c+h],axis=1);rr[:4]=r[:4]
                for pair in rr[4:]:
                    for point in pair:
                        hit,_,_,_=body.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                        if hit is not None:point[1]=min(point[1],hit.y-.0035)
                        skin,normal,_,dist=body.find_nearest(Vector(point))
                        if dist<.0028:point[:]=skin+normal*.0028
                        front,_,_,_=lens.ray_cast(Vector((point[0],-.5,point[2])),Vector((0,1,0)),1)
                        if front is not None:point[1]=max(point[1],front.y+.0015)
                q[ids]=rr.reshape(-1,3);selected.append(ids[0])
        prior=dict(report[name]);old_mapping=dict(mapping[name]);apply(ob,q,mapping,report)
        if 'addedUv' in old_mapping:mapping[name]['addedUv']=old_mapping['addedUv']
        report[name].update({k:v for k,v in prior.items() if k not in report[name]})
        rows[name]={'changedVertices':int(np.count_nonzero(np.linalg.norm(q-p,axis=1)>1e-7)),
            'maximumMovementMm':float(np.linalg.norm(q-p,axis=1).max()*1000)}
        cheek_ids[name]=selected;root_ids[name]=roots
    report['crownSettle']={'meshes':rows,'selectedCheekFirstVertices':cheek_ids,'skinFittedVertices':fitted,
        'sharedDisplacementMeters':[.022,-.008,-.012],'unchangedLowerHeight':1.655,
        'rootPairsRetained':True,'addedGeometry':0,'relativeSecondaryShapesRetained':True}
