"""Check all main opening tracks and slider against the rendered coat in 27 poses."""
import argparse,json,sys,math
from collections import Counter
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT
from audit_complete_jacket_shape import segment_crosses_triangle
import audit_rigged_jacket_sleeves as A

def winding_inside(point,triangles):
    v=triangles-np.asarray(point,dtype=np.float64);a,b,c=v[:,0],v[:,1],v[:,2]
    la=np.linalg.norm(a,axis=1);lb=np.linalg.norm(b,axis=1);lc=np.linalg.norm(c,axis=1)
    numerator=np.einsum('ij,ij->i',a,np.cross(b,c))
    denominator=la*lb*lc+np.einsum('ij,ij->i',a,b)*lc+np.einsum('ij,ij->i',b,c)*la+np.einsum('ij,ij->i',c,a)*lb
    turns=float(np.arctan2(numerator,denominator).sum()/(2*math.pi))
    assert abs(turns-round(turns))<1e-4, ('Unresolved closed-shell winding',turns)
    return abs(turns)>.5

def component_representatives(ob):
    parent=list(range(len(ob.data.vertices)))
    def root(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    for face in ob.data.polygons:
        a,b,c=map(root,face.vertices);parent[b]=a;parent[c]=a
    reps=sorted(set(root(i) for i in range(len(parent))))
    assert len(reps)==len(json.loads(ob['attachmentComponents'])), (ob.name,'Component coverage changed')
    return reps

def run(sex,source,diagnostic=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{source}.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];coat=bpy.data.objects['Structured armhole jacket']
    objects=[o for o in scene.objects if o.type=='MESH' and o.get('mainOpeningConstruction')=='separated-tracks-v1'];assert len(objects)==2
    assert all(o.get('mainOpeningConstruction')=='separated-tracks-v1' for o in objects)
    representatives={ob.name:component_representatives(ob) for ob in objects}
    for ob in objects:
        edges=Counter(tuple(sorted(edge)) for face in ob.data.polygons for edge in face.edge_keys)
        assert edges and all(count==2 for count in edges.values()), (ob.name,'Hardware has open or nonmanifold edges')
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    rest,faces=A.H.geometry(coat);rest=np.asarray(rest);faces=np.asarray(faces);count=len(coat.data.vertices)
    outer=faces[np.max(faces,axis=1)<count];tri=rest[outer]
    normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
    front_faces=outer[(normals[:,1]<0)&(tri[:,:,1].mean(1)<-.04)]
    center=tri.mean(1);area=np.linalg.norm(normals,axis=1)
    eligible=np.flatnonzero((normals[:,1]<0)&(center[:,1]<-.08)&(np.abs(center[:,0])<.2)&(center[:,2]>1.1)&(center[:,2]<1.4))
    control_faces=outer[eligible[np.argsort(area[eligible])[-5:]]];assert len(control_faces)==5
    controls=0;rows=[];connections=[]
    for clip in ['idle','walk','run']:
        rig.animation_data.action=bpy.data.actions[clip]
        for frame in np.linspace(*rig.animation_data.action.frame_range,9):
            A.sample(scene,float(frame));p,f=A.H.geometry(coat)
            count=len(coat.data.vertices);outer=[face for face in f if max(face)<count]
            assert len(outer)==len(coat.data.polygons), 'Solidify outer-surface indexing changed'
            front_tree=BVHTree.FromPolygons(p,front_faces.tolist(),all_triangles=True)
            closed_tree=BVHTree.FromPolygons(p,f,all_triangles=True);coat_points=np.asarray(p);coat_faces=np.asarray(f);closed_triangles=coat_points[coat_faces].astype(np.float64)
            for control_face in control_faces:
                inside=(coat_points[control_face].mean(0)+coat_points[control_face+count].mean(0))*.5
                outside=coat_points[control_face].mean(0).copy();outside[1]=coat_points[:,1].min()-.02
                assert winding_inside(inside,closed_triangles) and not winding_inside(outside,closed_triangles)
                controls+=2
            track=bpy.data.objects['Jacket detail - main zipper tracks'];pull=bpy.data.objects['Jacket detail - main zipper pull']
            tv,tf=A.H.geometry(track);pv,pf=A.H.geometry(pull)
            # Use slider faces only: a pull/tape contact cannot substitute for
            # the slider's actual connection to its tooth track.
            components=json.loads(pull['attachmentComponents']);pf=pf[:components[1]['first_face']]
            tt=BVHTree.FromPolygons(tv,tf,all_triangles=True);pt=BVHTree.FromPolygons(pv,pf,all_triangles=True)
            tv=np.asarray(tv);pv=np.asarray(pv);tf=np.asarray(tf);pf=np.asarray(pf);joined=0
            for a,b in tt.overlap(pt):
                ta=tv[tf[a]];tb=pv[pf[b]]
                if any(segment_crosses_triangle(t[i],t[(i+1)%3],other) for t,other in [(ta,tb),(tb,ta)] for i in range(3)):joined+=1
            connections.append({'clip':clip,'frame':float(frame),'sliderTrackContactTriangles':joined})
            for ob in objects:
                q,g=A.H.geometry(ob);q=np.asarray(q);g=np.asarray(g);tri=q[g]
                samples=np.concatenate([q,tri.mean(1),(tri[:,0]+tri[:,1])/2,(tri[:,1]+tri[:,2])/2,(tri[:,2]+tri[:,0])/2])
                hardware_tree=BVHTree.FromPolygons(q.tolist(),g.tolist(),all_triangles=True);crossings=0
                for a,b in closed_tree.overlap(hardware_tree):
                    ta=coat_points[coat_faces[a]];tb=q[g[b]]
                    if any(segment_crosses_triangle(t[i],t[(i+1)%3],other) for t,other in [(ta,tb),(tb,ta)] for i in range(3)):crossings+=1
                # Nearest normals are unreliable at an open edge. Check the
                # visible front where it projects onto cloth. One winding
                # query per connected hardware component plus the exhaustive
                # triangle-crossing test covers wholly embedded components
                # and components entering/exiting the shell. This also checks
                # the deliberate overhang without calling empty space cloth.
                distances=[];overhangs=0
                for point in samples:
                    hit,_,_,_=front_tree.ray_cast(Vector((point[0],-2,point[2])),Vector((0,1,0)))
                    if hit is None:overhangs+=1
                    else:distances.append(hit.y-float(point[1]))
                inside=[]
                for i in representatives[ob.name]:
                    if winding_inside(q[i],closed_triangles):inside.append(q[i].tolist())
                d=np.array(distances);assert len(d)>len(samples)*(.5 if ob==track else .1), ('Front carrier check is vacuous',ob.name,len(d),len(samples))
                row={'clip':clip,'frame':float(frame),'object':ob.name,'samples':len(samples),'overhangSamples':overhangs,'nonCoplanarCoatCrossings':crossings,'minimumFrontCoatClearanceMm':float(d.min()*1000),'samplesBehindFrontOver01mm':int((d<-.0001).sum()),'closedComponentsChecked':len(representatives[ob.name]),'insideClosedCoatComponents':len(inside)}
                if diagnostic and inside:row['insidePoints']=inside[:4]
                rows.append(row)
    result={'insideOutsideControls':controls,'sliderContact':connections,'minimumSliderTrackContacts':min(c['sliderTrackContactTriangles'] for c in connections),'source':source,'objects':len(objects),'posesPerObject':27,'closedManifoldMeshes':len(objects),'minimumFrontCoatClearanceMm':min(r['minimumFrontCoatClearanceMm'] for r in rows),'samplesBehindFrontOver01mm':sum(r['samplesBehindFrontOver01mm'] for r in rows),'closedComponentsPerPose':sum(len(v) for v in representatives.values()),'insideClosedCoatComponents':sum(r['insideClosedCoatComponents'] for r in rows),'nonCoplanarCoatCrossings':sum(r['nonCoplanarCoatCrossings'] for r in rows),'rows':rows,'scope':'Evaluated vertices, triangle centers and edge midpoints against the visible front coat where a projected carrier exists; float64 solid-angle winding at one vertex per connected closed hardware component including overhangs, with exhaustive triangle crossings detecting entry/exit; explicit non-coplanar crossings against both sides and rims of the solidified coat in 27 poses. Slider-to-track contact is checked in each pose. Not continuous or coplanar collision certification.'}
    (OUT/f'{sex}-opening-{"diagnostic" if diagnostic else "validation"}.json').write_text(json.dumps(result,indent=2)+'\n')
    print(sex,json.dumps({k:v for k,v in result.items() if k not in ['rows','sliderContact']}),flush=True)
    if not diagnostic:assert result['samplesBehindFrontOver01mm']==0 and result['insideClosedCoatComponents']==0 and result['nonCoplanarCoatCrossings']==0 and result['minimumSliderTrackContacts']>0
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default='runtime');p.add_argument('--diagnostic',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for s in ['male','female']:run(s,a.source,a.diagnostic)
