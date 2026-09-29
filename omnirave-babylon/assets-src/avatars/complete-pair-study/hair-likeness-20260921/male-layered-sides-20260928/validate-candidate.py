"""Validate new male side cards and preservation of the retained character."""
import json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from assemble_complete_pair import array
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from refine_reference_hair import PASS
from refine_male_side_strands import NAME,MATERIAL
from refine_male_loose_fringe import skin_gap
from audit_complete_expressions import POSES,set_pose
from validate_reference_hair import run as validate_motion

folder=PASS/'male-layered-sides-20260928'
bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
retained={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
old_mapping=json.loads((folder/'before/male-vertex-mapping.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
assert retained=={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH' and o.name!=NAME}
assert old_mapping==json.loads((PASS/'male-vertex-mapping.json').read_text())
ob=bpy.data.objects[NAME];rig=bpy.data.objects['AvatarSkeleton']
assert ob.get('avatarSlot')=='hair' and ob.get('launchCharacter')=='male'
assert len(ob.data.materials)==1 and ob.data.materials[0].name==MATERIAL
assert len(ob.modifiers)==1 and ob.modifiers[0].type=='ARMATURE' and ob.modifiers[0].object==rig
assert all(v.groups and len(v.groups)==1 and ob.vertex_groups[v.groups[0].group].name=='head' and abs(v.groups[0].weight-1)<1e-8 for v in ob.data.vertices)
p=array(ob);assert len(p)%24==0
cards=p.reshape(-1,12,2,3);width=np.linalg.norm(cards[:,:,1]-cards[:,:,0],axis=2)
assert np.isfinite(p).all() and width.max()<.003
direction=(cards[:,:,1]-cards[:,:,0])/width[:,:,None]
adjacent=(direction[:,1:]*direction[:,:-1]).sum(2)
assert adjacent.min()>.1,adjacent.min()
assert len(ob.data.polygons)==len(cards)*11
native=json.loads((PASS/'male-native-validation.json').read_text())
assert len(native['additions'])==1 and native['additions'][0]['name']==NAME
assert native['materials'][MATERIAL]['texture']=='male-reference-hair-fibers.png'
poses={**POSES,'hair-mixed-left':{'Secondary_HairSide':-1,'Secondary_HairBack':1},
       'hair-mixed-right':{'Secondary_HairSide':1,'Secondary_HairBack':-1}}
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];bpy.context.scene.frame_set(1)
clearance={}
for label,values in poses.items():
    set_pose(values)
    skin=Surface(rig,bpy.data.objects['AvatarBody']);scalp=Surface(rig,bpy.data.objects['Complete scalp'])
    posed=array(ob,True);roots=posed.reshape(-1,12,2,3)[:,0].mean(1)
    root_dist=[scalp.tree.find_nearest(Vector(v))[3] for v in roots]
    assert max(root_dist)<.0035,(label,max(root_dist))
    ids=np.arange(len(posed)) if label=='neutral' else np.unique(np.linspace(0,len(posed)-1,1200,dtype=int))
    gaps=[skin_gap(skin.tree,Vector(posed[i]))[0] for i in ids]
    assert min(gaps)>.0005,(label,min(gaps))
    clearance[label]={'sampledVertices':len(ids),'minSkinClearanceMm':float(min(gaps)*1000),
                      'maxRootCapDistanceMm':float(max(root_dist)*1000)}
set_pose({})
report={'retainedMeshesExact':len(retained),'cards':len(cards),'vertices':len(p),
        'headWeightsExact':True,'mappingExact':True,'maxRibbonWidthMm':float(width.max()*1000),
        'minAdjacentWidthDot':float(adjacent.min()),'poseChecks':clearance,
        'scope':'All new vertices in neutral and 1200 deterministic samples per other pose corner; finite samples do not prove continuous collision or hair-to-hair clearance.'}
(folder/'native-checks.json').write_text(json.dumps(report,indent=2)+'\n')
validate_motion('male',False)
print('MALE_LAYERED_SIDES_VALIDATED',json.dumps({k:v for k,v in report.items() if k!='poseChecks'}),flush=True)
