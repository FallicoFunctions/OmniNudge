"""Rebuild the current male study from fit05 without intermediate blend files.

Connection map: inherited continuous body/rig retained; scalp roots embedded
0.6 mm; close undercoat and curl root regions overlap; all groom objects attach
to the existing head bone with explicit world-rest matrices. This reproduces
an unaccepted likeness study, not a production avatar.
"""
import argparse, json, math, os, random, sys, tempfile
from contextlib import contextmanager
from pathlib import Path
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/astra-male-proof'

def grow_undercoat():
    for ob in bpy.data.objects:
        if ob.name.startswith(('Proof_Hair', 'AvatarHair')):
            ob.hide_render = True
    bpy.data.objects['AvatarEyelashes'].hide_render = True
    scene = bpy.context.scene
    body = bpy.data.objects['AvatarBody']
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    center = Vector((0, -.045, 1.651))
    rng = random.Random(912)
    strands = [[] for _ in range(5)]
    root_errors = []

    def surface(n):
        hit, normal, _, _ = bvh.ray_cast(center + n * .3, -n, .4)
        if hit is None:
            raise RuntimeError('Scalp ray missed the head')
        return hit, normal

    for i in range(23000):
        theta = rng.uniform(-math.pi, math.pi)
        # Hairline lifts above the forehead and temples, tapering to the nape.
        end = 1.16 + .99 * ((1 - math.cos(theta)) * .5) ** .72
        phi = math.acos(rng.uniform(math.cos(end), 1))
        n = Vector((math.sin(phi)*math.sin(theta), -math.sin(phi)*math.cos(theta), math.cos(phi)))
        root, _ = surface(n)
        top = max(0, min(1, (root.z - 1.672) / .045))
        front = max(0, min(1, (-root.y + .005) / .14))
        left = root.x < -.012
        length = rng.uniform(.065, .105) if top > .2 else rng.uniform(.036, .064)
        # Nearby roots share a wave; each strand has small independent variations.
        phase = 9 * theta + 7 * phi
        amp = (.008 + .010 * top) * rng.uniform(.8, 1.2)
        independent = rng.random() * math.tau
        points = []
        steps = 38
        for j in range(steps + 1):
            t = j / steps
            p, normal = surface(n)
            lift = -.0006 * (1-t)**12 + (.003 + amp) * math.sin(math.pi*t)**.85
            lift += .0035 * math.sin(t*math.tau*1.5 + phase) * math.sin(math.pi*t)
            # The side flow follows the skull; longer top hairs sweep leftward.
            axis = Vector((-1.1*top, .30 + .25*(1-front), -.55*(1-top)-.24*t))
            if top < .2:
                axis.x = -.16 if left else .13
            tangent = axis - n * axis.dot(n)
            if tangent.length < .01:
                tangent = Vector((-1, .15, 0))
            tangent.normalize()
            across = n.cross(tangent).normalized()
            curl = (.003 + .004*top) * math.sin(t*8 + phase) * math.sin(math.pi*t)
            jitter = .00045 * math.sin(t*26 + independent) * math.sin(math.pi*t)
            points.append(p + normal*lift + across*(curl+jitter))
            n = (n + tangent*(length / steps / .095)).normalized()
        root_errors.append((points[0]-root).length)
        highlighted = front > .6 and top > .3 and math.sin(phase) > .5
        shade = rng.choices(range(5), [7, 5, 2, .5, .08] if not highlighted else [3, 4, 3, 1.5, .3])[0]
        strands[shade].append((points, rng.uniform(.000032, .000060)))

    all_points = []
    for shade, entries in enumerate(strands):
        cu = bpy.data.hair_curves.new('ScalpFieldStrands' + str(shade))
        cu.add_curves([len(points) for points, _ in entries])
        positions, radii = [], []
        for points, radius in entries:
            for j, p in enumerate(points):
                positions.extend(p)
                all_points.append(p)
                radii.append(radius * max(.025, (1-j/(len(points)-1))**.45))
        cu.attributes['position'].data.foreach_set('vector', positions)
        cu.attributes.new('radius', 'FLOAT', 'POINT').data.foreach_set('value', radii)
        mat = bpy.data.materials.new('ScalpFieldPigment' + str(shade))
        mat.use_nodes = True
        tree = mat.node_tree
        bs = tree.nodes.new('ShaderNodeBsdfHairPrincipled')
        bs.parametrization = 'MELANIN'
        bs.inputs['Melanin'].default_value = [.96, .90, .80, .65, .48][shade]
        bs.inputs['Melanin Redness'].default_value = .2
        bs.inputs['Tint'].default_value = (.24, .19, .15, 1)
        bs.inputs['Roughness'].default_value = .38
        bs.inputs['Radial Roughness'].default_value = .4
        tree.links.new(bs.outputs[0], tree.nodes['Material Output'].inputs['Surface'])
        cu.materials.append(mat)
        ob = bpy.data.objects.new('Proof_ScalpField' + str(shade), cu)
        scene.collection.objects.link(ob)
        ob.parent = bpy.data.objects['AvatarSkeleton']
        ob.parent_type = 'BONE'
        ob.parent_bone = 'head'
        bpy.context.view_layer.update()
        ob.matrix_world.identity()


def prepare_undercoat():
    for ob in bpy.data.objects:
        if not ob.name.startswith('Proof_ScalpField'):continue
        pos=ob.data.attributes['position'].data;rad=ob.data.attributes['radius'].data
        for j,point in enumerate(pos):
            q=point.vector
            if q.y<-.105 and q.z<1.678:rad[j].value=0
            else:rad[j].value*=.80
    scene=bpy.context.scene;tree=BVHTree.FromObject(bpy.data.objects['AvatarBody'],bpy.context.evaluated_depsgraph_get())
    center=Vector((0,-.045,1.651));changed=0
    for ob in bpy.data.objects:
        if not ob.name.startswith('Proof_ScalpField'):continue
        for curve in ob.data.curves:
            points=curve.points
            for j,pt in enumerate(points):
                q=pt.position.copy();n=(q-center).normalized()
                hit,normal,_,_=tree.ray_cast(center+n*.3,-n,.4)
                if hit is None:continue
                clearance=-.0006 if j==0 else .0015
                pt.position=hit+normal*clearance;changed+=1

def build_curls():
    rng=random.Random(918);scene=bpy.context.scene
    for ob in bpy.data.objects:
        if ob.name.startswith('Proof_Curl13_'):ob.hide_render=True
    body=bpy.data.objects['AvatarBody'];tree=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
    p=json.loads((OUT/'landmarks/fit05-deformation.json').read_text())['pose']
    yaw,pitch,roll=p['yaw'],p['pitch'],p['roll'];scale=p['pixels_per_meter']
    r=Vector((math.cos(yaw),math.sin(yaw),0));u=Vector((-math.sin(pitch)*math.sin(yaw),math.sin(pitch)*math.cos(yaw),math.cos(pitch)))
    right=r*math.cos(roll)+u*math.sin(roll);down=r*math.sin(roll)-u*math.cos(roll)
    outward=right.cross(-down).normalized();center=Vector(p['center'])
    def base(x,y):return center+right*((x-p['translation'][0])/scale)+down*((y-p['translation'][1])/scale)
    def scalp_depth(x,y):
        q=base(x,y);hit,_,_,_=tree.ray_cast(q+outward*.35,-outward,.7)
        if hit is not None:return (hit-q).dot(outward),True
        # Outside the scalp silhouette, carry the closest projected surface depth
        # rather than moving the guide toward a guessed ellipsoid.
        for dist in [2,4,8,12,18,26,36,50]:
            hits=[]
            for j in range(16):
                angle=j*math.tau/16;v=base(x+dist*math.cos(angle),y+dist*math.sin(angle))
                h,_,_,_=tree.ray_cast(v+outward*.35,-outward,.7)
                if h is not None:hits.append((h-v).dot(outward))
            if hits:return max(hits),False
        raise RuntimeError('No nearby scalp depth')
    colors=[(.009,.005,.003),(.019,.010,.006),(.037,.022,.011),(.076,.047,.022),(.15,.097,.045)]
    mats=[]
    for i,color in enumerate(colors):
        mat=bpy.data.materials.new('Curl18Pigment'+str(i));mat.use_nodes=True
        bs=mat.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*color,1)
        bs.inputs['Roughness'].default_value=.50;bs.inputs['Specular IOR Level'].default_value=.22
        mats.append(mat)
    # Keep the measured root coverage, but clip unwanted forehead fuzz and thin it.
    for ob in bpy.data.objects:
        if not ob.name.startswith('Proof_ScalpField'):continue
        shade=int(ob.name[-1]);ob.data.materials.clear();ob.data.materials.append(mats[shade])
        pos=ob.data.attributes['position'].data;rad=ob.data.attributes['radius'].data
        for j,point in enumerate(pos):
            q=point.vector
            if q.y<-.105 and q.z<1.678:rad[j].value=0
            else:rad[j].value*=.80

    def cat(knots,t):
        f=min(t*(len(knots)-1),len(knots)-1-1e-7);j=int(f);s=f-j
        a=knots[max(0,j-1)];b=knots[j];c=knots[min(len(knots)-1,j+1)];d=knots[min(len(knots)-1,j+2)]
        return .5*(2*b+(-a+c)*s+(2*a-5*b+4*c-d)*s*s+(-a+3*b-3*c+d)*s*s*s)
    groups=[[] for _ in colors];root_report=[]
    guides=json.loads((OUT/'landmarks/hair-guide-traces.json').read_text())['guides']
    for g in guides:
        # Three neighboring curl paths distribute coverage through volume.
        for layer in range(3):
            knots=[];depths=[]
            for j,(x,y,_) in enumerate(g['knots']):
                x+=rng.uniform(-2.5,2.5);y+=rng.uniform(-2,2)
                depth,on_head=scalp_depth(x,y);t=j/(len(g['knots'])-1)
                lift=-.0006 if j==0 else .007+.014*math.sin(math.pi*t)+layer*.004
                knots.append(base(x,y)+outward*(depth+lift));depths.append((depth,on_head))
            root_report.append({'guide':g['name'],'layer':layer,'root_hit':depths[0][1]})
            # Depth is smoothed without changing the reference trace's image plane.
            for j in range(1,len(knots)-1):
                old=(knots[j]-center).dot(outward)
                avg=((knots[j-1]+knots[j+1])*.5-center).dot(outward)
                knots[j]+=outward*((avg-old)*.3)
            steps=52;centers=[cat(knots,j/steps) for j in range(steps+1)];frames=[];prev=None
            for j,c in enumerate(centers):
                tangent=(centers[min(steps,j+1)]-centers[max(0,j-1)]).normalized()
                a=tangent.cross(outward).normalized()
                if a.length<.1:a=right.copy()
                if prev is not None and a.dot(prev)<0:a=-a
                frames.append((a,a.cross(tangent).normalized()));prev=a
            width=g['width']/scale*(1.3 if g['width']>4 else .7)
            for strand in range(850):
                angle=rng.random()*math.tau;rad=math.sqrt(rng.random());a=math.cos(angle)*rad*width;b=math.sin(angle)*rad*width*.55
                phase=rng.random()*math.tau;pts=[];tip=rng.uniform(.76,1)
                root_jitter=right*rng.gauss(0,.003)+down*rng.gauss(-.003,.003)
                for j,(c,(side,normal)) in enumerate(zip(centers,frames)):
                    t=j/steps
                    if t>tip:break
                    spread=.85+.15*math.sin(math.pi*t*.85)
                    curl=.0016*math.sin(t*17+phase)*math.sin(math.pi*t)
                    pts.append(c+side*(a*spread+curl)+normal*(b*spread+curl*.5)+root_jitter*(1-t)**3)
                shade=rng.choices(range(5),[5,6,3,1,.1] if g['shade']<2 else [2,3,4,2,.4])[0]
                # Attach each strand individually; its root may be wider than the guide.
                q=pts[0];hit,_,_,_=tree.ray_cast(q+outward*.12,-outward,.24)
                if hit is not None:
                    delta=hit-outward*.0006-q
                    for k in range(min(12,len(pts))):pts[k]+=delta*(1-k/12)**2
                groups[shade].append((pts,rng.uniform(.000030,.000058)))
    # Inferred side/back volume: true 3D guides rooted on the evaluated skull.
    headcenter=Vector((0,-.045,1.651))
    def head_surface(n):
        hit,normal,_,_=tree.ray_cast(headcenter+n*.3,-n,.4)
        if hit is None:raise RuntimeError('Back scalp miss')
        return hit,normal
    for guide in range(150):
        th=rng.uniform(.9,math.tau-.9);ph=rng.uniform(.25,1.4)
        length=rng.uniform(.45,.9);centers=[];normals=[]
        for j in range(39):
            t=j/38;phi=ph+min(length,1.95-ph)*t;theta=th+.20*math.sin(t*3)
            n=Vector((math.sin(phi)*math.sin(theta),-math.sin(phi)*math.cos(theta),math.cos(phi)))
            hit,normal=head_surface(n)
            if hit.z<1.59:break
            lift=-.0006*(1-t)**12+(.012+.014*math.sin(guide*1.7)**2)*math.sin(math.pi*t)**.8
            centers.append(hit+normal*lift);normals.append(normal)
        if len(centers)!=39:continue
        for strand in range(100):
            a=rng.uniform(-.008,.008);b=rng.uniform(-.003,.003);phase=rng.random()*math.tau;points=[]
            tip=rng.uniform(.8,1)
            for j,(c,normal) in enumerate(zip(centers,normals)):
                t=j/38
                if t>tip:break
                tangent=(centers[min(38,j+1)]-centers[max(0,j-1)]).normalized();across=tangent.cross(normal).normalized()
                points.append(c+across*(a+.001*math.sin(t*15+phase)*math.sin(math.pi*t))+normal*b*math.sin(math.pi*t))
            shade=rng.choices(range(5),[8,5,2,.3,.05])[0]
            groups[shade].append((points,rng.uniform(.000032,.000057)))
    # Thin dark scalp surface prevents skin showing through sparse root intervals.
    verts=[];faces=[]
    for j in range(36):
        for i in range(120):
            theta=i*math.tau/120;end=1.16+.99*((1-math.cos(theta))*.5)**.72
            end-=.23*math.exp(-((min(abs(theta-math.pi*.5),abs(theta-math.pi*1.5)))/.4)**2)
            phi=.001+(end-.001)*j/35
            n=Vector((math.sin(phi)*math.sin(theta),-math.sin(phi)*math.cos(theta),math.cos(phi)))
            hit,normal=head_surface(n);verts.append(hit+normal*.00025)
    for j in range(35):
        for i in range(120):faces.append((j*120+i,j*120+(i+1)%120,(j+1)*120+(i+1)%120,(j+1)*120+i))
    mesh=bpy.data.meshes.new('Scalp18Surface');mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new('Proof_Scalp18Surface',mesh);scene.collection.objects.link(ob)
    mat=mats[0].copy();mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85
    mat.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value=.04;mesh.materials.append(mat)
    for face in mesh.polygons:face.use_smooth=True
    ob.parent=bpy.data.objects['AvatarSkeleton'];ob.parent_type='BONE';ob.parent_bone='head'
    bpy.context.view_layer.update();ob.matrix_world.identity()

    for shade,entries in enumerate(groups):
        cu=bpy.data.hair_curves.new('Curl18Strands'+str(shade));cu.add_curves([len(pts) for pts,_ in entries])
        positions=[];radii=[]
        for pts,radius in entries:
            for j,q in enumerate(pts):positions.extend(q);radii.append(radius*min(1,.15+j*.25)*max(.012,(1-j/(len(pts)-1))**.7))
        cu.attributes['position'].data.foreach_set('vector',positions)
        cu.attributes.new('radius','FLOAT','POINT').data.foreach_set('value',radii);cu.materials.append(mats[shade])
        ob=bpy.data.objects.new('Proof_Curl18_'+str(shade),cu);scene.collection.objects.link(ob)
        ob.parent=bpy.data.objects['AvatarSkeleton'];ob.parent_type='BONE';ob.parent_bone='head'
        bpy.context.view_layer.update();ob.matrix_world.identity()

def refine_face():
    body=bpy.data.objects['AvatarBody']
    key=body.shape_key_add(name='Jaw_mouth_relaxation_19',from_mix=True)
    for k in body.data.shape_keys.key_blocks[1:]:k.value=0
    key.value=1
    def gauss(v,c,s):return math.exp(-.5*sum(((v[i]-c[i])/s[i])**2 for i in range(3)))
    changes=[]
    for v in key.data:
        q=v.co.copy();x,y,z=q
        if z<1.48 or z>1.63 or y>-.055:continue
        ax=abs(x);sgn=1 if x>=0 else -1;delta=Vector((0,0,0))
        # Narrow the broad lower jaw and gently hollow the buccal cheek.
        jaw=gauss(Vector((ax,y,z)),(.041,-.106,1.523),(.030,.040,.025))
        cheek=gauss(Vector((ax,y,z)),(.049,-.124,1.574),(.017,.029,.021))
        delta.x-=sgn*(.0022*jaw+.0010*cheek)
        delta.y+=.0017*cheek
        # Relax the mouth corners and reduce the parted-lip gap slightly.
        corner=gauss(Vector((ax,y,z)),(.021,-.145,1.553),(.008,.017,.008))
        lower=gauss(q,(0,-.151,1.545),(.021,.019,.0048))
        upper=gauss(q,(0,-.151,1.560),(.016,.019,.0048))
        delta.z+=.0010*corner+.0008*lower-.00035*upper
        v.co+=delta;changes.append(delta.length)
    # The reference has a darker brown iris than the source hazel material.
    iris=bpy.data.materials['AvatarIrisHazel'].node_tree.nodes['Principled BSDF']
    iris.inputs['Base Color'].default_value=(.040,.022,.012,1)
    # Calm the orange cast without removing the inherited texture variation.
    skin=bpy.data.materials['AvatarSkin'];tree=skin.node_tree;bs=tree.nodes['Principled BSDF']
    incoming=bs.inputs['Base Color'].links[0].from_socket
    mix=tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
    mix.inputs[2].default_value=(.92,.96,1.0,1);tree.links.new(incoming,mix.inputs[1]);tree.links.new(mix.outputs[0],bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value=.46

@contextmanager
def staged_outputs(paths):
    """Publish complete files without replacing another writer's output.

    Stage beside each destination so Blender's relative asset paths remain
    valid. Hard-link publication is atomic per file and refuses collisions.
    Ordinary failures roll back this invocation's links; an abrupt process
    kill can leave complete outputs or hidden staging files for inspection.
    """
    staged = {}
    published = []
    try:
        for path in paths:
            path.parent.mkdir(parents=True, exist_ok=True)
            fd, name = tempfile.mkstemp(prefix='.avatar-rebuild-', suffix=path.suffix, dir=path.parent)
            os.close(fd)
            staged[path] = Path(name)
        yield staged
        for path, stage in staged.items():
            if not stage.stat().st_size:
                raise RuntimeError(f'No completed output for {path}')
            os.link(stage, path)
            published.append(path)
    except BaseException:
        for path in reversed(published):
            try:
                if path.samefile(staged[path]):
                    path.unlink()
            except FileNotFoundError:
                pass
        raise
    finally:
        for stage in staged.values():
            stage.unlink(missing_ok=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--render',type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    output=args.output.resolve()
    render=args.render.resolve() if args.render else None
    for original, path, suffix in [(args.output, output, '.blend')] + ([(args.render, render, '.png')] if render else []):
        if original.is_symlink() or path.exists():
            raise FileExistsError(f'Refusing to overwrite {original}')
        if path.suffix != suffix:
            raise ValueError(f'Output must end in {suffix}: {path}')
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'fit05.blend'))
    bpy.context.preferences.filepaths.save_version=0
    grow_undercoat()
    prepare_undercoat()
    build_curls()
    refine_face()
    # Discard only historical hidden hair, keeping the inherited body/wardrobe.
    for ob in list(bpy.data.objects):
        if ob.hide_render and ob.name.startswith('Proof_Hair'):
            bpy.data.objects.remove(ob,do_unlink=True)
    bpy.context.view_layer.update()
    scene=bpy.context.scene;scene.cycles.samples=128
    with staged_outputs([output] + ([render] if render else [])) as staged:
        if bpy.ops.wm.save_as_mainfile(filepath=str(staged[output]),compress=True) != {'FINISHED'}:
            raise RuntimeError(f'Blender did not finish saving {output}')
        if render:
            scene.render.image_settings.file_format='PNG'
            scene.render.use_file_extension=False
            scene.render.filepath=str(staged[render])
            if bpy.ops.render.render(write_still=True) != {'FINISHED'}:
                raise RuntimeError(f'Blender did not finish rendering {render}')
    print('CURRENT_REBUILT',output)
if __name__=='__main__':main()
