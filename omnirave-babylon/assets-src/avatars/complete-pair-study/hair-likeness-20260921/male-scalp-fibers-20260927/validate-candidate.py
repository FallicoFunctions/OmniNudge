"""Check that the scalp finish changed no mesh, skin, UV, rig or outfit data."""
import hashlib,json,sys
from pathlib import Path
import bpy,numpy as np
sys.path.insert(0,str(Path.cwd()/'scripts/launch-body-proof'))
from refine_reference_hair import PASS
from refine_complete_foil_finish import geometry_contract

folder=PASS/'male-scalp-fibers-20260927'
def state():
    objects={o.name:geometry_contract(o) for o in bpy.context.scene.objects if o.type=='MESH'}
    rig=bpy.data.objects['AvatarSkeleton']
    bones={b.name:(tuple(b.head_local),tuple(b.tail_local),tuple(tuple(r) for r in b.matrix_local)) for b in rig.data.bones}
    animation=[(a.name,tuple(a.frame_range)) for a in bpy.data.actions]
    cap=bpy.data.objects['Complete scalp'];mat=cap.data.materials[0]
    im=next(n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE')
    return objects,bones,animation,mat,im

bpy.ops.wm.open_mainfile(filepath=str(folder/'before/male-hair-refined.blend'))
before_objects,before_bones,before_animation,before_mat,before_im=state()
before_image_size=tuple(before_im.size[:])
before_pixels=np.empty(len(before_im.pixels),dtype=np.float32);before_im.pixels.foreach_get(before_pixels)
bpy.ops.wm.open_mainfile(filepath=str(PASS/'male-hair-refined.blend'))
after_objects,after_bones,after_animation,after_mat,after_im=state()
after_pixels=np.empty(len(after_im.pixels),dtype=np.float32);after_im.pixels.foreach_get(after_pixels)
assert before_objects==after_objects
assert before_bones==after_bones
assert before_animation==after_animation
assert before_image_size==tuple(after_im.size[:])
assert np.array_equal(before_pixels.reshape(-1,4)[:,3],after_pixels.reshape(-1,4)[:,3])
assert np.any(before_pixels.reshape(-1,4)[:,:3]!=after_pixels.reshape(-1,4)[:,:3])
assert after_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value==1
assert abs(after_mat.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value-.02)<1e-7
old=json.loads((folder/'before/male-vertex-mapping.json').read_text())
new=json.loads((PASS/'male-vertex-mapping.json').read_text())
assert old==new
result={'unchangedMeshes':len(before_objects),'bones':len(before_bones),'actions':len(before_animation),
        'geometryUvWeightsMorphsColorsAndRigExact':True,'textureAlphaExact':True,
        'textureRgbChangedPixels':int(np.count_nonzero(np.any(before_pixels.reshape(-1,4)[:,:3]!=after_pixels.reshape(-1,4)[:,:3],axis=1)))}
(folder/'native-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print('MALE_SCALP_NATIVE_CHECKS',result,flush=True)
