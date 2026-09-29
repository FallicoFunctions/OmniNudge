"""Author the first reference-inspired luxury bomber, on the body03 rig.

Connection map (metres): torso and sleeves share continuous body-derived topology;
cuffs overlap sleeve ends by 0.008; waistband overlaps torso by 0.010;
collar overlaps neckline by 0.008; gold plackets sit 0.003 ahead of front edges.
Geometry is authored in the evaluated T-pose, then inverse-skinned into rest
coordinates using body weights. No body vertices or bones are changed.
"""
from pathlib import Path
import bpy
import bmesh
import math
import sys
import json
import hashlib
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_bodies import OUT, review

bpy.ops.wm.open_mainfile(filepath=str(OUT/'male-review03.blend'))
scene=bpy.context.scene
scene.frame_set(31)
rig=bpy.data.objects['AvatarSkeleton'];body=bpy.data.objects['AvatarBody']
bpy.context.view_layer.update()
evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
body_points=[v.co.copy() for v in mesh.vertices];evaluated.to_mesh_clear()
kd=KDTree(len(body_points))
for i,p in enumerate(body_points):kd.insert(p,i)
kd.balance()
body_surface=BVHTree.FromPolygons(body_points,[list(p.vertices) for p in body.data.polygons])
skin={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
weights=[]
for v in body.data.vertices:
    w={body.vertex_groups[g.group].name:g.weight for g in v.groups if body.vertex_groups[g.group].name in skin and g.weight>0}
    total=sum(w.values());weights.append({n:x/total for n,x in w.items()})

def material(name,color,metallic,roughness):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic;p.inputs['Roughness'].default_value=roughness
    return m

pearl=material('Luxury pearl satin',(.82,.79,.70),.18,.40)
black=material('Luxury black ribbing',(.018,.021,.026),.05,.65)
gold=material('Luxury warm gold',(.64,.38,.105),.78,.25)
shirtmat=material('Luxury black shirt',(.022,.025,.032),.03,.43)
created=[]
fitted_surfaces={}

def make(name,points,faces,mat,thickness=.0015):
    mesh=bpy.data.meshes.new(name+' mesh');mesh.from_pydata(points,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    obj=bpy.data.objects.new('Luxury_'+name,mesh);scene.collection.objects.link(obj);obj.data.materials.append(mat)
    fitted=[]
    # Four nearest body samples provide smooth weights, capped to four bones.
    for v in mesh.vertices:
        target=v.co.copy()
        hit,normal,_,_=body_surface.find_nearest(target)
        signed=(target-hit).dot(normal)
        clearance=.010 if mat==shirtmat else .038 if name.startswith(('Gold front','Zipper')) else .035 if name.startswith('Bomber torso') else .018
        if signed<clearance:target+=normal*(clearance-signed)
        fitted.append(target.copy())
        near=kd.find_n(target,4);mix={}
        for _,index,distance in near:
            for n,w in weights[index].items():mix[n]=mix.get(n,0)+w/(distance+.01)**2
        mix=dict(sorted(mix.items(),key=lambda p:p[1],reverse=True)[:4]);total=sum(mix.values());mix={n:w/total for n,w in mix.items()}
        transform=Matrix(((0,0,0,0),)*4)
        for n,w in mix.items():transform+=skin[n]*w
        v.co=transform.inverted()@target
        for n,w in mix.items():
            group=obj.vertex_groups.get(n) or obj.vertex_groups.new(name=n);group.add([v.index],w,'REPLACE')
    for f in mesh.polygons:f.use_smooth=True
    obj.parent=rig
    if thickness:
        solid=obj.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=thickness;solid.offset=0
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.modifier_apply(modifier=solid.name)
    arm=obj.modifiers.new('Luxury garment skin','ARMATURE');arm.object=rig
    fitted_surfaces[name]=fitted
    created.append(obj)
    return obj

def grid(rows,closed=False):
    count=len(rows[0]);faces=[]
    for j in range(len(rows)-1):
        for i in range(count if closed else count-1):
            k=(i+1)%count;faces.append((j*count+i,j*count+k,(j+1)*count+k,(j+1)*count+i))
    return [tuple(p) for row in rows for p in row],faces

# Original-inspired proportions: waist-length open front and generous sleeves.
shoulder=rig.pose.bones['upperarm_l'].head.z
hem=rig.pose.bones['pelvis'].head.z-.025
profile=[(hem,.155,.117,.116,.34),(hem+.05,.169,.13,.125,.38),
         (hem+.16,.180,.145,.125,.44),(shoulder-.15,.199,.158,.13,.49),
         (shoulder-.06,.218,.16,.135,.53),(shoulder+.015,.218,.15,.13,.60),
         (shoulder+.065,.176,.105,.105,.64),(shoulder+.105,.097,.075,.075,.70)]

def shell_rows(profile,detail=True):
    rows=[]
    for j in range(len(profile)-1):
        for step in range(4):
            t=step/4;z,rx,front,back,gap=[a*(1-t)+b*t for a,b in zip(profile[j],profile[j+1])]
            row=[]
            for i in range(49):
                angle=gap+(2*math.pi-2*gap)*i/48
                radial=(.0025*math.sin(angle*11+z*26)+.0015*math.sin(angle*19-z*37)) if detail else 0
                row.append(Vector(((rx+radial)*math.sin(angle),-.025-(front if math.cos(angle)>0 else back)*math.cos(angle),z)))
            rows.append(row)
    z,rx,front,back,gap=profile[-1]
    rows.append([Vector((rx*math.sin(gap+(2*math.pi-2*gap)*i/48),-.025-(front if math.cos(gap+(2*math.pi-2*gap)*i/48)>0 else back)*math.cos(gap+(2*math.pi-2*gap)*i/48),z)) for i in range(49)])
    return rows

def body_shell(name, mat, sleeved):
    """Cut a continuous shell from body topology, retaining interpolated native weights."""
    mesh=body.data.copy();mesh.name=name+' mesh'
    obj=bpy.data.objects.new('Luxury_'+name,mesh);scene.collection.objects.link(obj)
    for group in body.vertex_groups:obj.vertex_groups.new(name=group.name)
    for v,p in zip(mesh.vertices,body_points):v.co=p
    bm=bmesh.new();bm.from_mesh(mesh)
    def cut(point,normal,outer):
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=1e-6,plane_co=point,plane_no=normal,clear_outer=outer,clear_inner=not outer)
    cut((0,0,hem if sleeved else hem-.04),(0,0,1),False)
    cut((0,0,shoulder+.105 if sleeved else shoulder+.065),(0,0,1),True)
    wrist=abs(rig.pose.bones['lowerarm_l'].tail.x)-.044
    extent=wrist if sleeved else .183
    cut((extent,0,0),(1,0,0),True);cut((-extent,0,0),(1,0,0),False)
    # Bisect exact opening planes before removing the centre faces: no sawtooth rim.
    slope=.028/(shoulder-hem) if sleeved else .07/.22
    base=.052 if sleeved else 0
    origin=hem if sleeved else shoulder-.16
    def gap(z):return max(.001,base+slope*(z-origin))
    for sign in [-1,1]:
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,
            plane_co=(sign*base,0,origin),plane_no=(sign,0,-slope))
        if not sleeved:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,
                plane_co=(sign*.001,0,0),plane_no=(1,0,0))
    remove=[f for f in bm.faces if f.calc_center_median().y<-.045 and abs(f.calc_center_median().x)<gap(f.calc_center_median().z)-1e-6]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
    neck_rim=[v for v in bm.verts if v.is_boundary and abs(v.co.z-(shoulder+.105 if sleeved else shoulder+.065))<1e-5]
    # A connected shoulder preserves the body's weight field across the armpit.
    for v in bm.verts:
        p=v.co.copy();normal=v.normal.copy()
        v.co+=normal*(.025 if sleeved else .011)
        if sleeved:
            arm=max(0,min(1,(abs(p.x)-.17)/.10))
            side='l' if p.x>=0 else 'r'
            start=rig.pose.bones['upperarm_'+side].head
            end=rig.pose.bones['lowerarm_'+side].tail
            axis=(end-start).normalized();along=(p-start).dot(axis)
            center=start+axis*along;radial=p-center
            t=max(0,min(1,along/(end-start).length))
            radius=.085*(1-t)+.047*t+.007*math.sin(math.pi*t)
            if radial.length>1e-5:
                target=center+radial.normalized()*max(radius,radial.length+.018)
                v.co=v.co.lerp(target,arm)
        if v.is_boundary and p.y<-.06 and abs(abs(p.x)-gap(p.z))<.001:
            v.co.x=math.copysign(gap(p.z),p.x)
    fitted_surfaces[name+' neck rim']=[v.co.copy() for v in neck_rim]
    # Save the exact cut edge for trim and collar attachment.
    fitted_surfaces[name+' front edges']=[[v.co.copy() for v in bm.verts if v.is_boundary and v.co.y<-.06 and abs(abs(v.co.x)-gap(v.co.z))<.003 and v.co.x*sign>0] for sign in [1,-1]]
    bm.to_mesh(mesh);bm.free();mesh.update()
    targets=[v.co.copy() for v in mesh.vertices]
    for v in mesh.vertices:
        mix={obj.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>0 and obj.vertex_groups[g.group].name in skin}
        mix=dict(sorted(mix.items(),key=lambda kv:kv[1],reverse=True)[:4]);total=sum(mix.values())
        assert total>0
        mix={n:w/total for n,w in mix.items()};transform=Matrix(((0,0,0,0),)*4)
        for n,w in mix.items():transform+=skin[n]*w
        v.co=transform.inverted()@v.co
        for g in obj.vertex_groups:g.remove([v.index])
        for n,w in mix.items():obj.vertex_groups[n].add([v.index],w,'REPLACE')
    mesh.materials.clear();mesh.materials.append(mat)
    for f in mesh.polygons:f.use_smooth=True
    obj.parent=rig
    solid=obj.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.0015;solid.offset=0
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=solid.name)
    modifier=obj.modifiers.new('Luxury garment skin','ARMATURE');modifier.object=rig
    created.append(obj);fitted_surfaces[name]=targets
    return obj

jacket=body_shell('Bomber continuous shell',pearl,True)
bpy.context.view_layer.update()
jacket_eval=jacket.evaluated_get(bpy.context.evaluated_depsgraph_get());jacket_mesh=jacket_eval.to_mesh()
jacket_surface=BVHTree.FromPolygons([v.co.copy() for v in jacket_mesh.vertices],[list(f.vertices) for f in jacket_mesh.polygons])
jacket_eval.to_mesh_clear()
# Author trim coordinates on the actual front boundary, rather than a separate torso.
rows=shell_rows(profile)
for row in rows:
    for i,p in enumerate(row):
        hit,normal,_,_=jacket_surface.find_nearest(p)
        row[i]=hit+normal*.003
# Raised piping follows the actual cut boundary, not a projected proxy ellipse.
for edge_points,sign in zip(fitted_surfaces['Bomber continuous shell front edges'],[1,-1]):
    edge_points.sort(key=lambda p:p.z)
    strip=[]
    for p in edge_points:
        strip.append([p+Vector((sign*x,-.002,0)) for x in [0,.004]])
    make('Gold front trim '+str(sign),*grid(strip),gold,.001)

# Cuffs use the verified shoulder-to-wrist span in the T-pose.
for side,sign in [('l',1),('r',-1)]:
    upper=rig.pose.bones['upperarm_'+side];lower=rig.pose.bones['lowerarm_'+side]
    start=upper.head.copy();end=lower.tail.copy();length=(end-start).length
    direction=(end-start).normalized();axis_y=Vector((0,1,0));axis_z=direction.cross(axis_y).normalized()
    for label,t0,t1,mat in [('cuff',length-.051,length+.009,black),('cuff gold lower',length-.006,length+.001,gold),('cuff gold upper',length-.039,length-.032,gold)]:
        cuff=[]
        for j in range(5):
            t=j/4;center=start+direction*(t0+(t1-t0)*t);radius=.046+.002*math.sin(math.pi*t)
            cuff.append([center+(axis_y*math.cos(a)+axis_z*math.sin(a))*(radius+.0008*math.cos(i*math.pi)) for i in range(64) for a in [i*2*math.pi/64]])
        make(label+' '+side,*grid(cuff,True),mat)

# Black ribbed waistband with gold stripes, open at the jacket front.
for label,z0,z1,mat in [('waistband',hem-.038,hem+.01,black),('waist gold lower',hem-.027,hem-.022,gold),('waist gold upper',hem-.011,hem-.006,gold)]:
    make(label,*grid(shell_rows([(z0,.155,.118,.117,.34),(z1,.155,.118,.117,.34)],False)),mat)
# Collar is attached to the measured shell neckline, with a 10 mm vertical overlap.
neck_rim=fitted_surfaces['Bomber continuous shell neck rim']
neck_rim.sort(key=lambda p:math.atan2(p.x,-(p.y+.025))%(2*math.pi))
for label,z0,z1,mat in [('collar',-.010,.023,black),('collar gold',.011,.016,gold)]:
    collar_rows=[]
    for j in range(4):
        dz=z0+(z1-z0)*j/3
        collar_rows.append([p+Vector((0,0,dz)) for p in neck_rim])
    make(label,*grid(collar_rows),mat)
# Independent black sleeveless underlayer with a V opening; tailored shirt pending.
body_shell('Black shirt draft',shirtmat,False)
button_points=[];button_faces=[]
for z in [hem+.04,hem+.10,hem+.16]:
    front=Vector((0,-.18,z));hit,normal,_,_=body_surface.find_nearest(front)
    y=min(front.y,hit.y-.018)
    k=len(button_points);button_points.append((0,y,z))
    button_points += [(.0027*math.cos(i*2*math.pi/12),y,z+.0027*math.sin(i*2*math.pi/12)) for i in range(12)]
    button_faces += [(k,k+1+i,k+1+(i+1)%12) for i in range(12)]
make('Shirt buttons',button_points,button_faces,black,.001)


# Welt pocket openings follow actual torso surface rows, with warm metal pulls.
for edge,sign in [(5,1),(-6,-1)]:
    pocket=[]
    for j in range(3,9):
        p=rows[j][edge].copy();p.y-=.009
        pocket.append([p+Vector((x,0,z)) for x,z in [(-.002,-.003),(.002,.003)]])
    make('Pocket welt '+str(sign),*grid(pocket),black,.001)
    make('Pocket zipper '+str(sign),*grid([[p+Vector((0,-.002,0)) for p in row] for row in pocket]),gold,.001)

from fit_bomber import fit
fit(scene,body,rig,created,OUT)
from finish_bomber_fit import finish
finish(scene,body,rig,created,OUT)

for obj in created:
    assert all(math.isfinite(x) for v in obj.data.vertices for x in v.co)
scene.frame_set(1);bpy.context.view_layer.update()
for obj in bpy.data.objects:
    obj.hide_set(False);obj.hide_viewport=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'male-outfit01.blend'),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type in ['MESH','ARMATURE','EMPTY']:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'male-outfit01.glb'),export_format='GLB',use_selection=True,
    export_extras=True,export_yup=True,export_skins=True,export_morph=False,export_animations=True,
    export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_optimize_animation_size=True)
report={'scope':'First luxury bomber/underlayer candidate, not accepted reference clothing',
        'source':'male-review03.blend','source_sha256':hashlib.sha256((OUT/'male-review03.blend').read_bytes()).hexdigest(),
        'modules':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons)} for o in created],
        'body_vertices':len(body.data.vertices),'bones':len(rig.data.bones),'reference_likeness':'PENDING','deformation':'PENDING'}
(OUT/'male-outfit01.json').write_text(json.dumps(report,indent=2)+'\n')
camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=2.25
scene.render.resolution_x=800;scene.render.resolution_y=960
for obj in bpy.data.objects:
    if obj.type=='MESH':obj.hide_render=obj.name.startswith('AvatarTop_')
for frame,label in [(1,'relaxed'),(31,'tpose'),(61,'reach'),(91,'crouch')]:
    scene.frame_set(frame);camera.data.ortho_scale=2.65 if frame==61 else 2.25
    for view,location in {'front':(0,-4,.93),'three-quarter':(2,-4,.93)}.items():
        camera.location=location;review.look_at(camera,Vector((0,0,.93)))
        scene.render.filepath=str(OUT/f'male-outfit01-{label}-{view}.png');bpy.ops.render.render(write_still=True)
print('BOMBER_CREATED',len(created))
