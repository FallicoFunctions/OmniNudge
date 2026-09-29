"""Check all rebuilt zipper fronts against the rendered coat in 27 poses."""
import argparse,json,sys
from collections import Counter
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT
from audit_complete_jacket_shape import segment_crosses_triangle
import audit_rigged_jacket_sleeves as A

def run(sex,source,diagnostic=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{source}.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];coat=bpy.data.objects['Structured armhole jacket']
    objects=[o for o in scene.objects if o.type=='MESH' and o.get('pocketConstruction')=='regular-closed-tape-v1'];assert len(objects)==6
    assert all(o.get('pocketConstruction')=='regular-closed-tape-v1' for o in objects)
    for ob in objects:
        edges=Counter(tuple(sorted(edge)) for face in ob.data.polygons for edge in face.edge_keys)
        assert edges and all(count==2 for count in edges.values()), (ob.name,'Hardware has open or nonmanifold edges')
    rows=[]
    for clip in ['idle','walk','run']:
        rig.animation_data.action=bpy.data.actions[clip]
        for frame in np.linspace(*rig.animation_data.action.frame_range,9):
            A.sample(scene,float(frame));p,f=A.H.geometry(coat)
            count=len(coat.data.vertices);outer=[face for face in f if max(face)<count]
            assert len(outer)==len(coat.data.polygons), 'Solidify outer-surface indexing changed'
            tree=BVHTree.FromPolygons(p[:count],outer,all_triangles=True)
            closed_tree=BVHTree.FromPolygons(p,f,all_triangles=True);coat_points=np.asarray(p);coat_faces=np.asarray(f)
            for ob in objects:
                q,g=A.H.geometry(ob);q=np.asarray(q);g=np.asarray(g);tri=q[g]
                samples=np.concatenate([q,tri.mean(1),(tri[:,0]+tri[:,1])/2,(tri[:,1]+tri[:,2])/2,(tri[:,2]+tri[:,0])/2])
                hardware_tree=BVHTree.FromPolygons(q.tolist(),g.tolist(),all_triangles=True);crossings=0
                for a,b in closed_tree.overlap(hardware_tree):
                    ta=coat_points[coat_faces[a]];tb=q[g[b]]
                    if any(segment_crosses_triangle(t[i],t[(i+1)%3],other) for t,other in [(ta,tb),(tb,ta)] for i in range(3)):crossings+=1
                distances=[]
                for point in samples:
                    hit,n,_,_=tree.find_nearest(Vector(point));distances.append((Vector(point)-hit).dot(n))
                d=np.array(distances);row={'clip':clip,'frame':float(frame),'object':ob.name,'samples':len(samples),'nonCoplanarCoatCrossings':crossings,'minimumSignedCoatClearanceMm':float(d.min()*1000),'penetrationsOver01mm':int((d<-.0001).sum())}
                if diagnostic and row['penetrationsOver01mm']:
                    row['deepestPoints']=samples[np.argsort(d)[:4]].tolist()
                rows.append(row)
    result={'source':source,'objects':len(objects),'posesPerObject':27,'closedManifoldMeshes':len(objects),'minimumSignedCoatClearanceMm':min(r['minimumSignedCoatClearanceMm'] for r in rows),'penetrationsOver01mm':sum(r['penetrationsOver01mm'] for r in rows),'nonCoplanarCoatCrossings':sum(r['nonCoplanarCoatCrossings'] for r in rows),'rows':rows,'scope':'Evaluated hardware vertices, triangle centers and edge midpoints against the outer coat plus explicit triangle crossings against both sides of the final solidified coat in 27 poses; not continuous or coplanar collision certification.'}
    (OUT/f'{sex}-pocket-{"diagnostic" if diagnostic else "validation"}.json').write_text(json.dumps(result,indent=2)+'\n')
    print(sex,json.dumps({k:v for k,v in result.items() if k!='rows'}),flush=True)
    if not diagnostic:assert result['penetrationsOver01mm']==0 and result['nonCoplanarCoatCrossings']==0
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default='runtime');p.add_argument('--diagnostic',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for s in ['male','female']:run(s,a.source,a.diagnostic)
