import bpy,sys,json,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_female_face_contour import warp,SPEC
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'lip-volume-pass'
bpy.ops.wm.open_mainfile(filepath=str(p/'before/female-runtime.blend'))
body=bpy.data.objects['AvatarBody'];v=array(body);body.data.calc_loop_triangles();ids=np.array([t.vertices[:] for t in body.data.loop_triangles])
def normals(a):
 t=a[ids];c=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);l=np.linalg.norm(c,axis=1);return c/np.maximum(l[:,None],1e-15),l
previous=warp(v,json.loads((d/'before/female-native-validation.json').read_text())['faceContour']['spec']);n0,a0=normals(previous);ok=a0>1e-10;rows=[]
for compress,corner,dip,peak,upper,lower in [(.27,.0009,.00110,.00050,.0005,-.0005),(.29,.0008,.00100,.00045,.0006,-.0003),(.25,.0010,.00115,.00055,.0005,-.0006)]:
 s=dict(SPEC,mouthCompress=compress,cornerLift=corner,cupidDip=dip,cupidPeak=peak,upperLipBalanceRecess=upper,lowerLipBalanceRecess=lower);q=warp(v,s);n1,a1=normals(q);i=np.argmin(np.where(ok,a1/np.maximum(a0,1e-15),10))
 rows.append({'mouthCompress':compress,'cornerLift':corner,'cupidDip':dip,'cupidPeak':peak,'upperLipBalanceRecess':upper,'lowerLipBalanceRecess':lower,'revisionDot':float((n0*n1).sum(1)[ok].min()),'revisionArea':float((a1[ok]/a0[ok]).min()),'maxRevisionMm':float(np.linalg.norm(q-previous,axis=1).max()*1000),'limitingFaceCenter':v[ids[i]].mean(0).tolist()})
print('PROBES',json.dumps(rows),flush=True)
