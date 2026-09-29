"""Refine head silhouettes from the retained motion-fitted sources.

Connection map: lens edges sit inside their 1.8 mm rim tubes; the bridge and
temple arms overlap the rims at shared endpoints. The small eyewear uses its
actual tube radii for joint overlap (a 5 mm overlap would engulf these parts).
Male ribbon roots are reattached to the measured scalp surface.
New rigid accessories are bound exclusively to the measured head transform.
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array, material, review
from complete_pair_geometry import Surface, create, join, tube
from add_launch_reference_details import rigid, ribbon, strand_mat
from refine_launch_faces import replace_posed


def bounds(ob):
    p = array(ob, True)
    assert np.isfinite(p).all()
    return {axis: [round(float(v), 6) for v in p[:, i][[p[:, i].argmin(), p[:, i].argmax()]]]
            for i, axis in enumerate('xyz')}


def sunglasses(surf, eye):
    old = bpy.data.objects['PLURR goggle lens']
    previous = array(old, True)
    width = float(np.ptp(previous[:, 0]))
    z = float((previous[:, 2].min() + previous[:, 2].max()) / 2)
    cy = float(previous[:, 1].min())
    for ob in list(bpy.data.objects):
        if ob.type == 'MESH' and ob.name.startswith('PLURR goggle'):
            bpy.data.objects.remove(ob, do_unlink=True)
    halfwidth = width * .46
    gap = width * .055
    lenswidth = halfwidth - gap
    centerx = (halfwidth + gap) / 2
    height = width * .112

    def position(x, h):
        return Vector((x, cy + .031 * (x / halfwidth) ** 2 + .30 * h,
                       z + h - .006 * (abs(x) / halfwidth) ** 2))

    # Portable, packed spectral tint: independent of generated coordinates.
    lensmat = material('PLURR split mirrored lenses', (.2, .03, .45), .15, .87)
    bs = lensmat.node_tree.nodes['Principled BSDF']
    bs.inputs['Coat Weight'].default_value = .55
    tex = bpy.data.images.new('PLURR sunglasses spectral tint', width=128, height=32, alpha=True)
    stops = np.array([[.62, .84, .018], [.23, .65, .025], [.12, .08, .75], [.68, .025, .65], [.025, .35, .80]])
    t = np.linspace(0, 4, 128)
    rgb = np.stack([np.interp(t, np.arange(5), stops[:, i]) for i in range(3)], axis=1)
    pixels = np.ones((32, 128, 4), np.float32)
    pixels[:, :, :3] = rgb[None, :, :] * np.linspace(.72, 1, 32)[:, None, None]
    tex.pixels.foreach_set(pixels.ravel()); tex.pack()
    node = lensmat.node_tree.nodes.new('ShaderNodeTexImage'); node.image = tex
    lensmat.node_tree.links.new(node.outputs['Color'], bs.inputs['Base Color'])
    dark = material('PLURR sunglass graphite frame', (.009, .012, .018), .3, .28)
    lime = material('PLURR sunglass lime edging', (.40, .68, .023), .34, .25)
    lensparts, rimparts, trimparts, arm_parts = [], [], [], []
    borders = []
    for sign in [-1, 1]:
        perimeter = []
        for a in np.linspace(0, math.tau, 49)[:-1]:
            # Rounded rectangular lens with an outer corner taper.
            u = math.copysign(abs(math.cos(a)) ** .60, math.cos(a))
            v = math.copysign(abs(math.sin(a)) ** .70, math.sin(a))
            x = sign * centerx + u * lenswidth / 2
            h = v * height * (1 - .13 * max(0, sign * u))
            perimeter.append(position(x, h))
        borders.append(perimeter)
        vertices = [position(sign * centerx, 0)] + perimeter
        faces = [(0, i + 1, (i + 1) % 48 + 1) for i in range(48)]
        uv = [((p.x + halfwidth) / (2 * halfwidth), (p.z - z + height + .006) / (2 * height + .006)) for p in vertices]
        lensparts.append((vertices, faces, uv))
        rimparts.append(tube(perimeter + [perimeter[0]], .0018, 8))
        # Fine lime stripe on the outer face, leaving a graphite rim visible.
        stripe = [p + Vector((0, -.0015, 0)) for p in perimeter]
        trimparts.append(tube(stripe + [stripe[0]], .00065, 6))
        outer = position(sign * halfwidth, 0)
        def scalp_anchor(y, h):
            hit, normal, _, _ = surf.tree.ray_cast(Vector((sign * .30, y, h)), Vector((-sign, 0, 0)))
            if hit is None:
                hit, normal, _, _ = surf.tree.find_nearest(Vector((sign * halfwidth, y, h)))
            assert hit is not None and hit.z > eye[2] + .03, (y, h)
            return hit + normal * .005
        arm_parts.append(tube([outer, Vector((sign * (halfwidth + .008), outer.y + .008, z - .005)),
                               scalp_anchor(.015, z - .012),
                               scalp_anchor(.05, z - .026)], .0022, 8))
    bridge = [position(-gap, .002), position(-gap * .55, .006), position(0, .008),
              position(gap * .55, .006), position(gap, .002)]
    arm_parts.append(tube(bridge, .0019, 8))
    output = {}
    for name, parts, mat in [('PLURR goggle lens', lensparts, lensmat),
                             ('PLURR goggle frame', rimparts, dark),
                             ('PLURR goggle edging', trimparts, lime),
                             ('PLURR goggle temples and bridge', arm_parts, dark)]:
        v, f, uv = join(parts)
        ob = create(name, v, f, mat, surf, weights=rigid(surf, v, 'head'), uv=uv,
                    slot='accessories', option='plurr-goggles', solid=.0006 if 'lens' in name else 0)
        bpy.context.view_layer.update()
        output[name] = bounds(ob)
    # Endpoint-to-rim centerline distance must be less than the combined radii.
    overlaps = [.0018 + .0019 - min((endpoint - p).length for p in border)
                for endpoint, border in zip([bridge[0], bridge[-1]], borders)]
    assert min(overlaps) > 0, overlaps
    return {'bounds': output, 'lensHeightMm': round(height * 2000, 2), 'bridgeGapMm': round(gap * 2000, 2),
            'minimumBridgeRimOverlapMm': round(min(overlaps) * 1000, 3)}


def swept_fringe(surf, eye):
    ob = bpy.data.objects['Luxury retained swept groom']
    p = array(ob, True); anchored = p.copy()
    scalp = Surface(surf.rig, bpy.data.objects['Complete scalp'])
    root_offsets=[]
    for offset in range(0,len(p),24):
        strand=anchored[offset:offset+24].reshape(12,2,3)
        root=strand[0].mean(axis=0)
        hit,normal,_,_=scalp.tree.find_nearest(Vector(root))
        delta=np.array(hit+normal*.0014)-root
        root_offsets.append(np.linalg.norm(delta))
        strand+=delta[None,None,:]*(1-np.linspace(0,1,12))[:,None,None]**3
    assert max(root_offsets)<.05,max(root_offsets)
    q = anchored.copy()
    rng = np.random.default_rng(90726)
    altered = 0
    for offset in range(0, len(p), 24):
        strand = anchored[offset:offset + 24].reshape(12, 2, 3)
        path = strand.mean(axis=1)
        # The preceding retained groom was shortened before this stage. Taper
        # every front ribbon, including the higher locks above the short side.
        if path[-1, 1] >= eye[1] + .028 or path[-1, 2] >= eye[2] + .115:
            continue
        # A continuous diagonal fringe line with a few longer tapered locks;
        # the short side opens the forehead and the long side sweeps left.
        side = np.clip((path[-1, 0] + .065) / .13, 0, 1)
        target_z = eye[2] + .014 + .054 * side + rng.uniform(-.015, .015)
        eligible = np.flatnonzero(path[:, 2] >= target_z)
        if not len(eligible):
            continue
        end = min(11., float(eligible[-1]) + .20)
        samples = np.linspace(0, end, 12)
        trimmed = np.empty_like(strand)
        for edge in range(2):
            for axis in range(3):
                trimmed[:, edge, axis] = np.interp(samples, np.arange(12), strand[:, edge, axis])
        t = np.linspace(0, 1, 12)
        ease = np.clip((t - .18) / .82, 0, 1) ** 2
        trimmed[:, :, 0] -= ((.018 + .007 * side) * ease)[:, None]
        trimmed[:, :, 1] += (.026 * ease)[:, None]
        trimmed[:, :, 2] += (.016 * np.sin(t * math.pi) ** 2)[:, None]
        # Re-taper the shortened ribbons. Interpolation alone retains the
        # original mid-strand width and produces visibly blunt fringe ends.
        mid=trimmed.mean(axis=1)
        half=(trimmed[:,1]-trimmed[:,0])*.5
        taper=(1-.96*t**3)/(1-.92*(samples/11)**4)
        half*=taper[:,None]
        width=np.linalg.norm(half,axis=1)
        desired=np.linalg.norm(half[0])*(1-.98*t**2.6)
        half*=np.minimum(1,desired/np.maximum(width,1e-9))[:,None]
        trimmed[:,0]=mid-half;trimmed[:,1]=mid+half
        q[offset:offset + 24] = trimmed.reshape(24, 3)
        altered += 1
    progress=(np.arange(len(q))//2%12)/11
    q[:,1]+=np.maximum(0,eye[1]-.017-q[:,1])*.65*progress**2
    scalp_top=float(scalp.array[:,2].max())
    for offset in range(0,len(q),24):
        strand=q[offset:offset+24].reshape(12,2,3);path=strand.mean(axis=1)
        root=path[0];t=np.linspace(0,1,12)
        free=np.clip((t-.12)/.88,0,1)**1.5
        # Nearby ribbons share a wave, while a second low-amplitude field
        # breaks the outer contour into separate swept locks.
        phase=math.sin(root[0]*125+root[1]*48)*2.1
        wave=np.sin(t*math.pi*1.6+phase)-math.sin(phase)
        strand[:,:,0]+=(.0065*wave*free)[:,None]
        strand[:,:,1]+=(.004*np.sin(t*math.pi*2.1+phase)*free)[:,None]
        roof_freedom=np.clip((t-.05)/.35,0,1);roof_freedom=roof_freedom**2*(3-2*roof_freedom)
        strand[:,:,2]-=np.maximum(0,strand[:,:,2]-(scalp_top-.004))*.55*roof_freedom[:,None]
    assert np.allclose(q.reshape(-1, 12, 2, 3)[:, 0], anchored.reshape(-1, 12, 2, 3)[:, 0])
    replace_posed(ob, q, surf)
    flyaways=bpy.data.objects['Polished male flyaways'];fp=array(flyaways,True);fq=fp.copy()
    fq[:,2]-=np.maximum(0,fq[:,2]-(scalp_top-.004))*.55
    for offset in range(0,len(fq),20):
        strand=fq[offset:offset+20].reshape(10,2,3);root=strand[0].mean(axis=0)
        hit,normal,_,_=scalp.tree.find_nearest(Vector(root))
        strand+=(np.array(hit+normal*.0014)-root)[None,None,:]*(1-np.linspace(0,1,10))[:,None,None]**2
    replace_posed(flyaways,fq,surf)
    finalroots=array(ob,True).reshape(-1,12,2,3)[:,0].mean(axis=1)
    root_distances=[scalp.tree.find_nearest(Vector(root))[3] for root in finalroots]
    assert max(root_distances)<.002,max(root_distances)
    return {'ribbonsRefined': altered, 'rootDisplacementMm': round(float(max(root_offsets)*1000),3),
            'reattachedFlyawayRibbons':len(fq)//20,'maximumFlyawayAdjustmentMm':float(np.linalg.norm(fq-fp,axis=1).max()*1000),
            'maximumRootScalpDistanceMm':round(float(max(root_distances)*1000),3),
            'maximumDisplacementMm': round(float(np.linalg.norm(q - p, axis=1).max() * 1000), 3), 'bounds': bounds(ob)}


def face_tendrils(surf, eye):
    count = 0
    for name in ['PLURR pony strands 0', 'PLURR pony strands 2']:
        ob = bpy.data.objects[name]
        p = array(ob, True); q = p.copy()
        parent = list(range(len(p)))
        def root(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for face in ob.data.polygons:
            first = root(face.vertices[0])
            for i in face.vertices[1:]:
                parent[root(i)] = first
        groups = {}
        for i in range(len(p)):
            groups.setdefault(root(i), []).append(i)
        for ids in groups.values():
            # Only the authored 17-sample face tendrils; scalp and pony ribbons
            # contain 13 and 18 samples and remain unchanged.
            if len(ids) != 34:
                continue
            original = p[ids].reshape(17, 2, 3)
            start = original[0].mean(0)
            sign = np.sign(start[0])
            end = original[-1].mean(0)
            offset = abs(start[0]) - .014
            p1 = np.array([sign * (.045 + offset * .25), eye[1] - .008, eye[2] + .052])
            p2 = np.array([sign * (.063 + offset * .15), eye[1] - .016, eye[2] - .036])
            p3 = np.array([sign * (.056 + offset * .35), eye[1] - .006, end[2]])
            path = []
            for t in np.linspace(0, 1, 17):
                path.append(start * (1-t)**3 + 3*p1*(1-t)**2*t + 3*p2*(1-t)*t*t + p3*t**3)
            v, _, _ = ribbon(path, .0022, Vector((0, -.028, eye[2] + .04)))
            v = np.asarray(v); v[:2] = original[0]
            q[ids] = v
            count += 1
        replace_posed(ob, q, surf)
    assert count == 36, count
    return {'tendrilsRefined': count, 'rootDisplacementMm': 0}


def fine_pony_cards(surf,core):
    core_surface=Surface(surf.rig,core);count=0;root_shift=0
    rng=np.random.default_rng(90908)
    for name in [f'PLURR pony strands {i}' for i in range(4)]:
        ob=bpy.data.objects[name];p=array(ob,True);parent=list(range(len(p)))
        def root(i):
            while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
            return i
        for face in ob.data.polygons:
            first=root(face.vertices[0])
            for i in face.vertices[1:]:parent[root(i)]=first
        groups={}
        for i in range(len(p)):groups.setdefault(root(i),[]).append(i)
        pieces=[]
        for ids in groups.values():
            rows=p[ids].reshape(-1,2,3);n=len(rows)
            if n!=18:
                faces=[(j*2,j*2+1,j*2+3,j*2+2) for j in range(n-1)]
                pieces.append((rows.reshape(-1,3),faces,[(u,j/(n-1)) for j in range(n) for u in [0,1]]))
                continue
            center=rows.mean(axis=1);half=(rows[:,1]-rows[:,0])*.5
            t=np.linspace(0,1,18)
            for fraction in [-.67,0,.67]:
                path=center+half*fraction
                hit,normal,_,_=core_surface.tree.find_nearest(Vector(path[0]))
                delta=np.array(hit+normal*.0013)-path[0];root_shift=max(root_shift,float(np.linalg.norm(delta)))
                path+=delta[None,:]*(1-t[:,None])**3
                path+=half*np.sin(t[:,None]*13+rng.uniform(0,math.tau))*.055*np.sin(t[:,None]*math.pi)
                v=np.stack([path-half*.18,path+half*.18],axis=1).reshape(-1,3)
                faces=[(j*2,j*2+1,j*2+3,j*2+2) for j in range(17)]
                pieces.append((v,faces,[(u,float(tt)) for tt in t for u in [0,1]]));count+=1
        mats=list(ob.data.materials);bpy.data.objects.remove(ob,do_unlink=True)
        v,f,uv=join(pieces)
        create(name,v,f,mats,surf,weights=rigid(surf,v,'head'),uv=uv,slot='hair',option='plurr-pony')
    return {'finePonyRibbons':count,'maximumRootReattachmentMm':root_shift*1000}


def pony_finish(surf):
    ob = bpy.data.objects['PLURR gathered pony bundle']
    p = array(ob, True)
    rings=p.reshape(-1,16,3).copy();centers=rings.mean(axis=1)
    cap=Surface(surf.rig,bpy.data.objects['Complete scalp'])
    cap_hit,cap_normal,_,_=cap.tree.find_nearest(Vector(centers[0]))
    root_delta=np.array(cap_hit+cap_normal*.007)-centers[0]
    assert np.linalg.norm(root_delta)<.055,root_delta
    progress=np.linspace(0,1,len(rings))
    rings+=root_delta[None,None,:]*(1-progress[:,None,None])**3
    centers=rings.mean(axis=1)
    gather=np.clip(progress/.30,0,1);gather=gather*gather*(3-2*gather)
    scale=(1-.65*gather)*(1-.50*progress**3)
    fitted=centers[:,None,:]+(rings-centers[:,None,:])*scale[:,None,None]
    replace_posed(ob,fitted.reshape(-1,3),surf)
    maximum_shrink=float(np.linalg.norm(fitted.reshape(-1,3)-p,axis=1).max()*1000)
    p=array(ob,True);rings=p.reshape(-1,16,3)
    mat=ob.data.materials[0].copy();ob.data.materials[0]=mat
    bs=mat.node_tree.nodes['Principled BSDF']
    for name,value in [('Base Color',(.012,.0007,.005,1)),('Roughness',.82),('Specular IOR Level',.16),('Metallic',0),('Coat Weight',0)]:
        for link in list(bs.inputs[name].links):mat.node_tree.links.remove(link)
        bs.inputs[name].default_value=value
    card_report=fine_pony_cards(surf,ob)
    parts=[];rng=np.random.default_rng(90907)
    for index in range(240):
        angle=index/240*16+rng.uniform(-.025,.025)
        i=math.floor(angle)%16;f=angle-math.floor(angle)
        path=rings[:,i]*(1-f)+rings[:,(i+1)%16]*f
        radial=path-centers;radial/=np.maximum(np.linalg.norm(radial,axis=1),1e-8)[:,None]
        path+=radial*.0013
        length=rng.uniform(.76,1);samples=np.linspace(0,(len(path)-1)*length,24)
        curve=np.stack([np.interp(samples,np.arange(len(path)),path[:,a]) for a in range(3)],axis=1)
        parts.append(ribbon(curve,float(rng.uniform(.0008,.0015)),Vector(centers[0])))
    v,f,uv=join(parts)
    fiber_mat=strand_mat('PLURR pony fine inner fibers',(.26,.004,.075))
    fiber_mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.63
    fibers=create('PLURR pony surface fibers',v,f,fiber_mat,surf,weights=rigid(surf,v,'head'),uv=uv,slot='hair',option='plurr-pony')
    assert len(p) == 24 * 16
    # Close the two pre-existing boundary rings without changing vertex order,
    # weights or the spatial field used by the secondary motion targets.
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    bm.faces.new([bm.verts[i] for i in reversed(range(16))])
    bm.faces.new([bm.verts[i] for i in range(len(p)-16, len(p))])
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    ring = p[:16]; center = ring.mean(0)
    hit, normal, _, _ = cap.tree.find_nearest(Vector(center))
    anchor = np.array(hit - normal * .005)
    direction = (center - anchor) / np.linalg.norm(center - anchor)
    endpoint = center + direction * .005
    base_vertices = []
    for t in np.linspace(0, 1, 6):
        c = anchor * (1-t) + endpoint * t
        base_vertices.extend(c + (ring-center) * (1.25 - .24*t))
    base_faces = [(j*16+i, j*16+(i+1)%16, (j+1)*16+(i+1)%16, (j+1)*16+i)
                  for j in range(5) for i in range(16)]
    base_uv = [(i/16, j/5) for j in range(6) for i in range(16)]
    rootmat = material('PLURR gathered dark pony roots', (.025, .008, .016), .68)
    base = create('PLURR gathered pony root', base_vertices, base_faces, rootmat, surf,
                  weights=rigid(surf, base_vertices, 'head'), uv=base_uv, slot='hair', option='plurr-pony')
    path = [Vector(center + (v-center) * 1.03) for v in ring]
    path.append(path[0])
    v, f, uv = tube(path, .0017, 8)
    mat = material('PLURR pony tie violet', (.17, .012, .30), .32, .18)
    tie = create('PLURR pony root tie', v, f, mat, surf, weights=rigid(surf, v, 'head'),
                 uv=uv, slot='accessories', option='plurr-pony-tie')
    bpy.context.view_layer.update()
    return {'closedBoundaryRings': 2, 'tieBounds': bounds(tie), 'rootBounds': bounds(base),
            'maximumCoreRefinementMm':maximum_shrink,'surfaceFiberRibbons':240,'surfaceFiberVertices':len(fibers.data.vertices),
            'fineCards':card_report,
            'rootRepositionMm':float(np.linalg.norm(root_delta)*1000),
            'scalpEmbedMm': 5, 'bundleOverlapMm': 5}


def run(sex, render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT / f'{sex}-motion-fitted.blend'))
    rig = bpy.data.objects['AvatarSkeleton']
    rig.data.pose_position = 'POSE'
    rig.animation_data.action = bpy.data.actions['idle']
    bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
    retained = {ob.name: array(ob).copy() for ob in bpy.context.scene.objects
                if ob.type == 'MESH' and ob.get('avatarSlot') in ['body', 'top', 'bottoms', 'jacket', 'shoes']}
    surf = Surface(rig, bpy.data.objects['AvatarBody'])
    eye = np.mean([array(bpy.data.objects['AvatarEye_' + side], True).mean(0) for side in ['l', 'r']], axis=0)
    report = swept_fringe(surf, eye) if sex == 'male' else sunglasses(surf, eye)
    if sex == 'female':
        report['faceTendrils'] = face_tendrils(surf, eye)
        report['ponyFinish'] = pony_finish(surf)
    for name, original in retained.items():
        assert np.array_equal(original, array(bpy.data.objects[name])), name
    report['unchangedBodyAndOutfitMeshes'] = len(retained)
    if sex == 'female':
        attachments = [ob for ob in bpy.context.scene.objects if ob.type == 'MESH'
                       and (ob.name.startswith('PLURR goggle') or ob.name in ['PLURR pony root tie', 'PLURR gathered pony root'])]
        baseline = None; maximum = 0
        for clip in ['idle', 'walk', 'run']:
            action = bpy.data.actions[clip]; rig.animation_data.action = action
            for frame in np.linspace(*action.frame_range, 9):
                bpy.context.scene.frame_set(int(frame), subframe=float(frame % 1)); bpy.context.view_layer.update()
                transform = (rig.matrix_world @ rig.pose.bones['head'].matrix
                             @ rig.data.bones['head'].matrix_local.inverted() @ rig.matrix_world.inverted()).inverted()
                local = {ob.name: np.array([list(transform @ Vector(p)) for p in array(ob, True)]) for ob in attachments}
                if baseline is None:
                    baseline = local
                maximum = max(maximum, max(float(np.linalg.norm(local[name]-baseline[name], axis=1).max()) for name in local))
        assert maximum < .00001, maximum
        report['rigidAttachmentSamples'] = 27
        report['maximumHeadRelativeDriftMm'] = round(maximum * 1000, 6)
        rig.animation_data.action = bpy.data.actions['idle']; bpy.context.scene.frame_set(1); bpy.context.view_layer.update()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f'{sex}-head-refined.blend'), compress=True)
    (OUT / f'{sex}-head-refinement.json').write_text(json.dumps(report, indent=2) + '\n')
    if render:
        scene = bpy.context.scene
        camera = review.configure_scene(); camera.data.type = 'ORTHO'; camera.data.ortho_scale = .38
        scene.view_settings.exposure = -.8
        scene.render.resolution_x = 760; scene.render.resolution_y = 850
        for label, x, y in [('front', .05, -4), ('oblique', 2.5, -4), ('side', 4, -.7)]:
            camera.location = (x, y, eye[2] + .04)
            review.look_at(camera, Vector((0, -.015, eye[2] + .015)))
            scene.render.filepath = str(OUT / f'{sex}-head-refined-{label}.png')
            bpy.ops.render.render(write_still=True)
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sex', required=True, choices=['male', 'female'])
    parser.add_argument('--render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    run(args.sex, args.render)
