"""Sample the hanging hood against body, coat, and its own non-adjacent faces."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
import audit_rigged_jacket_sleeves as A

DIRECTIONS=[Vector(d).normalized() for d in [(1,.137,.311),(-1,.173,.419),(.237,1,.181),(.371,-1,.257),(.139,.273,1),(.283,.119,-1),(-.327,.713,.619)]]

def body_clearance(tree,q):
    q=Vector(q);hit,n,_,distance=tree.find_nearest(q)
    if (q-hit).dot(n)>=0:return distance
    exits=0
    for direction in DIRECTIONS:
        _,normal,_,_=tree.ray_cast(q,direction)
        exits+=normal is not None and normal.dot(direction)>0
    return -distance if exits>=4 else distance


def segment_crosses_triangle(a,b,triangle):
    e1=triangle[1]-triangle[0];e2=triangle[2]-triangle[0];direction=b-a
    h=np.cross(direction,e2);det=np.dot(e1,h)
    if abs(det)<1e-12:return False
    inv=1/det;s=a-triangle[0];u=inv*np.dot(s,h)
    if u<-1e-7 or u>1+1e-7:return False
    cross=np.cross(s,e1);v=inv*np.dot(direction,cross)
    if v<-1e-7 or u+v>1+1e-7:return False
    t=inv*np.dot(e2,cross)
    return 1e-6<t<1-1e-6


def self_crossings(points,faces):
    tree=BVHTree.FromPolygons([Vector(q) for q in points],faces,all_triangles=True)
    hits=[]
    for a,b in tree.overlap(tree):
        if a>=b or set(faces[a])&set(faces[b]):continue
        ta=points[faces[a]];tb=points[faces[b]]
        if any(segment_crosses_triangle(t[i],t[(i+1)%3],other) for t,other in [(ta,tb),(tb,ta)] for i in range(3)):hits.append([a,b])
    return hits


def run(source,diagnostic=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'female-jacket-refined.blend'))
    original=array(bpy.data.objects['PLURR folded hood'])[:60].copy()
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'female-{source}.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];hood=bpy.data.objects['PLURR folded hood'];coat=bpy.data.objects['Structured armhole jacket'];body=bpy.data.objects['AvatarBody']
    assert np.array_equal(array(hood)[:60],original),'Hood neck attachment changed'
    rows=[]
    for clip in ['idle','walk','run']:
        rig.animation_data.action=bpy.data.actions[clip]
        for frame in np.linspace(*rig.animation_data.action.frame_range,9):
            A.sample(scene,float(frame));bp,bf=A.H.geometry(body);bodytree=BVHTree.FromPolygons(bp,bf,all_triangles=True)
            cp,cf=A.H.geometry(coat);coattree=BVHTree.FromPolygons(cp,cf,all_triangles=True);bounds=np.asarray(cp);lo,hi=bounds.min(0),bounds.max(0)
            hp=array(hood,True);dist=np.array([body_clearance(bodytree,q) for q in hp]);overlaps=[]
            for i,q in enumerate(hp):
                if np.any(q<lo) or np.any(q>hi):continue
                hit,n,_,d=coattree.find_nearest(Vector(q));signed=(Vector(q)-hit).dot(n)
                if d<.03 and signed<-.002:overlaps.append(i)
            mods=[(m,m.show_viewport) for m in hood.modifiers if m.type!='ARMATURE']
            for m,_ in mods:m.show_viewport=False
            A.update();mp,mf=A.H.geometry(hood);crossings=self_crossings(np.asarray(mp),np.asarray(mf))
            for m,state in mods:m.show_viewport=state
            A.update()
            row={'clip':clip,'frame':float(frame),'bodyPenetrationsOver2mm':int((dist<-.002).sum()),'minimumBodyClearanceMm':float(dist.min()*1000),'nearCoatPenetrationsOver2mm':len(overlaps),'nonAdjacentMidSurfaceCrossings':len(crossings)}
            if diagnostic and (overlaps or crossings):row.update(overlapVertices=overlaps,crossingFaces=crossings)
            rows.append(row)
            if not diagnostic:assert not row['bodyPenetrationsOver2mm'] and not overlaps and not crossings,row
    report={'source':source,'neckRowVerticesPreservedExactly':60,'movementSamples':len(rows),'bodyPenetrationsOver2mm':sum(r['bodyPenetrationsOver2mm'] for r in rows),'nearCoatPenetrationsOver2mm':sum(r['nearCoatPenetrationsOver2mm'] for r in rows),'nonAdjacentMidSurfaceCrossings':sum(r['nonAdjacentMidSurfaceCrossings'] for r in rows),'minimumBodyClearanceMm':min(r['minimumBodyClearanceMm'] for r in rows),'rows':rows,'scope':'27 sampled poses, evaluated thickness for body/near-coat contact; non-adjacent non-coplanar triangle crossings on the hood mid-surface. Not continuous collision certification.'}
    (OUT/('jacket-shape-motion-diagnostic.json' if diagnostic else 'jacket-shape-motion-validation.json')).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='rows'}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default='runtime');p.add_argument('--diagnostic',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    run(a.source,a.diagnostic)
