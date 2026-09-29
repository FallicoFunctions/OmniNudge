"""Add bounded coat ease over the shirt; independent crossing validation is required."""
import bpy,json
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

def fit_layers(scene,coat,shirt,rig,out,stem):
    half=len(coat.data.vertices)//2;original=[v.co.copy() for v in coat.data.vertices];history=[]
    for iteration in range(3):
        count=0;limited=0
        for frame in range(1,152,5):
            scene.frame_set(frame);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
            ev=shirt.evaluated_get(dg);mesh=ev.to_mesh();n=len(mesh.vertices)//2
            tree=BVHTree.FromPolygons([v.co.copy() for v in mesh.vertices],[list(f.vertices) for f in mesh.polygons if all(i<n for i in f.vertices)]);ev.to_mesh_clear()
            ev=coat.evaluated_get(dg);mesh=ev.to_mesh();points=[v.co.copy() for v in mesh.vertices];ev.to_mesh_clear()
            bones={b.name:b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
            for i in range(half):
                p=(points[i]+points[i+half])*.5;hit,normal,_,distance=tree.find_nearest(p);signed=(p-hit).dot(normal)
                if distance>.035 or signed>=.004 or signed<-.025:continue
                vertex=coat.data.vertices[i];matrix=Matrix(((0,0,0,0),)*4)
                for group in vertex.groups:matrix+=bones[coat.vertex_groups[group.group].name]*group.weight
                delta=matrix.to_3x3().inverted_safe()@(normal*(.005-signed))
                if (vertex.co+delta-original[i]).length>.030:limited+=1;continue
                vertex.co+=delta;coat.data.vertices[i+half].co+=delta;count+=1
            coat.data.update()
        history.append({'iteration':iteration+1,'paired_adjustments':count,'limit_rejections':limited})
        print('LAYER_FIT_ITER',history[-1],flush=True)
        if not count:break
    (out/(stem+'-layer-fit.json')).write_text(json.dumps({'scope':'Bounded 30 mm coat-ease trial on 31 poses. Does not establish collision-free layers; independent layer/body checks required.','history':history,'maximum_rest_offset_m':max((v.co-original[i]).length for i,v in enumerate(coat.data.vertices))},indent=2)+'\n')
