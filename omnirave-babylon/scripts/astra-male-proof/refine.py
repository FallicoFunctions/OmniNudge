"""Apply one local measured face correction to a preserved checkpoint.
Connection map: head/neck retain shared topology. Eyelids and facial features use
the same bounded displacement field; source skinning is preserved provisionally.
"""
import bpy,math,json,sys
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-src/avatars/astra-male-proof'
name=sys.argv[sys.argv.index('--')+1]
if name not in {'pose04','fit05'}:raise ValueError(name)
bpy.ops.wm.open_mainfile(filepath=str(OUT/'study04.blend'))
fit=json.loads((OUT/'landmarks/fit05-deformation.json').read_text())
if name == 'fit05':
    for object_name,data in fit['objects'].items():
        ob=bpy.data.objects[object_name]; inverse=ob.matrix_world.inverted().to_3x3()
        if ob.data.shape_keys:
            key=ob.shape_key_add(name='Measured_reference_fit_05',from_mix=True)
            for k in list(ob.data.shape_keys.key_blocks)[1:]:k.value=0
            key.value=1;vertices=key.data
        else:vertices=ob.data.vertices
        assert len(vertices)==len(data['delta_world'])
        for v,delta in zip(vertices,data['delta_world']):v.co+=inverse@Vector(delta)
scene=bpy.context.scene;camera=scene.camera
# Match the reference camera separately from sculpting, retaining an unmodified
# pose-only control. No image pixels are projected onto the model.
p=fit['pose'];yaw=p['yaw'];pitch=p['pitch'];roll=p['roll'];scale=p['pixels_per_meter']
right=Vector((math.cos(yaw),math.sin(yaw),0))
up=Vector((-math.sin(pitch)*math.sin(yaw),math.sin(pitch)*math.cos(yaw),math.cos(pitch)))
right2=right*math.cos(roll)+up*math.sin(roll)
down2=right*math.sin(roll)-up*math.cos(roll)
outward=right2.cross(-down2).normalized()
target=Vector(p['center'])+right2*((513-p['translation'][0])/scale)+down2*((184-p['translation'][1])/scale)
camera.matrix_world=Matrix((right2,-down2,outward)).transposed().to_4x4()
camera.location=target+outward*2
camera.data.ortho_scale=252/scale
scene.render.resolution_x=768;scene.render.resolution_y=896;scene.cycles.samples=48
scene.render.filepath=str(OUT/'renders'/f'{name}-reference-angle.png')
bpy.context.view_layer.update();bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{name}.blend'))
print('MEASURED_PASS_COMPLETE',name)
