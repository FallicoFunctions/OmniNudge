"""Fit the female swept hairline to the visible forehead in the reference.

Connection map: retained scalp follows the actual head with 2.5 mm clearance;
the existing swept ribbons follow that same surface and keep their root centers
1.4 mm above the scalp. These are thin hair layers, not structural overlaps.
Both meshes remain rigidly bound to the existing head bone. The gathered pony,
goggles, face, clothing, hardware and every other mesh stay fixed.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array
from complete_pair_geometry import Surface
from refine_complete_foil_finish import geometry_contract
from refine_launch_faces import replace_posed
from refine_complete_surfaces import set_value

PASS = OUT / 'visual-reference-pass-20260911'
NAMES = ['Complete scalp', 'PLURR swept scalp groom']


def normals(ob):
    return np.array([list(v.normal) for v in ob.data.vertices])


def hair_finish():
    """Dark brown fibers with a feathered boundary on the retained scalp UVs."""
    cap = bpy.data.objects[NAMES[0]].data.materials[0]
    groom = bpy.data.objects[NAMES[1]].data.materials[0]
    values = {}
    for mat, color, rough, spec in [(cap, (.024, .011, .006), .50, .26), (groom, (.032, .015, .008), .43, .32)]:
        set_value(mat, 'Base Color', (*color, 1))
        set_value(mat, 'Roughness', rough); set_value(mat, 'Specular IOR Level', spec)
        values[mat.name] = {'baseColor': [*color, 1], 'roughness': rough, 'specular': spec*2}
    size = 2048
    v, u = np.mgrid[0:size, 0:size].astype(np.float32)
    u = (u+.5)/size; v = (v+.5)/size
    sweep = .16*(1-v)+.08*np.sin(math.pi*v)
    phase = 2*math.pi*450*(u+sweep)
    fibers = .5+.5*np.cos(phase)
    fringe = .990+.006*(.5+.5*np.sin(2*math.pi*841*u+.7*np.sin(u*math.tau*17)))
    alpha = np.clip((fringe-v)/.003, 0, 1)
    rgba = np.ones((size, size, 4), np.float32)
    rgba[:, :, :3] = (.65+.35*fibers)[:, :, None]
    rgba[:, :, 3] = alpha
    # Groove normals modulate highlights; colors contain no baked illumination.
    groove = -.10*np.sin(phase)
    slope = (-.16+.08*math.pi*np.cos(math.pi*v))*4.8
    normal = np.stack([groove, slope*groove, np.ones_like(groove)], axis=2)
    normal /= np.linalg.norm(normal, axis=2)[:, :, None]
    normal_rgba = np.ones_like(rgba); normal_rgba[:, :, :3] = normal*.5+.5
    tree=cap.node_tree; bs=tree.nodes['Principled BSDF']
    for label, pixels, linear in [('fibers', rgba, False), ('normal', normal_rgba, True)]:
        name='female-reference-scalp-'+label
        image=bpy.data.images.new(name,size,size,alpha=True)
        if linear: image.colorspace_settings.name='Non-Color'
        image.pixels.foreach_set(pixels.ravel()); image.update()
        image.filepath_raw=str(OUT/(name+'.png')); image.file_format='PNG'; image.save(); image.pack()
        tex=tree.nodes.new('ShaderNodeTexImage'); tex.image=image
        if linear:
            node=tree.nodes.new('ShaderNodeNormalMap'); node.uv_map='UVMap'
            tree.links.new(tex.outputs['Color'],node.inputs['Color']); tree.links.new(node.outputs['Normal'],bs.inputs['Normal'])
            values[cap.name]['normalTexture']=name+'.png'
        else:
            mix=tree.nodes.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1
            mix.inputs[1].default_value=(*values[cap.name]['baseColor'][:3],1)
            tree.links.new(tex.outputs['Color'],mix.inputs[2]); tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
            cut=tree.nodes.new('ShaderNodeMath'); cut.operation='GREATER_THAN'; cut.inputs[1].default_value=.45
            tree.links.new(tex.outputs['Alpha'],cut.inputs[0]); tree.links.new(cut.outputs[0],bs.inputs['Alpha'])
            cap.surface_render_method='DITHERED'
            values[cap.name]['colorTexture']=name+'.png'; values[cap.name]['alphaCutoff']=.45
    return values


def fit(source_suffix):
    source = PASS / 'hair-before/female-runtime.blend' if source_suffix == 'baseline' else OUT / f'female-{source_suffix}.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    assert not any(bpy.data.objects[name].get('launchReferenceHairline') for name in NAMES), 'Use the retained baseline or a fresh build, not an already fitted hairline'
    rig = bpy.data.objects['AvatarSkeleton']
    rig.data.pose_position = 'POSE'; rig.animation_data.action = bpy.data.actions['idle']
    scene.frame_set(1); bpy.context.view_layer.update()
    for ob in scene.objects:
        if ob.type == 'MESH' and ob.data.shape_keys:
            for key in ob.data.shape_keys.key_blocks[1:]:
                if key.name.startswith(('Expression_', 'Secondary_')):
                    key.value = 0
    bpy.context.view_layer.update()
    retained = {o.name: geometry_contract(o) for o in scene.objects if o.type == 'MESH' and o.name not in NAMES}
    body = Surface(rig, bpy.data.objects['AvatarBody'])
    eye = np.mean([array(bpy.data.objects['AvatarEye_' + side], True).mean(0) for side in ['l', 'r']], axis=0)
    center = np.array([0, -.028, eye[2] + .039])
    report = {'source': str(source.relative_to(OUT)), 'changedMeshes': {}, 'preservedMeshes': retained,
              'hairlineExtensionRadians': .25, 'preservedSkeleton': True}
    mapping = {}
    for name in NAMES:
        ob = bpy.data.objects[name]
        assert not ob.data.shape_keys, 'The swept scalp must have no secondary-motion shapes'
        before = array(ob).copy(); before_normals = normals(ob)
        posed = array(ob, True); revised = posed.copy()
        for i, point in enumerate(posed):
            delta = point-center; theta = math.atan2(delta[0], -delta[1])
            front = max(0., math.cos(theta))
            if front <= 1e-8:
                continue
            phi = math.acos(float(np.clip(delta[2]/np.linalg.norm(delta), -1, 1)))
            end = 1.18 + 1.02 * ((1-math.cos(theta))*.5)**.8 + .06*math.sin(theta*3)**2
            extension = .25 * front**3 * (1 + .30*math.sin(theta)) * min(1., phi/end)**2
            new_phi = phi + extension
            direction = Vector((math.sin(new_phi)*math.sin(theta), -math.sin(new_phi)*math.cos(theta), math.cos(new_phi)))
            hit, normal, _, _ = body.tree.ray_cast(Vector(center)+direction*.35, -direction, .70)
            assert hit is not None
            old_hit, old_normal, _, _ = body.tree.find_nearest(Vector(point))
            clearance = max(.0025, (Vector(point)-old_hit).dot(old_normal))
            revised[i] = np.array(hit+normal*clearance)
        if name == NAMES[1]:
            # Reattach the two-sided ribbon root pairs to the reshaped cap.
            scalp = Surface(rig, bpy.data.objects[NAMES[0]])
            ribbons = revised.reshape(-1, 24, 2, 3)
            for ribbon in ribbons:
                midpoint = ribbon[0].mean(0)
                hit, normal, _, _ = scalp.tree.find_nearest(Vector(midpoint))
                ribbon[0] += np.array(hit+normal*.0014)-midpoint
        replace_posed(ob, revised, body)
        bpy.context.view_layer.update()
        after = array(ob); after_normals = normals(ob)
        assert np.isfinite(after).all() and np.isfinite(after_normals).all()
        clearance = []
        for point in array(ob, True):
            hit, normal, _, _ = body.tree.find_nearest(Vector(point))
            clearance.append((Vector(point)-hit).dot(normal))
        assert min(clearance) > .001, (name, min(clearance))
        report['changedMeshes'][name] = {'vertices': len(before), 'maximumMovementMm': float(np.linalg.norm(after-before, axis=1).max()*1000),
            'minimumHeadClearanceMm': min(clearance)*1000, 'bounds': [after.min(0).tolist(), after.max(0).tolist()]}
        # Local Blender coordinates map to glTF's Y-up basis without reskinning.
        convert = lambda p: np.stack([p[:,0], p[:,2], -p[:,1]], axis=1).tolist()
        mapping[name] = {'before': convert(before), 'after': convert(after), 'beforeNormals': convert(before_normals), 'afterNormals': convert(after_normals)}
        if name == NAMES[0]:
            layer=ob.data.uv_layers['UVMap']; vertex_uv=np.zeros((len(before),2),np.float32)
            for polygon in ob.data.polygons:
                for li in polygon.loop_indices:
                    vertex_uv[ob.data.loops[li].vertex_index]=layer.data[li].uv[:]
            mapping[name]['uv'] = np.stack([vertex_uv[:,0], 1-vertex_uv[:,1]],axis=1).tolist()
            # Unwrap the closing column instead of interpolating across the
            # whole atlas on the triangles that cross its periodic seam.
            for polygon in ob.data.polygons:
                values=[layer.data[li].uv.x for li in polygon.loop_indices]
                if max(values)-min(values)>.5:
                    for li in polygon.loop_indices:
                        if layer.data[li].uv.x<.5: layer.data[li].uv.x+=1
        ob['launchReferenceHairline'] = '20260913'
    assert retained == {o.name: geometry_contract(o) for o in scene.objects if o.type == 'MESH' and o.name not in NAMES}
    report['materials'] = hair_finish()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'female-hairline-refined.blend'), compress=True)
    (PASS/'hairline-native-validation.json').write_text(json.dumps(report, indent=2)+'\n')
    (PASS/'hairline-vertex-mapping.json').write_text(json.dumps(mapping)+'\n')
    print('HAIRLINE_REFINED', json.dumps(report['changedMeshes']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-suffix', default='baseline')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    fit(args.source_suffix)
