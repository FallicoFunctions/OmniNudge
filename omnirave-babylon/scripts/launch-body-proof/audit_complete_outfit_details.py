"""Check reference-detail attachments and body contact on actual native sources."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import Surface,skin_weights
from build_rigged_jacket_hardware import barycentric
import audit_rigged_jacket_sleeves as A

p=argparse.ArgumentParser();p.add_argument('--source',default='runtime');p.add_argument('--diagnostic',action='store_true')
p.add_argument('--sex',choices=['male','female'])
args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
assert args.sex is None or args.diagnostic,'Single-character probes must use --diagnostic.'
directions=[Vector(d).normalized() for d in [(1,.137,.311),(-1,.173,.419),(.237,1,.181),(.371,-1,.257),(.139,.273,1),(.283,.119,-1),(-.327,.713,.619)]]

def clearance(tree,point):
 """Resolve nearest-edge sign ambiguity using independent surface crossings.

 An interior point's first crossing exits the surface. An exterior point's
 first crossing enters it (or misses). A nearest triangle's plane alone can
 classify exterior points at concave edges as deeply inside the body.
 """
 point=Vector(point);hit,n,_,distance=tree.find_nearest(point)
 plane=(point-hit).dot(n)
 if plane>=0:return distance,False
 exits=0
 for direction in directions:
  _,normal,_,_=tree.ray_cast(point,direction)
  exits+=normal is not None and normal.dot(direction)>0
 inside=exits>=4
 return (-distance if inside else distance),not inside

report={}
for sex in ([args.sex] if args.sex else ['male','female']):
 bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-{args.source}.blend'))
 scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];body=bpy.data.objects['AvatarBody']
 rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
 names=list(rig.data.bones.keys());attachments={};surfaces={}
 for detail in [o for o in scene.objects if o.type=='MESH' and o.get('outfitDetailCarrier')]:
  carrier=detail['outfitDetailCarrier']
  if carrier not in surfaces:surfaces[carrier]=Surface(rig,bpy.data.objects[carrier])
  surface=surfaces[carrier];points=array(detail,True);indices=[];coordinates=[];offsets=[]
  for q in points:
   hit,n,index,d=surface.tree.find_nearest(Vector(q));ids=surface.faces[index]
   bc=barycentric(np.array(hit),surface.array[ids]);indices.append(ids);coordinates.append(bc);offsets.append(q-bc@surface.array[ids])
  weights=skin_weights(detail,names);skin=np.einsum('vg,gij->vij',weights,surface.mats)
  offsets=np.linalg.solve(skin[:,:3,:3],np.asarray(offsets)[...,None])[:,:,0]
  assert np.allclose(weights.sum(1),1,atol=1e-5)
  attachments[detail.name]=(surface.body,detail,np.array(indices),np.array(coordinates),offsets,weights)
 rows=[]
 for clip in ['idle','walk','run']:
  rig.animation_data.action=bpy.data.actions[clip]
  for frame in np.linspace(*rig.animation_data.action.frame_range,9):
   A.sample(scene,float(frame));bp,bf=A.H.geometry(body);bodytree=BVHTree.FromPolygons(bp,bf,all_triangles=True)
   jp,jf=A.H.geometry(bpy.data.objects['Structured armhole jacket']);coattree=BVHTree.FromPolygons(jp,jf,all_triangles=True)
   mats=np.asarray([rig.matrix_world@rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted()@rig.matrix_world.inverted() for n in names])
   for carrier,detail,ids,bc,offset,weights in attachments.values():
    q=array(detail,True);cp=array(carrier,True);skin=np.einsum('vg,gij->vij',weights,mats)
    expected=np.einsum('vi,vij->vj',bc,cp[ids])+np.einsum('vij,vj->vi',skin[:,:3,:3],offset)
    drift=np.linalg.norm(q-expected,axis=1);distances=[];ambiguous=0
    if args.diagnostic and drift.max()>.001:print('ATTACHMENT_PEAK',sex,detail.name,clip,float(frame),int(drift.argmax()),q[drift.argmax()].tolist(),ids[drift.argmax()].tolist(),flush=True)
    for point in q:
     distance,corrected=clearance(bodytree,point);distances.append(distance);ambiguous+=corrected
    distances=np.array(distances)
    row={'clip':clip,'frame':float(frame),'object':detail.name,'maximumAttachmentDriftMm':float(drift.max()*1000),'bodyPenetrationsOver2mm':int((distances<-.002).sum()),'minimumBodyClearanceMm':float(distances.min()*1000),'exteriorNearestPlaneAmbiguities':ambiguous}
    if detail.name=='Launch belt fittings and linked chains':
     covered=[]
     for point in q[(q[:,1]>.025)&(np.abs(q[:,0])<.16)]:
      hit,_,_,_=coattree.ray_cast(Vector((point[0],2,point[2])),Vector((0,-1,0)))
      assert hit is not None,('uncovered rear belt',clip,frame,point)
      covered.append(hit.y-point[1])
     row['rearBeltOutsideCoatOver05mm']=int(sum(d<-.0005 for d in covered))
     row['minimumRearBeltCoatCoverageMm']=float(min(covered)*1000)
     if not args.diagnostic:assert row['rearBeltOutsideCoatOver05mm']==0,row
    rows.append(row)
    if not args.diagnostic:
     assert row['maximumAttachmentDriftMm']<1, row
     assert row['bodyPenetrationsOver2mm']==0,row
 report[sex]={'source':args.source,'objects':len(attachments),'samplesPerObject':27,'maximumAttachmentDriftMm':max(r['maximumAttachmentDriftMm'] for r in rows),'bodyPenetrationsOver2mm':sum(r['bodyPenetrationsOver2mm'] for r in rows),'minimumBodyClearanceMm':min(r['minimumBodyClearanceMm'] for r in rows),'rows':rows}
 print(sex,{k:v for k,v in report[sex].items() if k!='rows'},flush=True)
(OUT/(f'outfit-motion-{args.sex}-diagnostic.json' if args.sex else 'outfit-motion-diagnostic.json' if args.diagnostic else 'outfit-motion-validation.json')).write_text(json.dumps(report,indent=2)+'\n')
