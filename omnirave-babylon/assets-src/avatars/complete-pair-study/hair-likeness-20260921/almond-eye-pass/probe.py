import bpy,sys,json,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_female_face_contour import warp,SPEC
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'almond-eye-pass'
bpy.ops.wm.open_mainfile(filepath=str(p/'before/female-runtime.blend'))
body=bpy.data.objects['AvatarBody'];v=array(body);body.data.calc_loop_triangles();ids=np.array([t.vertices[:] for t in body.data.loop_triangles])
def normals(a):
 t=a[ids];c=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);l=np.linalg.norm(c,axis=1);return c/np.maximum(l[:,None],1e-15),l
previous=warp(v,json.loads((d/'before/female-native-validation.json').read_text())['faceContour']['spec']);n0,a0=normals(previous);ok=a0>1e-10;rows=[]
keys={k.name:np.array([p.co[:] for p in k.data]) for k in body.data.shape_keys.key_blocks}
poses={'half-blink':{'Expression_BlinkLeft':.5,'Expression_BlinkRight':.5},'closed-curious':{'Expression_BlinkLeft':1,'Expression_BlinkRight':1,'Expression_BrowLift':.8},'smile':{'Expression_Smile':.85,'Expression_BrowLift':.15},'closed-smile':{'Expression_Smile':1,'Expression_BlinkLeft':1,'Expression_BlinkRight':1}}
for compression in [.06,.09,.12]:
 s=dict(SPEC,almondCompress=compression);q=warp(v,s);n1,a1=normals(q);posed={}
 for label,values in poses.items():
  old=v.copy();new=q.copy()
  for name,value in values.items():
   scale=s['smileScale'] if name=='Expression_Smile' else 1
   old+=(keys[name]-v)*value*scale;new+=(warp(keys[name],s)-q)*value*scale
  posed[label]=float(np.linalg.norm(new-warp(old,s),axis=1).max()*1000)
 rows.append({'almondCompression':compression,'revisionDot':float((n0*n1).sum(1)[ok].min()),'revisionArea':float((a1[ok]/a0[ok]).min()),'maxRevisionMm':float(np.linalg.norm(q-previous,axis=1).max()*1000),'combinedFieldErrorMm':posed})
print('PROBES',json.dumps(rows),flush=True)
