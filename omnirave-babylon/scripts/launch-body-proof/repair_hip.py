"""Bounded local correction for body03's diagnosed female trouser hip point.

Connection map: change one vertex of the existing continuous garment, retaining
every face and bone weight. The complete body is untouched. Test the same point
through all 151 saved animation frames before publishing the local correction.
"""
from pathlib import Path
import bpy
import json
from mathutils.bvhtree import BVHTree

OUT = Path(__file__).resolve().parents[2] / 'assets-src/avatars/launch-body-proof'


def repair():
    body = bpy.data.objects['AvatarBody']
    garment = bpy.data.objects['AvatarBottoms_tech-joggers']
    vertex = garment.data.vertices[81]
    original = vertex.co.copy()
    assert -.20 < original.x < -.12 and .85 < original.z < 1.02
    results = []
    accepted = False
    for delta in [0, -.008, -.012, -.016]:
        vertex.co = original
        vertex.co.x += delta
        garment.data.update()
        worst = 1
        for frame in range(1, 152):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            dg = bpy.context.evaluated_depsgraph_get()
            tree = BVHTree.FromObject(body, dg)
            obj = garment.evaluated_get(dg)
            mesh = obj.to_mesh()
            p = body.matrix_world.inverted() @ garment.matrix_world @ mesh.vertices[81].co
            hit, normal, _, _ = tree.find_nearest(p)
            worst = min(worst, (p - hit).dot(normal))
            obj.to_mesh_clear()
        results.append({'rest_delta_x_m': delta, 'minimum_signed_distance_m': worst})
        if worst >= -.0015:
            accepted = True
            break
    if not accepted:
        vertex.co = original
        garment.data.update()
        raise RuntimeError(f'Local hip correction did not meet its point clearance criterion: {results}')
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    (OUT / 'female-body03-hip-correction.json').write_text(json.dumps({
        'point_acceptance_depth_m': .0015, 'whole_garment_diagnostic_depth_m': .002,
        'vertex': 81, 'original_rest': list(original), 'trials': results,
        'scope': 'single diagnosed garment point; whole-garment validation still required'
    }, indent=2) + '\n')
    print('HIP_POINT_CORRECTION', results)


if __name__ == '__main__':
    bpy.ops.wm.open_mainfile(filepath=str(OUT / 'female-review03.blend'))
    repair()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'female-review03.blend'), compress=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.objects:
        if obj.type in ['MESH', 'ARMATURE', 'EMPTY']:
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / 'female-body03.glb'), export_format='GLB',
        use_selection=True, export_extras=True, export_yup=True, export_skins=True,
        export_morph=False, export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_frame_range=True, export_optimize_animation_size=True)
