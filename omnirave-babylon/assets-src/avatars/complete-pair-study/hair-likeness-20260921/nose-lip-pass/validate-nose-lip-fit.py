import bpy,sys,json,runpy,numpy as np
from pathlib import Path
r=Path.cwd();sys.path.insert(0,str(r/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from refine_complete_foil_finish import geometry_contract
p=r/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'nose-lip-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
before=array(bpy.data.objects['AvatarBody']).copy()
companions={n:geometry_contract(bpy.data.objects[n]) for n in ['AvatarEyebrows','AvatarEyelashes']}
bpy.ops.wm.open_mainfile(filepath=str(p/'female-hair-refined.blend'))
assert companions=={n:geometry_contract(bpy.data.objects[n]) for n in companions}
body=bpy.data.objects['AvatarBody'];after=array(body);body.data.calc_loop_triangles();ids=np.array([t.vertices[:] for t in body.data.loop_triangles])
def normal(v):
 t=v[ids];n=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);a=np.linalg.norm(n,axis=1)
 return n/np.maximum(a[:,None],1e-15),a
n0,a0=normal(before);n1,a1=normal(after);valid=a0>1e-10
dot=float(np.min((n0*n1).sum(1)[valid]));ratio=float(np.min(a1[valid]/a0[valid]));assert dot>.98 and ratio>.8,(dot,ratio)
protected=(before[:,2]>=1.598)|(before[:,2]<=1.47);assert np.array_equal(before[protected],after[protected])
record={'unchangedCompanionGeometryIncludingAllShapeKeys':list(companions),'minimumRevisionTriangleNormalDot':dot,'minimumRevisionTriangleAreaRatio':ratio,'protectedVertices':int(protected.sum()),'maximumRevisionDisplacementMm':float(np.linalg.norm(after-before,axis=1).max()*1000)}
(d/'native-revision-preservation.json').write_text(json.dumps(record,indent=2)+'\n');print('REVISION_PRESERVED',json.dumps(record),flush=True)
runpy.run_path(str(r/'scripts/launch-body-proof/validate_female_cascade.py'),run_name='__main__')
