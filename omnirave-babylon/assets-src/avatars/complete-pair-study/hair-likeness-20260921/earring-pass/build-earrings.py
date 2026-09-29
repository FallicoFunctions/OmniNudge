"""Add the reference's asymmetric neon earrings to the retained female head.

Connection map (posed, measured from the current ear surface):
- Each clasp starts at least 5 mm inside its ear lobe, then exits the forward surface.
- Each luminous drop enters its clasp's lower span by at least 5 mm.
- The right magenta end enters the cyan drop's lower span by 5 mm.
All components share one head-weighted mesh and one material. Explicit ring
vertices define every span; there are no scaled or Euler-rotated primitives.
"""
import bpy,bmesh,sys,json,math,hashlib,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path.cwd();sys.path.insert(0,str(root/'scripts/launch-body-proof'))
from assemble_complete_pair import array,material,review
from audit_complete_expressions import set_pose
from complete_pair_geometry import Surface,create
from refine_complete_foil_finish import geometry_contract
p=root/'assets-src/avatars/complete-pair-study/hair-likeness-20260921';d=p/'earring-pass'
bpy.ops.wm.open_mainfile(filepath=str(d/'before/female-hair-refined.blend'))
scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];body=bpy.data.objects['AvatarBody']
rig.data.pose_position='POSE';rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);set_pose({})
surf=Surface(rig,body);assert len(surf.array)==len(body.data.vertices)
existing={o.name:geometry_contract(o) for o in scene.objects if o.type=='MESH'}
source_images={i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
assert len(existing)==61 and len(source_images)>=91
head_index=surf.names.index('head');ear_group=body.vertex_groups['ears'].index

def rounded_span(path,radius,sides=8):
    """BMesh ring loft along measured points; no transform or Euler rotation."""
    path=[Vector(v) for v in path];bm=bmesh.new();rings=[];old_across=None
    for j,point in enumerate(path):
        tangent=(path[min(j+1,len(path)-1)]-path[max(j-1,0)]).normalized()
        reference=Vector((0,0,1)) if abs(tangent.z)<.9 else Vector((1,0,0))
        across=tangent.cross(reference).normalized()
        if old_across is not None and across.dot(old_across)<0:across=-across
        up=across.cross(tangent).normalized();old_across=across
        rings.append([bm.verts.new(point+radius*(across*math.cos(i*math.tau/sides)+up*math.sin(i*math.tau/sides))) for i in range(sides)])
    for a,b in zip(rings[:-1],rings[1:]):
        for i in range(sides):bm.faces.new((a[i],a[(i+1)%sides],b[(i+1)%sides],b[i]))
    bm.faces.new(tuple(reversed(rings[0])));bm.faces.new(tuple(rings[-1]))
    temp=bpy.data.meshes.new('Temporary earring loft');bm.to_mesh(temp);bm.free()
    points=[list(v.co) for v in temp.vertices];faces=[tuple(poly.vertices) for poly in temp.polygons]
    bpy.data.meshes.remove(temp)
    assert len(points)==len(path)*sides and all(len(face)>=3 for face in faces)
    return points,faces

all_points=[];all_faces=[];all_colors=[];components={};anchors={}
def part(name,path,radius,color,sides=8):
    points,faces=rounded_span(path,radius,sides);offset=len(all_points)
    all_points.extend(points);all_faces.extend(tuple(offset+i for i in face) for face in faces)
    all_colors.extend([(*color,1)]*len(points))
    a=np.asarray(points);components[name]={'vertices':len(points),'polygons':len(faces),'bounds':{'x':[float(a[:,0].min()),float(a[:,0].max())],'y':[float(a[:,1].min()),float(a[:,1].max())],'z':[float(a[:,2].min()),float(a[:,2].max())]}}
    return a

for sign in [-1,1]:
    choices=[]
    for vertex in body.data.vertices:
        if sign*vertex.co.x<=0:continue
        if max((g.weight for g in vertex.groups if g.group==ear_group),default=0)<=.5:continue
        point=surf.array[vertex.index]
        metric=((abs(point[0])-.070)/.003)**2+((point[1]+.050)/.004)**2+((point[2]-1.570)/.003)**2
        choices.append((metric,point))
    anchor=Vector(min(choices,key=lambda row:row[0])[1]);anchors[str(sign)]=list(anchor)
    # The first clasp point lies behind the measured front ear surface.
    clasp=[anchor+Vector((0,.010,.002)),anchor+Vector((0,.002,.001)),anchor+Vector((0,.004,-.003)),anchor+Vector((sign*.0005,.003,-.007)),anchor+Vector((sign*.0005,.003,-.012))]
    root_hit=surf.tree.ray_cast(clasp[0],Vector((0,-1,0)),.035)
    assert root_hit[0] is not None and root_hit[3]>=.005,(sign,root_hit[3])
    part(f'clasp {sign}',clasp,.00125,(.57,.39,.10),6)
    base=clasp[-1]
    lower_z=anchor.z-(.052 if sign<0 else .031)
    drop=[base+Vector((0,-.001,.005)),base+Vector((sign*.0006,-.001,-.009)),Vector((base.x+sign*.001,base.y-.001,lower_z))]
    part(f'drop {sign}',drop,.00225 if sign<0 else .00185,(.60,.89,.018) if sign<0 else (.022,.66,.95))
    assert min(clasp[-2].z,drop[0].z)-max(clasp[-1].z,drop[1].z)>=.005-1e-6
    if sign>0:
        tip=[drop[-1]+Vector((0,0,.005)),drop[-1]+Vector((0,0,-.007))]
        part('magenta tip',tip,.00205,(.88,.035,.39))
        assert min(drop[-2].z,tip[0].z)-max(drop[-1].z,tip[-1].z)>=.005-1e-6

weights=np.zeros((len(all_points),len(surf.names)),dtype=float);weights[:,head_index]=1
mat=material('PLURR reference ear enamel',(1,1,1),.30,.16)
bs=mat.node_tree.nodes['Principled BSDF'];attrnode=mat.node_tree.nodes.new('ShaderNodeAttribute');attrnode.attribute_name='Ear enamel color';mat.node_tree.links.new(attrnode.outputs['Color'],bs.inputs['Base Color'])
ob=create('PLURR neon ear drops',all_points,all_faces,mat,surf,weights=weights,slot='accessories',option='plurr-earrings')
colors=ob.data.color_attributes.new(name='Ear enamel color',type='FLOAT_COLOR',domain='POINT');colors.data.foreach_set('color',np.asarray(all_colors,dtype=np.float32).ravel());ob.data.update()
assert np.allclose(array(ob,True),np.asarray(all_points),atol=.0005)
assert {o.name:geometry_contract(o) for o in scene.objects if o.type=='MESH' and o!=ob}==existing
assert source_images=={i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
assert len(ob.data.vertices)==len(all_points) and tuple(ob.scale)==(1,1,1) and tuple(ob.rotation_euler)==(0,0,0)
assert list(ob.vertex_groups.keys())==['head']
# Bounds are evaluated for every component; body overlap is intentional only
# at the clasp, while the luminous ends remain above the jacket collar.
for name,row in components.items():
    z=row['bounds']['z'];assert z[0]>1.51 and z[1]<1.59,(name,z)
record={'anchors':anchors,'components':components,'mesh':ob.name,'vertices':len(all_points),'polygons':len(all_faces),'addedMaterials':1,'addedImages':0,'singleHeadWeight':True,'headJointIndex':head_index,'unchangedExistingMeshContracts':len(existing),'unchangedPackedImages':len(source_images)}
cam=review.configure_scene();cam.data.type='ORTHO';cam.data.ortho_scale=.31;scene.render.resolution_x=650;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.view_settings.exposure=-.8
if scene.render.engine=='CYCLES':scene.cycles.samples=24
eye=array(bpy.data.objects['AvatarIris_l'],True).mean(0);target=Vector((0,-.075,float(eye[2]-.024)))
for view,offset in [('front',(0,-4,.015)),('oblique',(2,-3,.015)),('profile',(4,0,.015))]:
    cam.location=target+Vector(offset);review.look_at(cam,target);scene.render.filepath=str(d/(('after-' if '--finalize' in sys.argv else 'candidate-')+view+'.png'));bpy.ops.render.render(write_still=True)
if '--finalize' in sys.argv:
    me=ob.data;me.calc_loop_triangles()
    payload={'mesh':ob.name,'headJointIndex':head_index,'positions':[list(v.co) for v in me.vertices],
             'normals':[list(v.normal) for v in me.vertices],
             'colors':[list(c.color) for c in colors.data],
             'indices':[int(i) for tri in me.loop_triangles for i in tri.vertices]}
    raw=(json.dumps(payload,separators=(',',':'))+'\n').encode()
    (d/'earring-geometry.json').write_bytes(raw)
    record['geometryPayloadSha256']=hashlib.sha256(raw).hexdigest()
    native=json.loads((d/'before/female-native-validation.json').read_text());native['earrings']=record
    (p/'female-native-validation.json').write_text(json.dumps(native,indent=2)+'\n')
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(p/'female-hair-refined.blend'),compress=True)
(d/'native-earring-validation.json').write_text(json.dumps(record,indent=2)+'\n')
print('EARRING_RECORD',json.dumps(record),flush=True)
