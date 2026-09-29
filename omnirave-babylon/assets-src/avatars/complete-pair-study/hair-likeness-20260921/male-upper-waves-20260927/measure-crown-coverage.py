import sys,json
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from complete_pair_geometry import Surface
from audit_complete_expressions import set_pose
folder=PASS/'male-upper-waves-20260927';report={}
regions={'original-center':(-.018,.018,-.063,-.025),'forward-separation':(-.018,.024,-.090,-.058),'combined':(-.018,.024,-.090,-.025)}
for label,path in [('before',folder/'before/male-hair-refined.blend'),('after',PASS/'male-hair-refined.blend')]:
 bpy.ops.wm.open_mainfile(filepath=str(path));rig=bpy.data.objects['AvatarSkeleton'];rig.data.pose_position='REST';set_pose({})
 cap=Surface(rig,bpy.data.objects['Complete scalp']);hair=Surface(rig,bpy.data.objects['Luxury retained swept groom']);report[label]={}
 for region,(x0,x1,y0,y1) in regions.items():
  cap_samples=0;covered=0;clearances=[]
  for x in np.linspace(x0,x1,80):
   for y in np.linspace(y0,y1,80):
    origin=Vector((x,y,2));direction=Vector((0,0,-1))
    support,_,_,_=cap.tree.ray_cast(origin,direction,.5)
    if support is None:continue
    cap_samples+=1;strand,_,_,_=hair.tree.ray_cast(origin,direction,.5)
    if strand is not None and strand.z>support.z+.0001:
     covered+=1;clearances.append((strand.z-support.z)*1000)
  report[label][region]={'boundsXYm':[x0,x1,y0,y1],'capSamples':cap_samples,'samplesWithHairGeometryAboveCap':covered,'fraction':covered/cap_samples,'minimumHairHeightAboveCapMm':min(clearances) if clearances else None}
  print(label,region,report[label][region],flush=True)
report['scope']='6400 vertical geometry rays per region in rest coordinates. Does not account for texture alpha; browser renders establish visible coverage.'
(folder/'crown-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
