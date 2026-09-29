"""Bounded rest-space garment fitting against the complete, unmasked animated body."""
import json
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def fit(scene, body, rig, garments, out):
    original={o.name:[v.co.copy() for v in o.data.vertices] for o in garments}
    history=[]
    for iteration in range(7):
        count=0;limited=0;deepest=0
        for frame in range(1,152,5 if iteration<5 else 1):
            scene.frame_set(frame);bpy.context.view_layer.update()
            dg=bpy.context.evaluated_depsgraph_get();tree=BVHTree.FromObject(body,dg)
            transforms={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
            for obj in garments:
                evaluated=obj.evaluated_get(dg);mesh=evaluated.to_mesh()
                points=[v.co.copy() for v in mesh.vertices];evaluated.to_mesh_clear()
                for i,p in enumerate(points):
                    hit,normal,_,_=tree.find_nearest(p);signed=(p-hit).dot(normal)
                    if signed>=.001:continue
                    vertex=obj.data.vertices[i];matrix=Matrix(((0,0,0,0),)*4)
                    for group in vertex.groups:
                        name=obj.vertex_groups[group.group].name
                        if name in transforms:matrix+=transforms[name]*group.weight
                    influence={obj.vertex_groups[g.group].name:g.weight for g in vertex.groups}
                    arm=sum(w for n,w in influence.items() if n.startswith('upperarm_'))
                    torso=sum(w for n,w in influence.items() if n.startswith('spine_'))
                    axilla=arm>.08 and torso>.05 and 1.2<p.z<1.5
                    # At the arm/torso pinch, nearest-normal projection oscillates
                    # between two opposing surfaces. Route the fold fore/aft instead.
                    outward=Vector((0,-1 if p.y<-.025 else 1,0)) if axilla and iteration>=5 and signed<-.001 else normal
                    delta=matrix.to_3x3().inverted_safe()@(outward*(.002-signed))
                    target=vertex.co+delta
                    limit=.065 if 'continuous shell' in obj.name else .025 if 'shirt' in obj.name else .008
                    if axilla:limit=.080
                    if (target-original[obj.name][i]).length>limit:
                        limited+=1;continue
                    vertex.co=target;count+=1;deepest=min(deepest,signed)
                obj.data.update()
        history.append({'iteration':iteration+1,'adjustments':count,'limit_rejections':limited,'deepest_adjusted_distance_m':deepest})
        print('BOMBER_FIT_ITERATION',history[-1],flush=True)
        if not count and iteration>=5:break
    shifts={name:max((v.co-original[name][i]).length for i,v in enumerate(bpy.data.objects[name].data.vertices)) for name in original}
    (out/'male-outfit01-fit.json').write_text(json.dumps({'scope':'31 initial poses, then 151 integer training frames; validation independently reopens the saved source. No body masks or body edits.', 'history':history,'max_rest_displacement_m':shifts},indent=2)+'\n')
