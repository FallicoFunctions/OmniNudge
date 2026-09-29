"""Scalp-following groom. Cards share a continuous volume; roots overlap it 5mm.
Card edges carry strand alpha; tips taper. Small flyaways are part of the cards.
"""
import bpy, math, random
import numpy as np
from mathutils import Vector

def build(out):
    for o in list(bpy.data.objects):
        if o.name.startswith('Proof_Hair'): bpy.data.objects.remove(o,do_unlink=True)
        elif o.name.startswith('AvatarHair'): o.hide_render=True
    rig=bpy.data.objects['AvatarSkeleton']; rng=random.Random(906)
    def surf(theta,phi,lift=0):
        # A swept, continuous hair volume; -Y is the front of the face.
        front=(1+math.cos(theta))*.5
        x=.087*math.sin(phi)*math.sin(theta)-.016*math.cos(phi)**2
        y=-.030-.106*math.sin(phi)*math.cos(theta)
        z=1.648+(.112+.010*front)*math.cos(phi)
        n=Vector((math.sin(phi)*math.sin(theta),-math.sin(phi)*math.cos(theta),math.cos(phi)))
        ripple=.0035*math.sin(theta*7+phi*5)*math.sin(phi)**2
        return Vector((x,y,z))+n*(lift+ripple),n
    def create(name,vs,fs,uvs,mat):
        me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update()
        ob=bpy.data.objects.new(name,me); bpy.context.scene.collection.objects.link(ob); me.materials.append(mat)
        if uvs:
            uv=me.uv_layers.new(name='UVMap')
            for p in me.polygons:
                for li in p.loop_indices: uv.data[li].uv=uvs[me.loops[li].vertex_index]
        for p in me.polygons:p.use_smooth=True
        ob.vertex_groups.new(name='head').add(list(range(len(vs))),1,'REPLACE')
        ob.modifiers.new('Head skin','ARMATURE').object=rig;ob.parent=rig
        return ob
    capmat=bpy.data.materials.new('Proof_GroomRoot');capmat.use_nodes=True
    b=capmat.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value=(.016,.008,.004,1)
    b.inputs['Roughness'].default_value=.85;b.inputs['Specular IOR Level'].default_value=.12
    vs=[];fs=[]
    for j in range(31):
        for i in range(96):
            th=2*math.pi*i/96
            end=1.29+.95*((1-math.cos(th))*.5)**.65
            phi=.001+(end-.001)*j/30
            vs.append(surf(th,phi,-.005)[0])
    for j in range(30):
        for i in range(96):fs.append((j*96+i,j*96+(i+1)%96,(j+1)*96+(i+1)%96,(j+1)*96+i))
    create('Proof_HairVolume',vs,fs,None,capmat)
    # Original procedural texture: fine pigment strands with translucent spaces.
    W,H=512,1024; pixels=np.zeros((H,W,4),dtype=np.float32)
    for k in range(110):
        x0=rng.uniform(4,W-4); width=rng.uniform(.45,1.4); phase=rng.uniform(0,6.28)
        shade=rng.choices([0,1,2,3],[7,5,2,1])[0]
        color=np.array([(.052,.025,.013),(.080,.042,.023),(.13,.076,.037),(.23,.15,.07)][shade])
        tip=rng.uniform(.82,1); root=rng.uniform(0,.045)
        for y in range(H):
            t=y/(H-1)
            if t<root or t>tip:continue
            x=x0+3*math.sin(t*7+phase)+2*math.sin(t*17+phase)
            a=min(1,(tip-t)*30,(t-root)*40)*(.7+.3*math.sin(math.pi*t))
            for ix in range(max(0,int(x-2)),min(W,int(x+3))):
                alpha=a*math.exp(-((ix-x)/width)**2)
                if alpha>pixels[y,ix,3]:
                    pixels[y,ix,:3]=color*(.5+.5*t);pixels[y,ix,3]=alpha
    img=bpy.data.images.new('Proof_HairStrands',width=W,height=H,alpha=True)
    img.pixels.foreach_set(pixels.ravel());img.filepath_raw=str(out/'hair-strands.png');img.file_format='PNG';img.save();img.pack()
    mat=bpy.data.materials.new('Proof_GroomStrands');mat.use_nodes=True;mat.surface_render_method='DITHERED'
    b=mat.node_tree.nodes['Principled BSDF'];tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img
    mat.node_tree.links.new(tex.outputs['Color'],b.inputs['Base Color']);mat.node_tree.links.new(tex.outputs['Alpha'],b.inputs['Alpha'])
    b.inputs['Roughness'].default_value=.63;b.inputs['Specular IOR Level'].default_value=.25
    vs=[];fs=[];uvs=[]
    def card(start,end,width,lift,phase):
        offset=len(vs);steps=30
        for j in range(steps+1):
            t=j/steps
            # Longitude/latitude interpolation keeps every card on the volume.
            th=start[0]+(end[0]-start[0])*t
            ph=start[1]+(end[1]-start[1])*t-.17*math.sin(math.pi*t)
            wave=.0040*math.sin(t*11+phase)*math.sin(math.pi*t)
            c,n=surf(th,ph,lift+wave)
            nextc=surf(th+(end[0]-start[0])*.001,ph+(end[1]-start[1])*.001,lift)[0]
            tangent=(nextc-c).normalized(); across=tangent.cross(n).normalized()
            if across.length<.1:across=Vector((1,0,0))
            taper=1-.65*t**4
            for s in range(5):
                u=s/4; v=c+across*((u-.5)*width*taper)+n*(.0008*math.sin(math.pi*u))
                vs.append(v);uvs.append((u,t))
        for j in range(steps):
            for s in range(4):
                a=offset+j*5+s;fs.append((a,a+1,a+6,a+5))
    # Dense layers follow the same groom directions with local variation.
    for i in range(155):
        row=i/154
        start=(.15+row*.95,rng.uniform(.10,.85))
        end=(-1.20-row*.60,1.28+row*.32+rng.uniform(-.08,.06))
        card(start,end,rng.uniform(.008,.014),rng.uniform(.001,.008),rng.uniform(0,6.28))
    # Right side/back combs away from the part and down around the ears.
    for i in range(130):
        th=.30+i/129*3.1
        card((th,rng.uniform(.16,.65)),(th+.38,1.50+.66*(i/129)),rng.uniform(.009,.016),rng.uniform(0,.006),rng.random()*6.28)
    # A few loose forehead waves; irregular tips soften the hairline.
    for i in range(22):
        card((.15+i*.028,.82),(-.70-i*.022,1.40+i*.004),.006,rng.uniform(.009,.014),rng.random()*6.28)
    return create('Proof_HairCards',vs,fs,uvs,mat)
