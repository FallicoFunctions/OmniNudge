import bpy,sys,json,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_female_face_contour import warp,SPEC
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'midface-blend-pass'
bpy.ops.wm.open_mainfile(filepath=str(p/'before/female-runtime.blend'))
body=bpy.data.objects['AvatarBody'];v=array(body);body.data.calc_loop_triangles();ids=np.array([t.vertices[:] for t in body.data.loop_triangles])
def normals(a):
 t=a[ids];c=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);l=np.linalg.norm(c,axis=1);return c/np.maximum(l[:,None],1e-15),l
previous=warp(v,json.loads((d/'before/female-native-validation.json').read_text())['faceContour']['spec']);n0,a0=normals(previous);ok=a0>1e-10;rows=[]
for recess,fullness in [(.0018,.0015),(.0015,.0012),(.0022,.0018)]:
 s=dict(SPEC,bridgeRecess=recess,innerCheekFullness=fullness);q=warp(v,s);n1,a1=normals(q);i=np.argmin(np.where(ok,a1/np.maximum(a0,1e-15),10))
 rows.append({'bridgeRecess':recess,'innerCheekFullness':fullness,'revisionDot':float((n0*n1).sum(1)[ok].min()),'revisionArea':float((a1[ok]/a0[ok]).min()),'maxRevisionMm':float(np.linalg.norm(q-previous,axis=1).max()*1000),'limitingFaceCenter':v[ids[i]].mean(0).tolist()})
print('PROBES',json.dumps(rows),flush=True)
