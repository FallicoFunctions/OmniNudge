"""Author a small brunette cheek frame without altering the established hair.

Connection map:
  Six strand roots <-> forehead scalp under the right goggle rim: 3-5 mm clear
  of skin, held by the existing head bone (rigid influence 1.0).
  Strand middles <-> temple/outer cheek: each vertex 3 mm clear of skin.
  Free tips <-> outer cheek beside the cyan earring: no rigid joint, clear skin.
The card edges are connected by explicit faces; no rotated primitives are used.
"""
import bpy
import hashlib
import json
import math
import numpy as np
import sys
from pathlib import Path
from mathutils import Vector

root = Path.cwd()
sys.path.insert(0, str(root / 'scripts/launch-body-proof'))
from assemble_complete_pair import array, review
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from audit_complete_expressions import set_pose

study = root / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
pass_dir = study / 'cheek-frame-pass'
bpy.ops.wm.open_mainfile(filepath=str(pass_dir / 'before/female-hair-refined.blend'))
rig = bpy.data.objects['AvatarSkeleton']
rig.data.pose_position = 'REST'
set_pose({})
before_meshes = {ob.name: geometry_contract(ob) for ob in bpy.context.scene.objects if ob.type == 'MESH'}
before_images = {image.name: hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
body = Surface(rig, bpy.data.objects['AvatarBody']).tree
material = bpy.data.materials['PLURR loose brunette front locks']
name = 'PLURR right cheek frame'
assert bpy.data.objects.get(name) is None

def bezier(a,b,c,d,t):
    return (1-t)**3*a + 3*(1-t)**2*t*b + 3*(1-t)*t*t*c + t**3*d

verts, faces, texcoords, colors, root_points = [], [], [], [], []
card_count = 6
rows = 28
for card in range(card_count):
    family, layer = divmod(card, 2)
    start_x = .044 + .0018*(family-1) + .0003*layer
    start_z = 1.671 + .0015*(family-1) + .0005*layer
    tip_z = [1.550,1.565,1.580][family] + .0010*layer
    tip_x = [.047,.051,.056][family] + .0006*layer
    centers, skin_normals = [], []
    for row in range(rows):
        t = row/(rows-1)
        x = bezier(start_x, .053 + .001*family, .063 + .001*family, tip_x, t)
        z = bezier(start_z, 1.660, 1.602 + .005*family, tip_z, t)
        x += .0008*math.sin(2*math.pi*t+card*.47)*math.sin(math.pi*t)
        hit, normal, _, _ = body.ray_cast(Vector((x,-.5,z)),Vector((0,1,0)),1)
        assert hit is not None,(card,row,x,z)
        normal = Vector(normal).normalized()
        center = Vector(hit) + normal*(.0036+.00035*layer)
        centers.append(center);skin_normals.append(normal)
    base = len(verts)
    for row in range(rows):
        t = row/(rows-1)
        tangent = (centers[min(row+1,rows-1)]-centers[max(row-1,0)]).normalized()
        across = tangent.cross(skin_normals[row]).normalized()
        width = .00235*(.34+.66*math.sin(math.pi*t)**.5)*(1-t)**.76
        center = centers[row]
        for column,u in enumerate((0,.5,1)):
            point = center + across*width*(2*u-1) + skin_normals[row]*(.00035 if column==1 else 0)
            nearest, n, _, distance = body.find_nearest(point)
            if distance<.003:
                point = Vector(nearest)+Vector(n)*.003
            verts.append(tuple(point))
            texcoords.append((u,t))
            shade = .88+.03*family+.025*layer
            colors.append((shade,shade*.97,shade*.93,1))
        if row==0:
            root_points.append(tuple(center))
        if row:
            for column in (0,1):
                a=base+(row-1)*3+column
                faces.append((a,a+1,a+4,a+3))

mesh = bpy.data.meshes.new(name)
mesh.from_pydata(verts,[],faces)
mesh.update()
mesh.materials.append(material)
uv = mesh.uv_layers.new(name='UVMap')
for loop in mesh.loops:
    uv.data[loop.index].uv = texcoords[loop.vertex_index]
tint = mesh.color_attributes.new(name='ReferenceHairTint',type='FLOAT_COLOR',domain='POINT')
for vertex, color in zip(tint.data,colors):
    vertex.color = color
ob = bpy.data.objects.new(name,mesh)
bpy.context.collection.objects.link(ob)
ob.parent = rig
for key,value in bpy.data.objects['PLURR loose brunette front locks'].items():
    ob[key]=value
head = ob.vertex_groups.new(name='head')
head.add(list(range(len(verts))),1,'REPLACE')
skin = ob.modifiers.new('Avatar skin','ARMATURE')
skin.object = rig
assert before_meshes == {item.name:geometry_contract(item) for item in bpy.context.scene.objects if item.type=='MESH' and item != ob}
assert before_images == {image.name:hashlib.sha256(image.packed_file.data).hexdigest() for image in bpy.data.images if image.packed_file}
assert len(verts)==504 and len(faces)==324
assert all(abs(ob.vertex_groups['head'].weight(index)-1)<1e-8 for index in range(len(verts)))

mesh.calc_loop_triangles()
indices = [index for triangle in mesh.loop_triangles for index in triangle.vertices]
normals = [tuple(vertex.normal) for vertex in mesh.vertices]
assert len(indices)==len(faces)*6
assert np.isfinite(np.array(normals)).all()
face_normals = np.array([np.cross(np.array(verts[b])-verts[a],np.array(verts[c])-verts[a]) for a,b,c in np.array(indices).reshape(-1,3)])
areas = np.linalg.norm(face_normals,axis=1)
assert areas.min()>1e-11,areas.min()

rig.data.pose_position = 'POSE'
rig.animation_data.action = bpy.data.actions['idle']
scene = bpy.context.scene
scene.frame_set(1)
set_pose({})
camera = review.configure_scene()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = .31
scene.render.resolution_x = 650
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.view_settings.exposure = -.8
if scene.render.engine == 'CYCLES':scene.cycles.samples = 24
eye = array(bpy.data.objects['AvatarIris_l'],True).mean(0)
look = Vector((0,-.075,float(eye[2]-.024)))
for label,offset in [('front',(0,-4,.015)),('oblique',(2,-3,.015)),('profile',(4,0,.015))]:
    camera.location = look + Vector(offset)
    review.look_at(camera,look)
    scene.render.filepath = str(pass_dir / ('after-'+label+'.png'))
    bpy.ops.render.render(write_still=True)

record = {
    'mesh':name,'vertices':len(verts),'triangles':len(indices)//3,
    'cards':card_count,'materialsAdded':0,'imagesAdded':0,'otherMeshContractsExact':len(before_meshes),
    'packedImagesExact':len(before_images),'headWeight':1,
    'minimumTriangleAreaMm2':float(areas.min()*500000),
    'rootCoordinates':root_points,
}
(pass_dir / 'native-candidate-validation.json').write_text(json.dumps(record,indent=2)+'\n')
geometry = {'mesh':name,'positions':verts,'normals':normals,'uvs':texcoords,'colors':colors,'indices':indices,'material':material.name}
(pass_dir / 'cheek-frame-geometry.json').write_text(json.dumps(geometry,separators=(',',':')))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(pass_dir/'candidate.blend'),compress=True)
print('CHEEK_FRAME_CANDIDATE',json.dumps(record),flush=True)
