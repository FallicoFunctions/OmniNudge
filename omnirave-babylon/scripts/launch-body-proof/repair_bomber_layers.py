"""Resolve local shirt/jacket crossings without changing the body.
Connection map: existing shirt face connectivity and paired 1.5 mm fabric surfaces
are preserved; only local rest positions change, with 25 mm maximum displacement.
The shirt-only pass is followed by bounded underarm coat clearance.
The two previous outfits remain controls. This owns only provisional outfit03.
"""
from pathlib import Path
import bpy,json,math,hashlib,sys,itertools
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_bodies import OUT,review
STEM='male-outfit03';source=OUT/'male-outfit02.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene;body=bpy.data.objects['AvatarBody'];rig=bpy.data.objects['AvatarSkeleton'];shirt=bpy.data.objects['Luxury_Black shirt draft'];coat=bpy.data.objects['Luxury_Bomber continuous shell']
source_shirt_points=[v.co.copy() for v in shirt.data.vertices]
nhalf=len(source_shirt_points)//2
thickness_before=[(source_shirt_points[i]-source_shirt_points[i+nhalf]).length for i in range(nhalf)]
midpoints=[(source_shirt_points[i]+source_shirt_points[i+nhalf])*.5 for i in range(nhalf)]
outer_faces=[list(f.vertices) for f in shirt.data.polygons if all(i<nhalf for i in f.vertices)]
midmesh=bpy.data.meshes.new('Temporary shirt midpoint normals');midmesh.from_pydata(midpoints,[],outer_faces);midmesh.update()
for i in range(nhalf):
    normal=midmesh.vertices[i].normal.copy();assert normal.length>.1
    shirt.data.vertices[i].co=midpoints[i]+normal*.00075
    shirt.data.vertices[i+nhalf].co=midpoints[i]-normal*.00075
bpy.data.meshes.remove(midmesh);shirt.data.update()
from finish_bomber_fit import finish
finish(scene,body,rig,[shirt],OUT,stem=STEM)
print('SHIRT_THICKNESS_REPAIRED',max(thickness_before),'to',max((shirt.data.vertices[i].co-shirt.data.vertices[i+nhalf].co).length for i in range(nhalf)),flush=True)
original=[v.co.copy() for v in shirt.data.vertices];half=len(original)//2
def conservative_triangles(mesh):
    mesh.calc_loop_triangles();ngons={}
    for t in mesh.loop_triangles:ngons.setdefault(t.polygon_index,[]).append(list(t.vertices))
    result=[]
    for f in mesh.polygons:
        if len(f.vertices)==4:result.extend(list(t) for t in itertools.combinations(f.vertices,3))
        else:result.extend(ngons[f.index])
    return result
# Include both quad diagonals, since skinning makes many quads non-planar.
# The independent validator continues using Blender's evaluated triangulation.
faces=conservative_triangles(shirt.data);coat_faces=conservative_triangles(coat.data)
rings=[[] for _ in range(half)]
for fi,face in enumerate(faces):
    for index in {i%half for i in face}:rings[index].append(fi)
weights=[[(shirt.vertex_groups[g.group].name,g.weight) for g in v.groups] for v in shirt.data.vertices]
cache=[]
for frame in range(1,152):
    scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
    bones={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
    matrices=[]
    for ws in weights[:half]:
        m=Matrix(((0,0,0,0),)*4)
        for n,w in ws:m+=bones[n]*w
        matrices.append(m)
    ev=shirt.evaluated_get(dg);mesh=ev.to_mesh();points=[v.co.copy() for v in mesh.vertices];ev.to_mesh_clear()
    # Check the skin prediction used by the optimizer against evaluated Blender points.
    assert max((matrices[i%half]@original[i]-points[i]).length for i in range(len(points)))<1e-5
    ev=coat.evaluated_get(dg);mesh=ev.to_mesh();coat_points=[v.co.copy() for v in mesh.vertices];ev.to_mesh_clear()
    cache.append({'frame':frame,'coat':BVHTree.FromPolygons(coat_points,coat_faces),'body':BVHTree.FromObject(body,dg),'matrices':matrices,'points':points})
print('LAYER_SOLVER_CACHED',len(cache),flush=True)
changes=[];history=[]

def crossings(c):return BVHTree.FromPolygons(c['points'],faces).overlap(c['coat'])
def stats():
    counts=[len(crossings(c)) for c in cache]
    return {'frames_with_crossings':sum(n>0 for n in counts),'maximum_pairs':max(counts),'total_pairs':sum(counts)}
before=stats();print('LAYER_SOLVER_BEFORE',before,flush=True)
def repair_groups(train,pass_index):
    groups=set()
    for c in train:
        for fi,_ in crossings(c):groups.add(tuple(sorted({i%half for i in faces[fi]})))
    count=0
    for group in sorted(groups):
        pairs=[i for n in group for i in [n,n+half]]
        related=[faces[i] for i in sorted({fi for n in group for fi in rings[n]})]
        ids=sorted({i for f in related for i in f});mapping={v:i for i,v in enumerate(ids)}
        local_faces=[[mapping[i] for i in f] for f in related]
        rests={i:shirt.data.vertices[i].co.copy() for i in pairs}
        def score(delta):
            if any((rests[i]+delta-original[i]).length>.025 for i in pairs):return None
            for c in cache:
                for i in pairs:
                    p=c['matrices'][i%half]@(rests[i]+delta);h,n,_,_=c['body'].find_nearest(p)
                    if (p-h).dot(n)<-.00151:return None
            result=0
            for c in train:
                pts=[c['points'][i] for i in ids]
                for i in pairs:pts[mapping[i]]=c['matrices'][i%half]@(rests[i]+delta)
                result+=len(BVHTree.FromPolygons(pts,local_faces).overlap(c['coat']))
            return result,delta.length_squared
        best=Vector((0,0,0));best_score=score(best)
        if best_score is None or best_score[0]==0:continue
        initial=best_score
        for step in [.008,.003,.001]:
            center=best.copy()
            for xyz in itertools.product([-step,0,step],repeat=3):
                candidate=center+Vector(xyz);result=score(candidate)
                if result is not None and result<best_score:best=candidate;best_score=result
        if best_score[0]<initial[0]:
            for i in pairs:shirt.data.vertices[i].co=rests[i]+best
            for c in cache:
                for i in pairs:c['points'][i]=c['matrices'][i%half]@shirt.data.vertices[i].co
            changes.append({'pass':pass_index+1,'paired_vertex_group':pairs,'before_local_pairs':initial[0],'after_local_pairs':best_score[0],'additional_offset_m':list(best)})
            count+=1
    print('LAYER_SOLVER_GROUPS',len(groups),'adjusted',count,flush=True)
    return count

for pass_index in range(8):
    train=cache[::5] if pass_index==0 else cache
    problem=set()
    for c in train:
        for fi,_ in crossings(c):problem.update(i%half for i in faces[fi])
    print('LAYER_SOLVER_PASS',pass_index+1,'vertices',len(problem),flush=True)
    adjusted=0
    for seq,index in enumerate(sorted(problem)):
        pair=[index,index+half];related=[faces[i] for i in rings[index]]
        ids=sorted({i for f in related for i in f});mapping={i:j for j,i in enumerate(ids)}
        local_faces=[[mapping[i] for i in f] for f in related]
        current=shirt.data.vertices[index].co-original[index]
        def score(delta):
            # All-frame body constraint even when the first crossing pass trains sparsely.
            worst=1
            for c in cache:
                m=c['matrices'][index]
                for vi in pair:
                    p=m@(original[vi]+delta);hit,normal,_,_=c['body'].find_nearest(p)
                    worst=min(worst,(p-hit).dot(normal))
                    if worst<-.00151:return None
            count=0
            for c in train:
                pts=[c['points'][i] for i in ids];m=c['matrices'][index]
                for vi in pair:pts[mapping[vi]]=m@(original[vi]+delta)
                count+=len(BVHTree.FromPolygons(pts,local_faces).overlap(c['coat']))
            return (count,delta.length_squared)
        best=current.copy();best_score=score(best)
        if best_score is None:continue
        initial=best_score
        if best_score[0]==0:continue
        for step in [.010,.003,.001]:
            center=best.copy()
            for xyz in itertools.product([-step,0,step],repeat=3):
                candidate=center+Vector(xyz)
                if candidate.length>.025:continue
                result=score(candidate)
                if result is not None and result<best_score:best_score=result;best=candidate
        if best_score[0]<initial[0]:
            for vi in pair:shirt.data.vertices[vi].co=original[vi]+best
            for c in cache:
                for vi in pair:c['points'][vi]=c['matrices'][index]@shirt.data.vertices[vi].co
            changes.append({'pass':pass_index+1,'paired_vertices':pair,'before_local_pairs':initial[0],'after_local_pairs':best_score[0],'rest_offset_m':list(best)})
            adjusted+=1
        if seq%20==0:print('LAYER_SOLVER_PROGRESS',pass_index+1,seq+1,len(problem),'adjusted',adjusted,flush=True)
    if pass_index>=3 or not adjusted:adjusted+=repair_groups(train,pass_index)
    shirt.data.update();result=stats();history.append({'pass':pass_index+1,'adjusted_pairs':adjusted,**result});print('LAYER_SOLVER_RESULT',history[-1],flush=True)
    if result['total_pairs']==0 or not adjusted:break
report={'source':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'scope':'Conservative triangles include both quad diagonals. Greedy paired shirt-vertex crossing reduction, constrained by all-frame body vertex distances; no topology removal, body edits, garment masks or outer-outfit edits. Not a full collision/appearance acceptance.','thickness_before_max_m':max(thickness_before),'thickness_before_pairs_over_3mm':sum(d>.003 for d in thickness_before),'thickness_after_max_m':max((shirt.data.vertices[i].co-shirt.data.vertices[i+half].co).length for i in range(half)),'maximum_total_shirt_rest_change_m':max((v.co-source_shirt_points[i]).length for i,v in enumerate(shirt.data.vertices)),'before':before,'history':history,'changes':changes}
(OUT/(STEM+'-layer-repair.json')).write_text(json.dumps(report,indent=2)+'\n')
from repair_bomber_underarm import repair
underarm_report=repair(scene,body,rig,shirt,coat,conservative_triangles)
(OUT/(STEM+'-underarm-repair.json')).write_text(json.dumps(underarm_report,indent=2)+'\n')
scene.frame_set(1);bpy.context.view_layer.update();bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(STEM+'.blend')),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type in ['MESH','ARMATURE','EMPTY']:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/(STEM+'.glb')),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_skins=True,export_morph=False,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=True,export_optimize_animation_size=True)
camera=review.configure_scene();camera.data.type='ORTHO';scene.render.resolution_x=800;scene.render.resolution_y=960
for obj in bpy.data.objects:
    if obj.type=='MESH':obj.hide_render=obj.name.startswith('AvatarTop_')
for frame,label in [(1,'relaxed'),(31,'tpose'),(61,'reach'),(91,'crouch')]:
    scene.frame_set(frame);camera.data.ortho_scale=2.65 if frame==61 else 2.25
    for view,location in {'front':(0,-4,.93),'three-quarter':(2,-4,.93)}.items():
        camera.location=location;review.look_at(camera,Vector((0,0,.93)))
        scene.render.filepath=str(OUT/f'{STEM}-{label}-{view}.png');bpy.ops.render.render(write_still=True)
print('LAYER_CANDIDATE_EXPORTED',STEM)
