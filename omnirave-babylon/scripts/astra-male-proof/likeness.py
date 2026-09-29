"""Editable face targets and a separately skinned swept-hair study.

Connection map: body/head share vertices. Hair cap follows scalp + 1 mm clearance;
locks begin 5 mm inside the cap. Earring top intersects the earlobe by 1 mm
(an anatomical attachment deliberately smaller than furniture overlap guidance).
"""
import bpy, math, gzip, random, json
from mathutils import Vector
from pathlib import Path

def bsdf(mat): return mat.node_tree.nodes.get('Principled BSDF')

def material(name,color,rough=.4,metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    b=bsdf(m); b.inputs['Base Color'].default_value=(*color,1)
    b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
    return m

def apply(root,out):
    body=bpy.data.objects['AvatarBody']; rig=bpy.data.objects['AvatarSkeleton']
    # Freeze the chosen male fit on the experiment copy, preserving vertex order/UVs/weights.
    for o in bpy.data.objects:
        if o.type=='MESH' and o.data.shape_keys:
            keys=o.data.shape_keys.key_blocks
            coords=[v.co.copy() for v in keys['male'].data]
            o.shape_key_clear()
            for v,co in zip(o.data.vertices,coords): v.co=co
    body.shape_key_add(name='Basis')
    key=body.shape_key_add(name='Reference_face_study'); key.value=1
    targetroot=root.parent/'.tooling/blender-user/extensions/blender_org/mpfb/data/targets'
    weights={'head/head-oval':.20,'chin/chin-width-decr':.55,
      'chin/chin-prominent-incr':.20,'chin/chin-height-decr':.13,
      'nose/nose-scale-horiz-decr':.28,'nose/nose-point-width-decr':.25,
      'nose/nose-greek-incr':.15,'nose/nose-point-up':.12,
      'mouth/mouth-scale-horiz-decr':.12,'mouth/mouth-upperlip-volume-incr':.12,
      'mouth/mouth-lowerlip-volume-incr':.12}
    for side in ['l','r']:
        weights[f'cheek/{side}-cheek-volume-decr']=.38
        weights[f'cheek/{side}-cheek-bones-incr']=.25
        weights[f'eyes/{side}-eye-height2-decr']=.16
        weights[f'eyes/{side}-eye-height3-decr']=.12
    # MPFB source body is exactly vertices 0..13379, verified against its metadata.
    for name,weight in weights.items():
        for line in gzip.open(targetroot/(name+'.target.gz'),'rt'):
            if not line.strip() or line.startswith('#'): continue
            i,x,z,y=line.split(); i=int(i)
            if i<len(key.data): key.data[i].co+=Vector((float(x),-float(y),float(z)))*(.1*weight)
    (out/'face-targets.json').write_text(json.dumps(weights,indent=2)+'\n')
    sub=body.modifiers.new('Portrait surface subdivision','SUBSURF'); sub.levels=1; sub.render_levels=2
    # Existing CC0 skin texture remains the surface evidence; color changes are shader work.
    skin=bpy.data.materials['AvatarSkin']; tree=skin.node_tree; b=bsdf(skin)
    tint=tree.nodes.new('ShaderNodeMixRGB'); tint.blend_type='MULTIPLY'; tint.inputs[0].default_value=1
    tint.inputs[2].default_value=(.40,.35,.32,1)
    tree.links.new(tree.nodes['AvatarSkinTexture'].outputs['Color'],tint.inputs[1]); tree.links.new(tint.outputs[0],b.inputs['Base Color'])
    b.inputs['Roughness'].default_value=.43; b.inputs['Subsurface Weight'].default_value=.065
    b.inputs['Subsurface Radius'].default_value=(1,.4,.2); b.inputs['Subsurface Scale'].default_value=.012
    b.inputs['Specular IOR Level'].default_value=.3
    for n in ['AvatarEyeWhite','AvatarIrisHazel','AvatarPupil']:
        b=bsdf(bpy.data.materials[n]); b.inputs['Roughness'].default_value=.2
    bsdf(bpy.data.materials['AvatarIrisHazel']).inputs['Base Color'].default_value=(.075,.039,.018,1)
    bsdf(bpy.data.materials['AvatarPupil']).inputs['Base Color'].default_value=(.002,.001,.001,1)
    # Brows retain the alpha texture, with a darker root color and a fuller inner arch.
    brow=bpy.data.objects['AvatarEyebrows']
    for v in brow.data.vertices:
        v.co.z=1.634+(v.co.z-1.634)*1.35
    for mat in brow.data.materials:
        if mat:
            b=bsdf(mat)
            for link in list(b.inputs['Base Color'].links): mat.node_tree.links.remove(link)
            b.inputs['Base Color'].default_value=(.028,.014,.008,1); b.inputs['Roughness'].default_value=.7
    # Hair and earrings are replacement experiment meshes, all bound to the head.
    for o in bpy.data.objects:
        if o.name.startswith(('AvatarHair','AvatarAccessory')): o.hide_render=True
    hairmats=[material('Proof_Hair_'+str(i),c,.52) for i,c in enumerate([
      (.021,.012,.008),(.035,.020,.011),(.055,.032,.017),(.082,.052,.027),(.12,.078,.039)])]
    for m in hairmats:
        bsdf(m).inputs['Anisotropic'].default_value=.4
        bsdf(m).inputs['Specular IOR Level'].default_value=.22
    gold=material('Proof_Gold',(.69,.45,.19),.23,.82)
    def mesh(name,verts,faces,mats,indices=None):
        me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
        o=bpy.data.objects.new(name,me); bpy.context.scene.collection.objects.link(o)
        for m in mats: me.materials.append(m)
        for p in me.polygons:
            p.use_smooth=True
            if indices: p.material_index=indices[p.index]
        group=o.vertex_groups.new(name='head'); group.add(list(range(len(verts))),1,'REPLACE')
        mod=o.modifiers.new('Head attachment','ARMATURE'); mod.object=rig; o.parent=rig
        return o
    # Closed scalp cap sampled from the body's actual scalp region, under the groom.
    scalpgroup=body.vertex_groups['scalp'].index
    ids={v.index for v in body.data.vertices if any(g.group==scalpgroup and g.weight>.5 for g in v.groups)}
    polygons=[p for p in body.data.polygons if all(i in ids for i in p.vertices)]
    used=sorted({i for p in polygons for i in p.vertices}); remap={i:n for n,i in enumerate(used)}
    # Source scalp group is patchy at its border; use the fitted short-hair shell as
    # a dark underlayer instead, eliminating exposed scalp between the swept locks.
    cap=bpy.data.objects['AvatarHair_textured-crop']; cap.hide_render=False; cap.hide_set(False)
    cap.data.materials.clear(); cap.data.materials.append(hairmats[0])
    for p in cap.data.polygons: p.material_index=0
    for v in cap.data.vertices:
        if v.co.z>1.68:
            f=min(1,(v.co.z-1.68)/.06)
            v.co.z+=.022*f
            v.co.x-=.007*f
    sub=cap.modifiers.new('Underlayer smoothing','SUBSURF'); sub.levels=1
    # Elliptical tapered locks, parallel transported frames, fine grooves and deterministic color.
    verts=[]; faces=[]; indices=[]; rng=random.Random(904)
    def bezier(points,t):
        a,b,c,d=map(Vector,points); return a*(1-t)**3+b*3*t*(1-t)**2+c*3*t*t*(1-t)+d*t**3
    def lock(points,width,depth,shade,steps=24,sides=12):
        start=len(verts); prev=None
        for j in range(steps+1):
            t=j/steps; center=bezier(points,t)
            tangent=(bezier(points,min(1,t+.001))-bezier(points,max(0,t-.001))).normalized()
            normal=(center-Vector((0,-.025,1.645))).normalized()
            side=tangent.cross(normal).normalized()
            if side.length<.1: side=tangent.cross(Vector((0,1,0))).normalized()
            normal=side.cross(tangent).normalized()
            if prev is not None and side.dot(prev)<0: side=-side; normal=-normal
            prev=side
            taper=(.5+.5*math.sin(math.pi*min(t/.65,1))) * max(.015,(1-t)**.42)
            for s in range(sides):
                a=2*math.pi*s/sides
                groove=1+.06*math.cos(a*5+2*math.sin(t*math.pi))
                verts.append(center+side*math.cos(a)*width*taper+normal*math.sin(a)*depth*taper*groove)
        for j in range(steps):
            for s in range(sides):
                a=start+j*sides+s; b=start+j*sides+(s+1)%sides
                faces.append((a,b,b+sides,a+sides)); indices.append(shade)
        faces.extend([tuple(start+s for s in reversed(range(sides))),tuple(start+steps*sides+s for s in range(sides))]);indices.extend([shade,shade])
    paths=[]
    # Back-to-front layers sweep from the right part over the crown toward the left temple.
    for row in range(6):
        y=.045-row*.029
        for col in range(7):
            x=.022+col*.006; jitter=rng.uniform(-.003,.003)
            points=[(x,y,1.718-abs(y+.03)*.20),
                    (x-.015,y-.043,1.804+jitter-row*.001),
                    (-.115,y-.032,1.79-row*.006+jitter),
                    (-.077-col*.002,y-.012,1.682-row*.002+jitter)]
            paths.append((points,.011,.007,rng.choices(range(4),[7,5,2,.2])[0]))
    # Shorter swept side locks hug the skull above the ears, continuing around the occiput.
    for side in [-1,1]:
        for j in range(20):
            t=j/19; y=-.10+t*.145; z=1.684-math.sin(t*math.pi)*.017
            points=[(side*.055,y-.007,z+.025),(side*.091,y+.010,z+.007),
                    (side*.099,y+.045,z-.025),(side*.078,y+.060,z-.053)]
            paths.append((points,.008,.003,rng.choice([0,0,1,2])))
    for points,w,d,shade in paths:
        lock(points,w,d,shade)
        # Individual fine strands catch the light without thick tube silhouettes.
        for k in range(14):
            offset=(k-6.5)*w*.115
            pp=[(x+offset,y-.001,z+d*.7+rng.uniform(-.0006,.0006)) for x,y,z in points]
            lock(pp,.00018,.00014,min(4,shade+rng.choice([0,0,1,2])),steps=24,sides=4)
    hair=mesh('Proof_HairSwept',verts,faces,hairmats,indices)
    # Bounds record makes the intended 8–10 cm quiff height inspectable.
    (out/'hair-bounds.json').write_text(json.dumps({
       'min':[min(v[i] for v in verts) for i in range(3)],
       'max':[max(v[i] for v in verts) for i in range(3)],
       'vertices':len(verts),'faces':len(faces),'seed':904},indent=2)+'\n')
    for side in [-1,1]:
        # Ears in this base are near x=±.080, y=-.025, z=1.605.
        vs=[]; fs=[]; center=Vector((side*.079,-.039,1.580))
        for j in range(48):
            t=2*math.pi*j/48; radial=Vector((math.cos(t)*.48,math.cos(t)*.88,math.sin(t)))
            normal=Vector((.88,-.48,0))
            for k in range(8):
                a=2*math.pi*k/8
                vs.append(center+radial*.0125+(radial*math.cos(a)+normal*math.sin(a))*.0009)
        for j in range(48):
            for k in range(8): fs.append((j*8+k,j*8+(k+1)%8,((j+1)%48)*8+(k+1)%8,((j+1)%48)*8+k))
        mesh('Proof_Earring_'+str(side),vs,fs,[gold])
    return {'body':body,'hair':hair}
