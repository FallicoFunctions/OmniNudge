"""Refine complete outfit fit and bake portable finish maps on retained UVs.

Creases are tangent-space detail located from the posed joints. Covered shirt
and crop faces are trimmed; female cuffs, socks and hood are fitted across the
three clips. Existing corrective deltas are preserved when moving their bases.
The body and source copies remain unchanged.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array, review
from complete_pair_geometry import skin_weights
import audit_rigged_jacket_sleeves as A
from complete_pair_geometry import smooth, Surface, create, tube


class Field:
    def __init__(self, mat):
        self.tree = mat.node_tree
        self.position = self.tree.nodes.new('ShaderNodeNewGeometry').outputs['Position']

    def input(self, socket, value):
        if isinstance(value, (int, float)):
            socket.default_value = float(value)
        else:
            self.tree.links.new(value, socket)

    def math(self, op, a, b=0):
        n = self.tree.nodes.new('ShaderNodeMath'); n.operation = op
        self.input(n.inputs[0], a); self.input(n.inputs[1], b)
        return n.outputs[0]

    def dot(self, origin, direction):
        n = self.tree.nodes.new('ShaderNodeVectorMath'); n.operation = 'DOT_PRODUCT'
        self.tree.links.new(self.position, n.inputs[0]); n.inputs[1].default_value = direction
        return self.math('SUBTRACT', n.outputs['Value'], float(np.dot(origin, direction)))

    def gaussian(self, value, width):
        t = self.math('DIVIDE', value, width)
        return self.math('EXPONENT', self.math('MULTIPLY', self.math('MULTIPLY', t, t), -1))

    def ridge(self, center, across, along, normal, width, length, depth, amplitude):
        d = self.dot(center, across)
        l = self.dot(center, along)
        # A gently curved crease dies out before it can form a uniform ring.
        d = self.math('ADD', d, self.math('MULTIPLY', self.math('MULTIPLY', l, l), 1.6))
        peak = self.gaussian(d, width)
        trough = self.gaussian(self.math('ADD', d, width * 1.8), width * .7)
        profile = self.math('SUBTRACT', peak, self.math('MULTIPLY', trough, .38))
        envelope = self.math('MULTIPLY', self.gaussian(l, length), self.gaussian(self.dot(center, normal), depth))
        return self.math('MULTIPLY', self.math('MULTIPLY', profile, envelope), amplitude)

    def noise(self, scale):
        n = self.tree.nodes.new('ShaderNodeTexNoise')
        self.tree.links.new(self.position, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = 2
        n.inputs['Roughness'].default_value = .6
        return n.outputs['Fac']


def set_value(mat, name, value):
    bs = mat.node_tree.nodes['Principled BSDF']
    socket = bs.inputs.get(name)
    if socket is None:
        return
    for link in list(socket.links):
        mat.node_tree.links.remove(link)
    socket.default_value = value


def crease_specs(ob, rig):
    specs = []
    slot = ob.get('avatarSlot')
    if slot == 'jacket':
        for side, sign in [('l', 1), ('r', -1)]:
            elbow = np.array(rig.pose.bones['lowerarm_' + side].head)
            wrist = np.array(rig.pose.bones['lowerarm_' + side].tail)
            axis = (wrist-elbow) / np.linalg.norm(wrist-elbow)
            front = np.array([0., -1., 0.])
            along = np.cross(axis, front); along /= np.linalg.norm(along)
            for i, t in enumerate([-.080, -.038, .005, .041, .080, .122]):
                center = elbow + axis*t + front*.035
                direction = axis + along * ([.23, -.32, .42, -.22, .30, -.16][i])
                direction /= np.linalg.norm(direction)
                specs.append((center, direction, along, front, .0034+(i%3)*.0007, .052, .045, .0011+(i%2)*.0005))
        p = array(ob, True)
        z = float(np.quantile(p[:, 2], .1)) + .024
        for sign in [-1, 1]:
            for i in range(3):
                specs.append((np.array([sign*(.085+i*.024), -.060, z+i*.021]),
                              np.array([sign*.36, 0., .93]), np.array([.93, 0., -sign*.36]),
                              np.array([0., -1., 0.]), .0035, .045, .065, .0010))
    elif slot == 'bottoms' and ob.name == 'AvatarBottoms_cargo-pants':
        for side, sign in [('l', 1), ('r', -1)]:
            knee = np.array(rig.pose.bones['calf_' + side].head)
            ankle = np.array(rig.pose.bones['calf_' + side].tail)
            front = np.array([0., -1., 0.])
            for i, dz in enumerate([-.095, -.053, -.016, .026, .067]):
                slope = [sign*.25, -sign*.34, sign*.17, -sign*.38, sign*.25][i]
                direction = np.array([slope, 0., 1.]); direction /= np.linalg.norm(direction)
                along = np.array([1., 0., -slope]); along /= np.linalg.norm(along)
                specs.append((knee + np.array([0., -.032, dz]), direction, along, front,
                              .0045, .050, .07, .0007+(i%2)*.0003))
            for i in range(3):
                specs.append((ankle + np.array([0., -.015, .065+i*.026]),
                              np.array([sign*.27, 0., .96]), np.array([.96, 0., -sign*.27]), front,
                              .0032, .055, .06, .0012))
    return specs


def bake(ob, mat, label, socket=None, normal=False, size=2048, linear=False, background=None):
    scene = bpy.context.scene
    bpy.ops.object.select_all(action='DESELECT'); ob.hide_set(False); ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    assert ob.data.uv_layers, ob.name
    uvname = ob.data.uv_layers.active.name
    img = bpy.data.images.new(f'{label}', size, size, alpha=False)
    if normal or linear or label.endswith('film'):
        img.colorspace_settings.name = 'Non-Color'
    if background is not None:
        # A physically valid scalar background prevents subpixel UV slivers
        # that miss the bake raster from becoming zero-roughness pinholes.
        pixels=np.full((size*size,4),background,np.float32);pixels[:,3]=1
        img.pixels.foreach_set(pixels.ravel());img.update()
    target = mat.node_tree.nodes.new('ShaderNodeTexImage'); target.image = img
    mat.node_tree.nodes.active = target
    temporary = []
    for other in ob.data.materials:
        if other and other != mat:
            n = other.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img
            other.node_tree.nodes.active = n; temporary.append((other, n))
    out = next(n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
    old = out.inputs['Surface'].links[0].from_socket
    if not normal:
        emit = mat.node_tree.nodes.new('ShaderNodeEmission')
        mat.node_tree.links.new(socket, emit.inputs['Color'])
        mat.node_tree.links.new(emit.outputs[0], out.inputs['Surface'])
    print('SURFACE_BAKE', label, flush=True)
    thickness = [(mod, mod.show_viewport, mod.show_render) for mod in ob.modifiers if mod.type == 'SOLIDIFY']
    for mod, _, _ in thickness:
        mod.show_viewport = False; mod.show_render = False
    bpy.ops.object.bake(type='NORMAL' if normal else 'EMIT', use_clear=background is None, margin=12,
                        **({'normal_space': 'TANGENT'} if normal else {}))
    for mod, viewport, render in thickness:
        mod.show_viewport = viewport; mod.show_render = render
    if not normal:
        mat.node_tree.links.new(old, out.inputs['Surface']); mat.node_tree.nodes.remove(emit)
    for other, n in temporary:
        other.node_tree.nodes.remove(n)
    if normal:
        # Degenerate/mirrored UV slivers can yield back-facing tangent normals
        # even when the outer shell is baked alone. These shallow height fields
        # cannot legitimately point below the tangent plane; use the geometric
        # normal for those texels and their one-pixel filtering border.
        pixels = np.empty(size*size*4, np.float32); img.pixels.foreach_get(pixels)
        pixels = pixels.reshape(size, size, 4)
        invalid = pixels[:, :, 2] < .5
        count = int(invalid.sum())
        if count:
            pad = np.pad(invalid, 1)
            repair = np.logical_or.reduce([pad[y:y+size, x:x+size] for y in range(3) for x in range(3)])
            pixels[repair, :3] = (.5, .5, 1.)
            img.pixels.foreach_set(pixels.ravel()); img.update()
        img['repairedBackFacingTexels'] = count
        print('NORMAL_HEMISPHERE_REPAIR', label, count, flush=True)
    img.filepath_raw = str(OUT / f'{label}.png'); img.file_format = 'PNG'; img.save(); img.pack()
    uv = mat.node_tree.nodes.new('ShaderNodeUVMap'); uv.uv_map = uvname
    mat.node_tree.links.new(uv.outputs['UV'], target.inputs['Vector'])
    return target, uvname


def surface(ob, sex, rig):
    specs = crease_specs(ob, rig)
    results = []
    for i, original in enumerate(list(ob.data.materials)):
        name = original.name.lower()
        textile = any(k in name for k in ['pearl bomber', 'iridescent foil', 'cargo fabric', 'pocket fabric', 'splattered nylon', 'black shirt satin', 'crop stretch'])
        if not textile:
            continue
        mat = original.copy(); ob.data.materials[i] = mat
        bs = mat.node_tree.nodes['Principled BSDF']; f = Field(mat)
        foil = 'iridescent foil' in name
        bomber = 'pearl bomber' in name
        prefix = f'{sex}-finish-{ob.name.replace(" ", "_")}-{i}'
        height = f.math('MULTIPLY', f.math('SUBTRACT', f.noise(420 if bomber else 280), .5), .000075)
        for spec in specs:
            height = f.math('ADD', height, f.ridge(*spec))
        bump = mat.node_tree.nodes.new('ShaderNodeBump')
        bump.inputs['Distance'].default_value = 1
        bump.inputs['Strength'].default_value = .82
        mat.node_tree.links.new(height, bump.inputs['Height'])
        # Replace earlier baked normals: they included the reverse side of the
        # thickness shell on shared UVs and contain inverted texel patches.
        mat.node_tree.links.new(bump.outputs['Normal'], bs.inputs['Normal'])
        if foil:
            # A dyed foil substrate carries the reference's purple/pink/cyan color
            # even under a neutral studio probe; the coating adds view-dependent
            # interference above it. Both use the same broad surface field.
            ramp = mat.node_tree.nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.interpolation = 'B_SPLINE'
            stops = [(.15,(.19,.13,.26,1)),(.36,(.38,.14,.23,1)),
                     (.51,(.25,.16,.31,1)),(.67,(.12,.29,.29,1)),(.86,(.34,.15,.27,1))]
            for index,(position,color) in enumerate(stops):
                element = ramp.color_ramp.elements[index] if index < 2 else ramp.color_ramp.elements.new(position)
                element.position = position; element.color = color
            mat.node_tree.links.new(f.noise(8), ramp.inputs['Fac'])
            color_tex, _ = bake(ob, mat, prefix+'-color', ramp.outputs['Color'], size=2048 if ob.name == 'Structured armhole jacket' else 1024)
            mat.node_tree.links.new(color_tex.outputs['Color'], bs.inputs['Base Color'])
            set_value(mat, 'Metallic', .48); set_value(mat, 'Roughness', .18)
            set_value(mat, 'Coat Weight', .62); set_value(mat, 'Coat Roughness', .16)
            # Thickness follows a gentle material field and local crease strain.
            film = f.math('ADD', .23, f.math('MULTIPLY', f.noise(8), .55))
            film = f.math('ADD', film, f.math('MULTIPLY', height, 85))
            film = f.math('MINIMUM', 1, f.math('MAXIMUM', 0, film))
            filmtex, _ = bake(ob, mat, prefix+'-film', film, size=1024)
            mat['launchFilmTexture'] = prefix+'-film.png'
            mat['launchFilmMinimumNm'] = 180.; mat['launchFilmMaximumNm'] = 620.
            mat['launchFilmIOR'] = 1.65; mat['launchFilmIntensity'] = 1.
            remap = mat.node_tree.nodes.new('ShaderNodeMapRange')
            remap.inputs['To Min'].default_value = 180
            remap.inputs['To Max'].default_value = 620
            mat.node_tree.links.new(filmtex.outputs['Color'], remap.inputs['Value'])
            mat.node_tree.links.new(remap.outputs['Result'], bs.inputs['Thin Film Thickness'])
            set_value(mat, 'Thin Film IOR', 1.65)
        elif bomber:
            if bs.inputs['Base Color'].is_linked:
                tint = mat.node_tree.nodes.new('ShaderNodeMixRGB'); tint.blend_type = 'MULTIPLY'
                tint.inputs[0].default_value = 1; tint.inputs[2].default_value = (.74, .70, .62, 1)
                mat.node_tree.links.new(bs.inputs['Base Color'].links[0].from_socket, tint.inputs[1])
                tex, _ = bake(ob, mat, prefix+'-color', tint.outputs[0])
                mat.node_tree.links.new(tex.outputs['Color'], bs.inputs['Base Color'])
            set_value(mat, 'Roughness', .27); set_value(mat, 'Sheen Weight', .18)
            set_value(mat, 'Coat Weight', .16); set_value(mat, 'Coat Roughness', .20)
        else:
            set_value(mat, 'Roughness', .51 if ob.get('avatarSlot') == 'bottoms' else .45)
            set_value(mat, 'Specular IOR Level', .28)
            set_value(mat, 'Sheen Weight', .10)
        tex, uvname = bake(ob, mat, prefix+'-normal', normal=True,
                           size=2048 if ob.name in ['Structured armhole jacket','AvatarBottoms_cargo-pants'] else 512)
        n = mat.node_tree.nodes.new('ShaderNodeNormalMap'); n.uv_map = uvname
        mat.node_tree.links.new(tex.outputs['Color'], n.inputs['Color'])
        mat.node_tree.links.new(n.outputs['Normal'], bs.inputs['Normal'])
        mat['launchSurfaceRefined'] = True
        mat['launchSheenWeight'] = float(bs.inputs['Sheen Weight'].default_value)
        results.append({'material': mat.name, 'creaseFields': len(specs), 'normalImage': tex.image.name,
                        'repairedBackFacingTexels': int(tex.image.get('repairedBackFacingTexels', 0)),
                        'iridescentThickness': foil})
    return results


def tucked_shirt(scene):
    belt = bpy.data.objects['Launch cargo belt']
    cut = float(array(belt, True)[:, 2].min()) + .009
    result = {}
    for name in ['AvatarTop_tailored', 'Shirt detail - center placket']:
        ob = bpy.data.objects[name]
        posed = array(ob, True)
        # Thickness adds vertices only in evaluation. Use the skin-only vertex
        # order when deciding which original faces lie under the waistband.
        mods = [(m, m.show_viewport) for m in ob.modifiers if m.type != 'ARMATURE']
        for m, _ in mods: m.show_viewport = False
        bpy.context.view_layer.update(); posed = array(ob, True)
        remove = [p.index for p in ob.data.polygons if min(posed[i, 2] for i in p.vertices) < cut]
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.faces[i] for i in remove], context='FACES_ONLY')
        bm.to_mesh(ob.data); bm.free(); ob.data.update()
        for m, state in mods: m.show_viewport = state
        result[name] = {'removedCoveredFaces': len(remove), 'waistCutM': cut}
    for ob in list(scene.objects):
        if ob.type == 'MESH' and ob.name.startswith('Shirt detail - button') and array(ob, True)[:, 2].max() < cut + .025:
            ob.hide_render = True
    return result


def covered_crop_sides():
    ob = bpy.data.objects['Launch fitted crop top']
    mods = [(m, m.show_viewport) for m in ob.modifiers if m.type != 'ARMATURE']
    for m, _ in mods: m.show_viewport = False
    bpy.context.view_layer.update(); p = array(ob, True)
    # The radial body projection reached the upper arms. Those lateral upper
    # faces are permanently covered by this complete outfit's jacket.
    cut = float(np.max(p[np.abs(p[:, 0]) < .045, 2])) - .075
    remove = [f.index for f in ob.data.polygons
              if any(abs(p[i, 0]) > .125 and p[i, 2] > cut for i in f.vertices)]
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in remove], context='FACES_ONLY')
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    for m, state in mods: m.show_viewport = state
    return {'removedCoveredFaces': len(remove), 'sideCutHeightM': cut}


def posed_offset(ob, rig, delta):
    names = [b.name for b in rig.data.bones]
    weights = skin_weights(ob, names)
    mats = np.asarray([rig.matrix_world @ rig.pose.bones[n].matrix @ rig.data.bones[n].matrix_local.inverted() @ rig.matrix_world.inverted() for n in names])
    skin = np.einsum('vg,gij->vij', weights, mats)
    local = np.linalg.solve(skin[:, :3, :3], delta[..., None])[:, :, 0]
    original = array(ob)
    if ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:
            values = np.array([v.co[:] for v in key.data])
            key.data.foreach_set('co', (values + local).astype(np.float32).ravel())
    ob.data.vertices.foreach_set('co', (original + local).astype(np.float32).ravel())
    ob.data.update(); bpy.context.view_layer.update()


def tailored_cuffs(rig):
    ob = bpy.data.objects['AvatarBottoms_cargo-pants']
    p = array(ob, True); q = p.copy()
    # Gather the ankle cloth around the measured sock rather than leaving the
    # old boot-length front flaps. Fade into the retained calf silhouette.
    for side, sign in [('l', 1), ('r', -1)]:
        sock = array(bpy.data.objects['Launch neon sock ' + side], True)
        center = (sock.min(0) + sock.max(0)) * .5
        ids = np.flatnonzero((p[:, 0] * sign > 0) & (p[:, 2] < .33))
        d = p[ids, :2] - center[:2]
        angle = np.arctan2(d[:, 0] / .048, -d[:, 1] / .055)
        target = np.c_[center[0] + .048 * np.sin(angle), center[1] - .055 * np.cos(angle)]
        blend = smooth((.33 - p[ids, 2]) / .075)
        q[ids, :2] += (target - p[ids, :2]) * blend[:, None]
        q[ids, 2] += (.235 + (p[ids, 2] - .225)*.35 - p[ids, 2]) * smooth((.29 - p[ids, 2]) / .045)
    posed_offset(ob, rig, q - p)
    return {'adjustedVertices': int(np.count_nonzero(np.linalg.norm(q-p,axis=1)>.000001)),
            'maximumAdjustmentMm': float(np.linalg.norm(q-p,axis=1).max()*1000)}


def sock_finish(rig):
    body = Surface(rig, bpy.data.objects["AvatarBody"])
    report={}
    for side in ['l', 'r']:
        ob = bpy.data.objects['Launch neon sock ' + side]
        before=len(ob.data.vertices)
        bm=bmesh.new();bm.from_mesh(ob.data)
        bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
        bm.to_mesh(ob.data);bm.free();ob.data.update()
        mods = [(m, m.show_viewport) for m in ob.modifiers if m.type != 'ARMATURE']
        for m, _ in mods: m.show_viewport = False
        bpy.context.view_layer.update(); p = array(ob, True); q = p.copy()
        calf = rig.pose.bones['calf_' + side]
        for i, v in enumerate(p):
            t = (v[2] - calf.head.z) / (calf.tail.z - calf.head.z)
            center = calf.head.lerp(calf.tail, t); center.z = v[2]
            direction = Vector((v[0]-center.x, v[1]-center.y, 0)).normalized()
            hit, normal, _, distance = body.tree.ray_cast(center, direction, .12)
            if hit is not None:
                angle = math.atan2(direction.y, direction.x)
                height=v[2];amount=.0035+.00035*math.cos(angle*32)
                # Slouch folds vary around the ankle; each grows outwards
                # from the body and fades before entering the shoe collar.
                for j,z in enumerate([.181,.198,.216,.233]):
                    phase=height-z-.0035*math.sin(angle*(1+j%2)+j*1.4)
                    amount+=(.0032 if j%2 else .0042)*math.exp(-(phase/.0038)**2)*(.65+.35*math.cos(angle-j)**2)
                q[i] = np.asarray(hit + normal * amount)
        weights = body.weights_at(q); bind = body.bind(q, weights)
        ob.data.vertices.foreach_set('co', bind.astype(np.float32).ravel())
        for group in ob.vertex_groups: group.remove(list(range(len(p))))
        for j,name in enumerate(body.names):
            group = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
            for i in np.flatnonzero(weights[:,j] > 0): group.add([int(i)], float(weights[i,j]), 'REPLACE')
        ob.data.update()
        for m,state in mods: m.show_viewport=state
        mat = ob.data.materials[0].copy(); ob.data.materials[0] = mat
        mat.name = 'PLURR ' + side + ' ribbed sock fabric'
        for key,value in [('Metallic',0),('Roughness',.82),('Coat Weight',0),('Specular IOR Level',.18),('Sheen Weight',.2)]:
            set_value(mat,key,value)
        set_value(mat,'Emission Strength',0)
        mat['launchSheenWeight'] = .2
        report[side]={'verticesBefore':before,'verticesAfter':len(p),'slouchFolds':4,'maximumBodyOffsetMm':7.7}
    return report


def fit_lower_finish(scene, rig):
    objects = [bpy.data.objects[n] for n in ['AvatarBottoms_cargo-pants','Launch neon sock l','Launch neon sock r'] if n in bpy.data.objects]
    selected = {o.name: array(o, True)[:len(o.data.vertices), 2] < .35 for o in objects}
    mods = [(m,m.show_viewport) for o in objects for m in o.modifiers if m.type != 'ARMATURE']
    for m,_ in mods: m.show_viewport=False
    history=[]
    for iteration in range(10):
        count=0;deepest=0
        for clip in ['idle','walk','run']:
            rig.animation_data.action=bpy.data.actions[clip]
            for frame in np.linspace(*rig.animation_data.action.frame_range,9):
                A.sample(scene,float(frame))
                p,f=A.H.geometry(bpy.data.objects['AvatarBody']);tree=BVHTree.FromPolygons(p,f,all_triangles=True)
                for ob in objects:
                    q=array(ob,True);delta=np.zeros_like(q)
                    for i in np.flatnonzero(selected[ob.name]):
                        hit,n,_,_=tree.find_nearest(Vector(q[i]));signed=(Vector(q[i])-hit).dot(n)
                        if signed<.0025:
                            delta[i]=np.asarray(n)*min(.010,.0035-signed);count+=1;deepest=min(deepest,signed)
                    if np.any(delta):posed_offset(ob,rig,delta)
        history.append({'iteration':iteration+1,'adjustedVertexSamples':count,'deepestBeforeAdjustmentMm':deepest*1000})
        print('LOWER_FIT',history[-1],flush=True)
        if count==0:break
    assert history[-1]['adjustedVertexSamples']==0, 'Lower garment fit did not converge'
    for m,state in mods:m.show_viewport=state
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1.)
    return history


def fit_hood(scene, rig, fixed_vertices=None):
    fixed_vertices = set(fixed_vertices or [])
    coat = bpy.data.objects['Structured armhole jacket']
    objects = [bpy.data.objects['PLURR folded hood']]
    names = [b.name for b in rig.data.bones]
    weights = {o.name: skin_weights(o, names) for o in objects}
    neighbours={}
    for ob in objects:
        edges=np.array([list(e.vertices) for e in ob.data.edges]);a=np.r_[edges[:,0],edges[:,1]];b=np.r_[edges[:,1],edges[:,0]]
        neighbours[ob.name]=(a,b,np.bincount(a,minlength=len(ob.data.vertices)))
    mods = [(m, m.show_viewport) for ob in [coat, *objects] for m in ob.modifiers if m.type != 'ARMATURE']
    for m, _ in mods: m.show_viewport = False
    history=[]
    for iteration in range(12):
        count=0; deepest=0
        for clip in ['idle','walk','run']:
            rig.animation_data.action=bpy.data.actions[clip]
            for frame in np.linspace(*rig.animation_data.action.frame_range,9):
                A.sample(scene,float(frame))
                p,f=A.H.geometry(coat);tree=BVHTree.FromPolygons(p,f,all_triangles=True)
                mats=np.asarray([rig.matrix_world@rig.pose.bones[n].matrix@rig.data.bones[n].matrix_local.inverted()@rig.matrix_world.inverted() for n in names])
                bounds=np.asarray(p);lo,hi=bounds.min(0),bounds.max(0)
                for ob in objects:
                    posed=array(ob,True);delta=np.zeros_like(posed)
                    for i,q in enumerate(posed):
                        if i in fixed_vertices:continue
                        if np.any(q<lo) or np.any(q>hi):continue
                        hit,normal,_,distance=tree.find_nearest(Vector(q))
                        signed=(Vector(q)-hit).dot(normal)
                        if distance<.030 and signed<.0025:
                            delta[i]=np.asarray(normal)*min(.006,.003-signed)
                            count+=1;deepest=max(deepest,-signed)
                    if not np.any(delta):continue
                    a,b,degree=neighbours[ob.name]
                    for _ in range(2):
                        average=np.zeros_like(delta);np.add.at(average,a,delta[b]);average/=np.maximum(degree,1)[:,None]
                        delta=.5*delta+.5*average
                        if fixed_vertices:delta[list(fixed_vertices)]=0
                    skin=np.einsum('vg,gij->vij',weights[ob.name],mats)
                    local=np.linalg.solve(skin[:,:3,:3],delta[...,None])[:,:,0]
                    if ob.data.shape_keys:
                        for key in ob.data.shape_keys.key_blocks:
                            values=np.array([v.co[:] for v in key.data]);key.data.foreach_set('co',(values+local).astype(np.float32).ravel())
                    ob.data.vertices.foreach_set('co',(array(ob)+local).astype(np.float32).ravel());ob.data.update()
        history.append({'iteration':iteration+1,'adjustments':count,'deepestPenetrationMm':round(deepest*1000,3)})
        if not count:break
    assert count==0,history[-1]
    rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(1);bpy.context.view_layer.update()
    # Sew the binding to the fitted hood edge instead of pushing the two
    # objects independently and opening gaps between them.
    hood=objects[0];old=bpy.data.objects['PLURR hood binding'];mat=old.data.materials[0]
    hood_surface=Surface(rig,hood);path=array(hood,True).reshape(9,60,3)[-1]
    vertices,faces,uv=tube(path,.0022,6)
    bpy.data.objects.remove(old,do_unlink=True)
    binding=create('PLURR hood binding',vertices,faces,mat,hood_surface,uv=uv,slot='jacket',option='plurr-foil')
    binding['outfitDetailCarrier']=hood.name
    history[-1]['bindingRebuiltOnFittedEdge']=True
    for m,state in mods:m.show_viewport=state
    bpy.context.view_layer.update()
    return history


def run(sex, render, drape_refined=False, silhouette_refined=False):
    source='silhouette-refined' if silhouette_refined else 'drape-refined' if drape_refined else 'head-refined'
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f'{sex}-{source}.blend'))
    scene = bpy.context.scene; rig = bpy.data.objects['AvatarSkeleton']
    rig.animation_data.action = bpy.data.actions['idle']; scene.frame_set(1); bpy.context.view_layer.update()
    hood = fit_hood(scene,rig) if sex == 'female' else []
    cuffs = tailored_cuffs(rig) if sex == 'female' else {}
    from refine_complete_lower_forms import lower_trousers
    lower_forms=lower_trousers(rig,sex)
    socks=sock_finish(rig) if sex == 'female' else {}
    lower_fit = fit_lower_finish(scene,rig)
    original = {ob.name: array(ob).copy() for ob in scene.objects if ob.type == 'MESH'}
    hem = tucked_shirt(scene) if sex == 'male' else {}
    crop = covered_crop_sides() if sex == 'female' else {}
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 1
    report = {}
    for ob in list(scene.objects):
        if ob.type == 'MESH' and ob.get('avatarSlot') in ['jacket','bottoms','top']:
            result = surface(ob, sex, rig)
            if result:
                report[ob.name] = result
    for name, points in original.items():
        assert np.array_equal(points, array(bpy.data.objects[name])), name
    if crop: report['coveredCropSides'] = crop
    if cuffs: report['tailoredCuffs'] = cuffs
    report['lowerForms']=lower_forms
    if socks:report['slouchSocks']=socks
    if lower_fit: report['lowerFinishFit'] = lower_fit
    if hem:
        report['shirtHem'] = hem
    if hood:
        report['hoodFit'] = hood
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{sex}-surface-refined.blend'), compress=True)
    (OUT / f'{sex}-surface-refinement.json').write_text(json.dumps(report, indent=2)+'\n')
    if render:
        cam = review.configure_scene(); cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.25
        scene.view_settings.exposure = -.8; scene.render.resolution_x = 850; scene.render.resolution_y = 1000
        cam.location = (.65, -4, 1.2); review.look_at(cam, Vector((0, -.01, 1.0)))
        scene.render.filepath = str(OUT / f'{sex}-surface-refined.png'); bpy.ops.render.render(write_still=True)
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--sex', choices=['male','female'], required=True)
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--drape-refined', action='store_true')
    parser.add_argument('--silhouette-refined', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:]); run(args.sex, args.render, args.drape_refined, args.silhouette_refined)
