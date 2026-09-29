"""Local likeness experiment; never writes production avatar assets."""
# Connection map: the existing body supplies continuous head/neck/shoulder topology.
# Eyes sit inside the existing sockets; eyebrows/lashes retain their fitted surface.
# Hair roots will overlap the scalp, and all hair moves with the head bone.
# Garments retain the source skeleton; experimental meshes are isolated from gameplay.
from pathlib import Path
import sys, json, math, hashlib
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets-src/avatars/astra-male-proof'
PASS = sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'baseline'
if PASS not in {'baseline','study01','study02','study03','study04'}:
    raise ValueError('Unknown experiment checkpoint')
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'renders').mkdir(exist_ok=True)
SOURCE = ROOT / 'assets-src/avatars/modular-v1/avatar-modular-v1.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
for o in bpy.data.objects:
    o.animation_data_clear()
    if o.type == 'ARMATURE':
        for p in o.pose.bones: p.matrix_basis.identity()
    if o.type == 'MESH' and o.data.shape_keys:
        o.data.shape_keys.animation_data_clear()
        for k in o.data.shape_keys.key_blocks:
            if k.name != 'Basis': k.value = float(k.name == 'male')
selected = {'hair':'textured-crop','top':'graphic-tee','jacket':'bomber',
            'bottoms':'tech-joggers','shoes':'high-tops','accessories':'gold-hoops'}
for o in bpy.data.objects:
    if o.name.startswith('AvatarOption_'):
        slot, option = o.name[len('AvatarOption_'):].split('__')
        for c in o.children_recursive:
            c.hide_render = selected.get(slot) != option
            c.hide_set(c.hide_render)
bpy.context.view_layer.update()
body = bpy.data.objects['AvatarBody']
if PASS != 'baseline':
    sys.path.insert(0,str(Path(__file__).parent))
    import likeness
    likeness.apply(ROOT,OUT)
    if PASS in {'study03','study04'}:
        import haircards
        haircards.build(OUT)

def aim(o, target):
    o.rotation_euler = (Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

def light(name, xyz, energy, size, color=(1,1,1)):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size; data.color=color
    o=bpy.data.objects.new(name,data); scene.collection.objects.link(o); o.location=xyz; aim(o,(0,-.06,1.60))

for o in list(bpy.data.objects):
    if o.type in {'LIGHT','CAMERA'}: bpy.data.objects.remove(o,do_unlink=True)
light('Proof_Key',(-.8,-1.4,2.3),90,1.0)
light('Proof_Fill',(.9,-.8,1.9),35,1.1)
light('Proof_Rim',(.6,.7,2.1),100,.75)
world=bpy.data.worlds.new('ProofWorld'); world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.075,.085,.10,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.3; scene.world=world
camdata=bpy.data.cameras.new('ProofCamera'); camdata.type='ORTHO'; camdata.ortho_scale=.40
camera=bpy.data.objects.new('ProofCamera',camdata); scene.collection.objects.link(camera); scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.samples=32; scene.cycles.use_denoising=True
scene.render.resolution_x=768; scene.render.resolution_y=896; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'; scene.view_settings.exposure=-.35
scene.render.film_transparent=False
for o in bpy.data.objects:
    if o.type=='MESH':
        for p in o.data.polygons: p.use_smooth=True

views={'front':((0,-2,1.65),(0,-.05,1.635)),
       'three-quarter':((.85,-2,1.69),(0,-.05,1.635)),
       'profile':((2,-.05,1.65),(0,-.05,1.635)),
       'reference-angle':((.9,-2,1.57),(0,-.05,1.635))}
OUT.mkdir(parents=True,exist_ok=True)
for name,(position,target) in views.items():
    camera.location=position; aim(camera,target)
    scene.render.filepath=str(OUT/'renders'/f'{PASS}-{name}.png')
    bpy.ops.render.render(write_still=True)
camera.location=views['three-quarter'][0]; aim(camera,views['three-quarter'][1])
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{PASS}.blend'))
print('PROOF_COMPLETE',PASS)
