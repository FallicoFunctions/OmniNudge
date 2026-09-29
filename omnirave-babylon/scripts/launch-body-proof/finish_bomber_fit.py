"""Search bounded local offsets for residual points, preserving paired fabric surfaces."""
import itertools,json
import bpy
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree


def finish(scene,body,rig,garments,out,stem="male-outfit01"):
    shells=[o for o in garments if o.name in ['Luxury_Bomber continuous shell','Luxury_Black shirt draft']]
    cache=[];bad={o.name:set() for o in shells}
    for frame in range(1,152):
        scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
        tree=BVHTree.FromObject(body,dg)
        transforms={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
        cache.append((tree,transforms))
        for obj in shells:
            e=obj.evaluated_get(dg);m=e.to_mesh();half=len(m.vertices)//2
            assert len(m.vertices)==len(obj.data.vertices) and len(m.vertices)%2==0
            for v in m.vertices:
                hit,normal,_,_=tree.find_nearest(v.co)
                if (v.co-hit).dot(normal)<-.0015:bad[obj.name].add(v.index%half)
            e.to_mesh_clear()
    reports=[]
    for obj in shells:
        half=len(obj.data.vertices)//2
        for index in sorted(bad[obj.name]):
            pair=[obj.data.vertices[index],obj.data.vertices[index+half]]
            # Solidify duplicates each weighted surface vertex. Move both sides together.
            assert [(g.group,g.weight) for g in pair[0].groups]==[(g.group,g.weight) for g in pair[1].groups]
            transforms=[]
            for tree,bones in cache:
                matrix=Matrix(((0,0,0,0),)*4)
                for g in pair[0].groups:matrix+=bones[obj.vertex_groups[g.group].name]*g.weight
                transforms.append((tree,matrix))
            def worst(delta):
                value=1
                for tree,matrix in transforms:
                    for v in pair:
                        p=matrix@(v.co+delta);h,n,_,_=tree.find_nearest(p);value=min(value,(p-h).dot(n))
                return value
            zero=Vector((0,0,0));best=zero;before=worst(zero);score=(max(0,-.0015-before),0)
            for step in [.015,.005,.002]:
                center=best.copy()
                for xyz in itertools.product([-step,0,step],repeat=3):
                    delta=center+Vector(xyz)
                    if delta.length>.030:continue
                    depth=worst(delta);candidate=(max(0,-.0015-depth),delta.length)
                    if candidate<score:score=candidate;best=delta
            after=worst(best)
            for v in pair:v.co+=best
            reports.append({'mesh':obj.name,'paired_vertices':[index,index+half],'before_worst_m':before,'after_worst_m':after,'rest_offset_m':list(best)})
        obj.data.update()
    (out/(stem+'-local-fit.json')).write_text(json.dumps({'scope':'Local paired-vertex search across 151 frames, 30 mm maximum extra offset; no body edits or masks. Whole-source validation remains separate.','repairs':reports},indent=2)+'\n')
    print('LOCAL_FIT',reports,flush=True)
