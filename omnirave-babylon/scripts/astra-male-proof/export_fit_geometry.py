"""Export evaluated face and original render camera for local landmark fitting."""
import bpy,json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets-src/avatars/astra-male-proof'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'study04.blend'))
cam=bpy.context.scene.camera
cam.location=(.9,-2,1.57)
cam.rotation_euler=(Vector((0,-.05,1.635))-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update();scene=bpy.context.scene
body=bpy.data.objects['AvatarBody'];o=body.evaluated_get(bpy.context.evaluated_depsgraph_get());me=o.to_mesh()
points=[];uv=[]
for v in me.vertices:
    p=body.matrix_world@v.co
    points.append(list(p));q=world_to_camera_view(scene,cam,p);uv.append([q.x*768,(1-q.y)*896])
result={'positions':points,'pixels':uv,'faces':[list(p.vertices) for p in me.polygons],
        'camera_matrix':[list(r) for r in cam.matrix_world], 'scale':cam.data.ortho_scale,
        'width':768,'height':896}
result['deform_objects']={}
for ob in bpy.data.objects:
    if ob.type!='MESH' or ob.hide_render:continue
    if not (ob.name=='AvatarBody' or ob.name.startswith(('AvatarEye','AvatarIris','AvatarPupil'))):continue
    coords=[v.co.copy() for v in ob.data.vertices]
    if ob.data.shape_keys:
        keys=ob.data.shape_keys.key_blocks; basis=keys[0]
        coords=[v.co.copy() for v in basis.data]
        for k in list(keys)[1:]:
            for i in range(len(coords)):coords[i]+=(k.data[i].co-basis.data[i].co)*k.value
    result['deform_objects'][ob.name]={'positions':[list(ob.matrix_world@p) for p in coords]}
(OUT/'landmarks/study04-geometry.json').write_text(json.dumps(result))
print('Exported',len(points),'evaluated vertices')
