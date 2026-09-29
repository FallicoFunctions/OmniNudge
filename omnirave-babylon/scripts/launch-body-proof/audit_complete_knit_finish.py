"""Check portable knit masks and the covered belt in sampled native poses."""
import argparse,json,sys
from collections import Counter
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
import audit_rigged_jacket_sleeves as A


def smoother(x):
    x=np.clip(x,0,1);return x*x*x*(x*(x*6-15)+10)


def sample_image(image,uv):
    width,height=image.size;pixels=np.empty(width*height*4,np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4)
    coords=uv*np.array([width,height])-.5;base=np.floor(coords).astype(int);fraction=coords-base
    result=np.zeros((len(uv),4))
    for x in [0,1]:
        for y in [0,1]:
            weights=(fraction[:,0] if x else 1-fraction[:,0])*(fraction[:,1] if y else 1-fraction[:,1])
            result+=pixels[np.clip(base[:,1]+y,0,height-1),np.clip(base[:,0]+x,0,width-1)]*weights[:,None]
    return result


def masks(coat,sex):
    mat=coat.data.materials[0];bs=mat.node_tree.nodes['Principled BSDF'];image=bs.inputs['Roughness'].links[0].from_node.image
    assert image.colorspace_settings.name=='Non-Color'
    node=bs.inputs['Roughness'].links[0].from_node;uvname=node.inputs['Vector'].links[0].from_node.uv_map
    rest=np.array([a.vector[:] for a in coat.data.attributes['TailorRest'].data]);faces=np.array([f.vertices[:] for f in coat.data.polygons]);uv=np.array([a.uv[:] for a in coat.data.uv_layers[uvname].data]).reshape(-1,3,2)
    bary=np.array([[1/3]*3,[.8,.1,.1],[.1,.8,.1],[.1,.1,.8]])
    points=np.einsum('sk,fkj->fsj',bary,rest[faces]).reshape(-1,3);texuv=np.einsum('sk,fkj->fsj',bary,uv).reshape(-1,2)
    hem_edge=1.05 if sex=='male' else 1.027;cuff_edge=.691 if sex=='male' else .707
    hem=1-smoother((points[:,2]-hem_edge+.0006)/.0012);cuff=smoother((np.abs(points[:,0])-cuff_edge+.0006)/.0012);mask=np.maximum(hem,cuff)
    if sex=='male':mask=np.maximum(mask,np.repeat([a.value for a in coat.data.attributes['TailorCollar'].data],4))
    settings=json.loads((OUT/'visual-reference-pass-20260911/surface-parameters.json').read_text())[sex] if mat.get('launchReferenceSurfaceFinish') else None
    expected=(settings['jacketRoughness'] if settings else .235 if sex=='male' else .23)*(1-mask)+.68*mask
    actual=sample_image(image,texuv)[:,0];error=np.abs(expected-actual)
    interior=(np.abs(points[:,2]-hem_edge)>.002)&(np.abs(np.abs(points[:,0])-cuff_edge)>.002)
    # The collar's per-face seam and tiny UV slivers are reported separately;
    # cuff/hem interior checks do not hide failures inside either fabric.
    interior &= points[:,2]<1.48
    area=np.abs(np.cross(uv[:,1]-uv[:,0],uv[:,2]-uv[:,0]))*.5*image.size[0]*image.size[1]
    interior &= np.repeat(area>=4,4)
    assert interior.sum()>50000 and np.sum(interior&(mask>.99))>500 and np.sum(interior&(mask<.01))>500
    report={'samples':len(error),'interiorSamples':int(interior.sum()),'interiorMaximumRoughnessError':float(error[interior].max()),'interiorErrorsOver008':int((error[interior]>.08).sum()),'allMaximumRoughnessError':float(error.max()),'allErrorsOver008':int((error>.08).sum()),'roughnessImage':image.name,'linearRoughness':True,'roughnessRange':[float(actual.min()),float(actual.max())]}
    if sex=='female':
        assert mat['launchFilmMask'];film=bpy.data.images[Path(mat['launchFilmTexture']).stem];sampled=sample_image(film,texuv)[:,0]
        report['filmInteriorMaximumError']=float(np.abs(sampled[interior]-(1-mask[interior])).max())
        report['filmInteriorErrorsOver02']=int((np.abs(sampled[interior]-(1-mask[interior]))>.2).sum())
    return report


def belt_coverage(scene,rig):
    ob=bpy.data.objects['Launch cargo belt'];rows=[];coat=bpy.data.objects['Structured armhole jacket']
    rest=np.array([a.vector[:] for a in coat.data.attributes['TailorRest'].data]);counts=Counter(tuple(sorted(e)) for f in coat.data.polygons for e in f.edge_keys)
    hem=np.array([e for e,n in counts.items() if n==1 and np.max(rest[list(e),2])<1.016]);assert len(hem)>20
    for clip in ['idle','walk','run']:
        rig.animation_data.action=bpy.data.actions[clip]
        for frame in np.linspace(*rig.animation_data.action.frame_range,9):
            A.sample(scene,float(frame));cp,cf=A.H.geometry(bpy.data.objects['Structured armhole jacket']);cp=np.asarray(cp);cf=np.asarray(cf);tri=cp[cf];normal=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
            front=cf[normal[:,1]<0];tree=BVHTree.FromPolygons(cp.tolist(),front.tolist(),all_triangles=True)
            p,f=A.H.geometry(ob);p=np.asarray(p);f=np.asarray(f);tri=p[f]
            samples=np.concatenate([p,tri.mean(1),(tri[:,0]+tri[:,1])*.5,(tri[:,1]+tri[:,2])*.5,(tri[:,2]+tri[:,0])*.5])
            points=samples[(np.abs(samples[:,0])>.098)&(np.abs(samples[:,0])<.185)&(samples[:,1]<.015)]
            hem_segments=cp[hem];hem_segments=hem_segments[hem_segments[:,:,1].mean(1)<.025]
            # A belt can become visible below an open hem as the hips bend.
            # Exclude those samples using the independently measured hem
            # boundary, rather than treating the jacket's rear wall as a
            # front panel that should cover them.
            eligible=[];below_hem=0;outside_width=0
            for point in points:
                crossings=[]
                for segment in hem_segments:
                    dx=segment[1,0]-segment[0,0]
                    if abs(dx)<1e-9:continue
                    t=(point[0]-segment[0,0])/dx
                    if 0<=t<=1:crossings.append(segment[0]*(1-t)+segment[1]*t)
                if not crossings:outside_width+=1;continue
                boundary=min(crossings,key=lambda q:q[1])
                if point[2]<boundary[2]+.001:below_hem+=1;continue
                eligible.append(point)
            distances=[];worst=None
            for point in eligible:
                hit,_,_,_=tree.ray_cast(Vector((point[0],-1,point[2])),Vector((0,1,0)))
                if hit is not None:
                    distance=point[1]-hit.y;distances.append(distance)
                    if worst is None or distance<worst['distance']:worst={'distance':float(distance),'point':point.tolist(),'hit':list(hit)}
            assert distances
            rows.append({'clip':clip,'frame':float(frame),'candidateSamples':len(points),'belowFrontHemSamples':below_hem,'outsideHemWidthSamples':outside_width,'missingSurfaceSamples':len(eligible)-len(distances),'coveredSamples':len(distances),'minimumCoverageMm':float(min(distances)*1000),'outsideOver01mm':int(sum(d<-.0001 for d in distances)),'worst':worst})
    return {'poses':27,'minimumCoverageMm':min(r['minimumCoverageMm'] for r in rows),'outsideOver01mm':sum(r['outsideOver01mm'] for r in rows),'rows':rows}


def run(sex,source):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{source}.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];coat=bpy.data.objects['Structured armhole jacket']
    assert coat['knitFinish']=='continuous-rest-mask-v1' and len(coat.data.materials)==1
    result={'source':source,'masks':masks(coat,sex)}
    if sex=='male':result['coveredBelt']=belt_coverage(scene,rig)
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default='runtime');p.add_argument('--diagnostic',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    result={s:run(s,a.source) for s in ['male','female']}
    (OUT/('knit-diagnostic.json' if a.diagnostic else 'knit-validation.json')).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({s:{k:v if k!='coveredBelt' else {x:y for x,y in v.items() if x!='rows'} for k,v in d.items()} for s,d in result.items()}),flush=True)
    if not a.diagnostic:
        for s,d in result.items():assert d['masks']['interiorErrorsOver008']==0,(s,d['masks'])
        assert result['female']['masks']['filmInteriorErrorsOver02']==0
        assert result['male']['coveredBelt']['outsideOver01mm']==0
        assert all(r['outsideHemWidthSamples']==0 and r['missingSurfaceSamples']==0 for r in result['male']['coveredBelt']['rows'])
