"""Refine verified outfit01 into an owned outfit02 wardrobe candidate.
Connection map: sleeve folds share existing shell vertices; surface trim and pocket
sit 2–3 mm above the measured jacket; paired fabric layers move together. Body and
rig are unchanged. This script only overwrites provisional outfit02 outputs.
"""
from pathlib import Path
import sys,json,math,hashlib
import bpy,bmesh
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_bodies import OUT,review
from finish_bomber_fit import finish
STEM='male-outfit02';source=OUT/'male-outfit01.blend'
bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene
scene.frame_set(31);bpy.context.view_layer.update()
rig=bpy.data.objects['AvatarSkeleton'];body=bpy.data.objects['AvatarBody'];coat=bpy.data.objects['Luxury_Bomber continuous shell']
skin={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
def matrix(obj,v):
    result=Matrix(((0,0,0,0),)*4)
    for g in v.groups:result+=skin[obj.vertex_groups[g.group].name]*g.weight
    return result
# Add cloth topology only along the sleeves, preserving the verified torso rim.
old_half=len(coat.data.vertices)//2
bm=bmesh.new();bm.from_mesh(coat.data);bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm,geom=list(bm.verts)[old_half:],context='VERTS')
deform=bm.verts.layers.deform.active
arm_groups={g.index for g in coat.vertex_groups if g.name.startswith(('upperarm_','lowerarm_'))}
edges=[edge for edge in bm.edges if all(sum(w for g,w in v[deform].items() if g in arm_groups)>.82 for v in edge.verts)]
bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(coat.data);bm.free()
for vertex in coat.data.vertices:
    mix=sorted([(g.group,g.weight) for g in vertex.groups],key=lambda x:-x[1])[:4];total=sum(w for _,w in mix)
    for group in coat.vertex_groups:group.remove([vertex.index])
    for index,weight in mix:coat.vertex_groups[index].add([vertex.index],weight/total,'REPLACE')
for mod in list(coat.modifiers):coat.modifiers.remove(mod)
solid=coat.modifiers.new('Refined fabric thickness','SOLIDIFY');solid.thickness=.0015;solid.offset=-1
bpy.ops.object.select_all(action='DESELECT');coat.select_set(True);bpy.context.view_layer.objects.active=coat;bpy.ops.object.modifier_apply(modifier=solid.name)
arm=coat.modifiers.new('Garment skin','ARMATURE');arm.object=rig
for face in coat.data.polygons:face.use_smooth=True
# Low-frequency cloth gathers, concentrated around elbows and above cuffs.
# The existing inner-armpit correction is deliberately outside this sculpt region.
half=len(coat.data.vertices)//2;max_shift=0;changed=0
for i in range(half):
    pair=[coat.data.vertices[i],coat.data.vertices[i+half]];m=matrix(coat,pair[0]);p=m@((pair[0].co+pair[1].co)*.5)
    side='l' if p.x>=0 else 'r';start=rig.pose.bones['upperarm_'+side].head;end=rig.pose.bones['lowerarm_'+side].tail
    axis=(end-start).normalized();distance=(p-start).dot(axis);t=distance/(end-start).length
    if not .22<t<.94:continue
    radial=p-(start+axis*distance)
    if radial.length<.02:continue
    angle=math.atan2(radial.z,radial.y)
    envelope=math.sin(math.pi*(t-.22)/.72)**2
    outer=max(.1,min(1,.6+.6*radial.z/radial.length))
    gather=0
    for center_t,amplitude,phase,width in [(.34,.004,.5,.035),(.46,.009,2.2,.028),(.57,.006,-.7,.035),(.69,.010,1.4,.025),(.81,.008,-1.8,.028),(.90,.004,.8,.025)]:
        ridge=center_t+.035*math.sin(angle+phase)
        angular=.15+.85*max(0,math.cos(angle-phase))**2
        gather+=amplitude*angular*math.exp(-((t-ridge)/width)**2)
    gather*=outer
    gather+=.003*math.exp(-((t-.85)/.065)**2)
    delta=m.to_3x3().inverted_safe()@(radial.normalized()*gather)
    for v in pair:v.co+=delta
    max_shift=max(max_shift,delta.length);changed+=1
coat.data.update()
pearl=bpy.data.materials['Luxury pearl satin'];p=pearl.node_tree.nodes['Principled BSDF']
p.inputs['Roughness'].default_value=.27;p.inputs['Metallic'].default_value=.32
bpy.data.materials['Luxury black shirt'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.52
black=bpy.data.materials['Luxury black ribbing'];gold=bpy.data.materials['Luxury warm gold']
bpy.context.view_layer.update();e=coat.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=e.to_mesh()
points=[v.co.copy() for v in mesh.vertices]
outer_faces=[list(f.vertices) for f in mesh.polygons if all(i<half for i in f.vertices)]
assert outer_faces
surface=BVHTree.FromPolygons(points,outer_faces)
kd=KDTree(half)
for i,p in enumerate(points[:half]):kd.insert(p,i)
kd.balance();e.to_mesh_clear()

def project(p,offset=.002):
    hit,normal,_,_=surface.find_nearest(Vector(p));return hit+normal*offset

def make(name,points,faces,mat):
    mesh=bpy.data.meshes.new(name+' mesh');mesh.from_pydata(points,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    obj=bpy.data.objects.new('Luxury_'+name,mesh);scene.collection.objects.link(obj);mesh.materials.append(mat)
    for v in mesh.vertices:
        mix={}
        for _,index,d in kd.find_n(v.co,3):
            for g in coat.data.vertices[index].groups:
                n=coat.vertex_groups[g.group].name;mix[n]=mix.get(n,0)+g.weight/(d+.005)**2
        mix=dict(sorted(mix.items(),key=lambda x:-x[1])[:4]);total=sum(mix.values());mix={n:w/total for n,w in mix.items()}
        transform=Matrix(((0,0,0,0),)*4)
        for n,w in mix.items():
            transform+=skin[n]*w;group=obj.vertex_groups.get(n) or obj.vertex_groups.new(name=n);group.add([v.index],w,'REPLACE')
        v.co=transform.inverted()@v.co
    obj.parent=rig
    for f in mesh.polygons:f.use_smooth=True
    mod=obj.modifiers.new('Fabric thickness','SOLIDIFY');mod.thickness=.001;mod.offset=0
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=obj.modifiers.new('Garment skin','ARMATURE');mod.object=rig
    return obj

def strip(rows):
    n=len(rows[0]);return [p for row in rows for p in row],[(j*n+i,j*n+i+1,(j+1)*n+i+1,(j+1)*n+i) for j in range(len(rows)-1) for i in range(n-1)]
# Close the old floating trim onto the actual outer cloth surface.
trim_shifts={}
for name in ['Luxury_Gold front trim -1','Luxury_Gold front trim 1']:
    obj=bpy.data.objects[name];n=len(obj.data.vertices)//2;greatest=0
    for i in range(n):
        pair=[obj.data.vertices[i],obj.data.vertices[i+n]];m=matrix(obj,pair[0]);p=m@((pair[0].co+pair[1].co)*.5)
        delta=m.to_3x3().inverted_safe()@(project(p,.0025)-p)
        for v in pair:v.co+=delta
        greatest=max(greatest,delta.length)
    obj.data.update();trim_shifts[name]=greatest
# Place gold bands on their actual black cuff/waist surfaces, avoiding z-fighting.
for base_name,strip_names in [('Luxury_cuff l',['Luxury_cuff gold lower l','Luxury_cuff gold upper l']),('Luxury_cuff r',['Luxury_cuff gold lower r','Luxury_cuff gold upper r']),('Luxury_waistband',['Luxury_waist gold lower','Luxury_waist gold upper'])]:
    base=bpy.data.objects[base_name];bpy.context.view_layer.update();ev=base.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();limit=len(me.vertices)//2
    tree=BVHTree.FromPolygons([v.co.copy() for v in me.vertices],[list(f.vertices) for f in me.polygons if all(i<limit for i in f.vertices)]);ev.to_mesh_clear()
    for name in strip_names:
        obj=bpy.data.objects[name];count=len(obj.data.vertices)//2
        for i in range(count):
            pair=[obj.data.vertices[i],obj.data.vertices[i+count]];m=matrix(obj,pair[0]);p=m@((pair[0].co+pair[1].co)*.5)
            hit,normal,_,_=tree.find_nearest(p);delta=m.to_3x3().inverted_safe()@(hit+normal*.002-p)
            for v in pair:v.co+=delta
        obj.data.update()
from fit_bomber_layers import fit_layers
fit_layers(scene,coat,bpy.data.objects['Luxury_Black shirt draft'],rig,OUT,STEM)
# Verify the altered shell against every frame, preserving paired fabric thickness.
garments=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('Luxury_')]
finish(scene,body,rig,garments,OUT,stem=STEM)
# Attach surface details only after the jacket's final fit, so subsequent ease
# adjustments cannot bury the pocket or trim inside the fabric.
scene.frame_set(31);bpy.context.view_layer.update()
e=coat.evaluated_get(bpy.context.evaluated_depsgraph_get());me=e.to_mesh();half=len(coat.data.vertices)//2
surface=BVHTree.FromPolygons([v.co.copy() for v in me.vertices],[list(f.vertices) for f in me.polygons if all(i<half for i in f.vertices)])
kd=KDTree(half)
for i,v in enumerate(me.vertices[:half]):kd.insert(v.co,i)
kd.balance();e.to_mesh_clear()
attachments=[o for o in garments if any(part in o.name for part in ['Sleeve utility','Front zipper teeth','Gold front trim','Pocket welt','Pocket zipper'])]
for obj in attachments:
    count=len(obj.data.vertices)//2
    offset=.006 if 'zipper' in obj.name.lower() else .0035
    for i in range(count):
        pair=[obj.data.vertices[i],obj.data.vertices[i+count]];old=matrix(obj,pair[0]);p=old@((pair[0].co+pair[1].co)*.5)
        hit,normal,_,_=surface.find_nearest(p);target=hit+normal*offset;mix={}
        for _,index,distance in kd.find_n(hit,3):
            for g in coat.data.vertices[index].groups:
                name=coat.vertex_groups[g.group].name;mix[name]=mix.get(name,0)+g.weight/(distance+.005)**2
        mix=dict(sorted(mix.items(),key=lambda x:-x[1])[:4]);total=sum(mix.values());mix={n:w/total for n,w in mix.items()}
        transform=Matrix(((0,0,0,0),)*4)
        for n,w in mix.items():transform+=skin[n]*w
        for side,v in enumerate(pair):
            for group in obj.vertex_groups:group.remove([v.index])
            for n,w in mix.items():(obj.vertex_groups.get(n) or obj.vertex_groups.new(name=n)).add([v.index],w,'REPLACE')
            v.co=transform.inverted()@(target+normal*(.0005 if side==0 else -.0005))
    obj.data.update()
# The sleeve pocket copies the coat's own surface vertices and weights. A
# separately sampled weight field allowed the earlier patch to sink into the sleeve.
e=coat.evaluated_get(bpy.context.evaluated_depsgraph_get());me=e.to_mesh()
coat_points=[v.co.copy() for v in me.vertices];coat_normals=[v.normal.copy() for v in me.vertices]
start=rig.pose.bones['upperarm_l'].head;end=rig.pose.bones['lowerarm_l'].tail;axis=(end-start).normalized();center=start+axis*((end-start).length*.27)
selected=[]
for face in me.polygons:
    if not all(i<half for i in face.vertices):continue
    p=face.center
    if abs(p.x-center.x)<.045 and center.z+.018<p.z<center.z+.080 and p.y<-.04:selected.append(list(face.vertices))
e.to_mesh_clear()
assert selected,'No sleeve faces selected for pocket'
indices=sorted({i for face in selected for i in face});mapping={v:i for i,v in enumerate(indices)}
def exact_attachment(name,targets,faces,source_indices,mat):
    mesh=bpy.data.meshes.new(name+' mesh');mesh.from_pydata(targets,[],faces);mesh.update()
    obj=bpy.data.objects.new('Luxury_'+name,mesh);scene.collection.objects.link(obj);mesh.materials.append(mat)
    for v,index in zip(mesh.vertices,source_indices):
        m=matrix(coat,coat.data.vertices[index]);v.co=m.inverted()@v.co
        for g in coat.data.vertices[index].groups:
            name_bone=coat.vertex_groups[g.group].name;(obj.vertex_groups.get(name_bone) or obj.vertex_groups.new(name=name_bone)).add([v.index],g.weight,'REPLACE')
    for f in mesh.polygons:f.use_smooth=True
    obj.parent=rig;solid=obj.modifiers.new('Attachment thickness','SOLIDIFY');solid.thickness=.001;solid.offset=0
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=solid.name)
    arm=obj.modifiers.new('Garment skin','ARMATURE');arm.object=rig
    garments.append(obj)
exact_attachment('Sleeve utility pocket',[coat_points[i]+coat_normals[i]*.004 for i in indices],[[mapping[i] for i in f] for f in selected],indices,pearl)
zip_rows=[];zip_indices=[];used=set()
for j in range(12):
    target=Vector((center.x-.035+.070*j/11,-.30,center.z+.05));index=min(indices,key=lambda i:(coat_points[i].x-target.x)**2+.2*(coat_points[i].z-target.z)**2)
    if index in used:continue
    used.add(index);p=coat_points[index]+coat_normals[index]*.007
    zip_rows.append([p+Vector((0,0,-.004)),p+Vector((0,0,.004))]);zip_indices.extend([index,index])
if len(zip_rows)>1:
    exact_attachment('Sleeve utility zipper tape',*strip(zip_rows),zip_indices,black)
    gold_rows=[]
    for row,index in zip(zip_rows,zip_indices[::2]):
        p=(row[0]+row[1])*.5+coat_normals[index]*.0015
        gold_rows.append([p+Vector((0,0,-.001)),p+Vector((0,0,.001))])
    exact_attachment('Sleeve utility zipper teeth',*strip(gold_rows),zip_indices,gold)
# Teeth are authored as small tangent quads after fitting. Projecting each corner
# independently onto the opening edge can collapse their width to zero.
for sign in [-1,1]:
    vertices=[];faces=[]
    bottom=rig.pose.bones['pelvis'].head.z-.01;top=rig.pose.bones['upperarm_l'].head.z+.035
    for j in range(54):
        z=bottom+(top-bottom)*j/53;x=sign*(.052+.028*(z-(bottom-.015))/(top-bottom))
        hit,normal,_,_=surface.find_nearest(Vector((x,-.28,z)))
        across=Vector((sign,0,0));across=(across-normal*across.dot(normal)).normalized()
        along=normal.cross(across).normalized()
        if along.z<0:along=-along
        center=hit+normal*.004+across*.001;k=len(vertices)
        vertices.extend([center+across*u+along*v for u,v in [(0,-.0015),(.004,-.0015),(.004,.0015),(0,.0015)]])
        faces.append(tuple(k+i for i in range(4)))
    garments.append(make('Front zipper teeth '+str(sign),vertices,faces,gold))
scene.frame_set(1);bpy.context.view_layer.update()
for obj in bpy.data.objects:obj.hide_set(False);obj.hide_viewport=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(STEM+'.blend')),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type in ['MESH','ARMATURE','EMPTY']:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/(STEM+'.glb')),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_skins=True,export_morph=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_optimize_animation_size=True)
(OUT/(STEM+'.json')).write_text(json.dumps({'source':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'fold_vertices_paired':changed,'maximum_fold_offset_m':max_shift,'trim_max_adjustment_m':trim_shifts,'wardrobe_parts':len(garments),'appearance':'PENDING','deformation':'PENDING_INDEPENDENT_VALIDATION'},indent=2)+'\n')
camera=review.configure_scene();camera.data.type='ORTHO';scene.render.resolution_x=800;scene.render.resolution_y=960
for obj in bpy.data.objects:
    if obj.type=='MESH':obj.hide_render=obj.name.startswith('AvatarTop_')
for frame,label in [(1,'relaxed'),(31,'tpose'),(61,'reach'),(91,'crouch')]:
    scene.frame_set(frame);camera.data.ortho_scale=2.65 if frame==61 else 2.25
    for view,location in {'front':(0,-4,.93),'three-quarter':(2,-4,.93)}.items():
        camera.location=location;review.look_at(camera,Vector((0,0,.93)))
        scene.render.filepath=str(OUT/f'{STEM}-{label}-{view}.png');bpy.ops.render.render(write_still=True)
scene.frame_set(1);camera.data.ortho_scale=1.0;camera.location=(2,-4,1.30);review.look_at(camera,Vector((0,0,1.30)))
scene.render.filepath=str(OUT/(STEM+'-jacket-detail.png'));bpy.ops.render.render(write_still=True)
print('BOMBER_REFINED',len(garments))
