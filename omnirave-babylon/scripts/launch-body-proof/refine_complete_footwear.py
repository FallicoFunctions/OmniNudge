"""Finish the measured sneaker shells with connected, skinned construction.

Connection map: overlay panels overlap the retained shell by their thickness;
collars follow its measured top ring; lace endpoints meet eyelet centers;
outsole ribs sit within the existing sole height, preserving floor clearance.
All attachment weights interpolate the same shoe shell rather than the body.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT, array, material, review
from complete_pair_geometry import Surface, create, tube, join
import audit_rigged_jacket_sleeves as A


def fit_last(shoe, rig):
    from refine_complete_surfaces import posed_offset
    from refine_complete_lower_forms import body_distance
    scene=bpy.context.scene;history=[]
    p=array(shoe,True);selected=np.flatnonzero(p[:,2]>p[:,2].min()+.012)
    for iteration in range(12):
        count=0;deepest=0
        for clip in ['idle','walk','run']:
            rig.animation_data.action=bpy.data.actions[clip]
            for frame in np.linspace(*rig.animation_data.action.frame_range,9):
                A.sample(scene,float(frame))
                points,faces=A.H.geometry(bpy.data.objects['AvatarBody'])
                tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
                bounds=(np.array(points).min(0),np.array(points).max(0))
                p=array(shoe,True);delta=np.zeros_like(p)
                for i in selected:
                    distance,normal,_=body_distance(p[i],tree,bounds)
                    if distance<.003:
                        delta[i]=np.array(normal)*min(.006,.004-distance);count+=1;deepest=min(deepest,distance)
                if np.any(delta):posed_offset(shoe,rig,delta)
        history.append({'iteration':iteration+1,'adjustedVertexSamples':count,'deepestBeforeAdjustmentMm':deepest*1000})
        if count==0:break
    assert count==0,history[-1]
    rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1.)
    return history


def finish_shoe(sex, side, rig):
    shoe = bpy.data.objects['Launch high-top sneaker ' + side]
    from refine_complete_lower_forms import reshape_last
    last_report=reshape_last(shoe,rig,sex,side)
    shell = array(shoe, True)
    assert len(shell) == 480
    rings = shell.reshape(10, 48, 3)
    # The sparse shell's large shaft quads mixed foot and calf skinning across
    # long spans. Refine the carrier before attaching fine panels, so both
    # surfaces sample the same bend field during ankle flexion.
    arm = next(m for m in shoe.modifiers if m.type == 'ARMATURE')
    arm.show_viewport = False
    bpy.ops.object.select_all(action='DESELECT'); shoe.select_set(True)
    bpy.context.view_layer.objects.active = shoe
    sub = shoe.modifiers.new('Shoe bend carrier density', 'SUBSURF')
    sub.subdivision_type = 'SIMPLE'; sub.levels = 2
    bpy.ops.object.modifier_apply(modifier=sub.name)
    arm.show_viewport = True; bpy.context.view_layer.update()
    last_report['motionFit']=fit_last(shoe,rig)
    surf = Surface(rig, shoe)
    floor = float(shell[:, 2].min())
    old_laces = bpy.data.objects.get('Launch sneaker laces ' + side)
    if old_laces:
        bpy.data.objects.remove(old_laces, do_unlink=True)

    def point(u, v, lift=0):
        u = (u % 1) * 48; v = min(9., max(0., v))
        whole = math.floor(u)
        i, j = whole % 48, min(8, int(v)); a, b = u-whole, v-j
        p = (rings[j, i] * (1-a) + rings[j, (i+1)%48]*a)*(1-b) + (rings[j+1, i]*(1-a)+rings[j+1, (i+1)%48]*a)*b
        hit,normal,_,_=surf.tree.find_nearest(Vector(p))
        return hit + normal * lift

    upper = shoe.data.materials[0]
    toe = shoe.data.materials[2]
    accent = shoe.data.materials[3]
    trim = material(f'Launch {sex} sneaker stitched edging', (.12,.075,.035) if sex=='male' else (.012,.005,.024), .52)
    midsole = material(f'Launch {sex} sneaker foam midsole', (.48,.45,.38) if sex=='male' else (.16,.14,.20), .66)
    outsole = material(f'Launch {sex} sneaker traction rubber', (.015,.013,.012) if sex=='male' else (.012,.006,.025), .78)
    metal = material(f'Launch {sex} sneaker eyelet metal', (.58,.34,.09) if sex=='male' else (.06,.025,.095), .26, .78)
    lace = material(f'Launch {sex} {side} woven laces', (.60,.54,.42) if sex=='male' else ((.34,.80,.009) if side=='l' else (.80,.005,.23)), .68)
    tongue = material(f'Launch {sex} sneaker padded tongue', (.36,.32,.25) if sex=='male' else (.026,.008,.035), .55)
    mats = [upper,toe,accent,trim,midsole,outsole,metal,lace,tongue]
    if sex == 'female':
        color = (.8,.002,.21) if side=='l' else (.008,.65,.66)
        glow = material(f'PLURR {side} sole light channels', color, .25, .1)
        bs=glow.node_tree.nodes['Principled BSDF']; bs.inputs['Emission Color'].default_value=(*color,1); bs.inputs['Emission Strength'].default_value=1.4
        bs.inputs['Coat Weight'].default_value=.5
        mats.append(glow)
    parts=[]; matids=[]
    def add(part, index):
        parts.append(part); matids.extend([index]*len(part[1]))

    def panel(u0,u1,v0,v1,lift,index,cols=16,rows=6,taper=0):
        u0,u1=sorted([u0,u1])
        vs=[]; uv=[]; fs=[]
        for j in range(rows):
            t=j/(rows-1); center=(u0+u1)/2; half=(u1-u0)/2*(1-taper*math.sin(t*math.pi))
            for i in range(cols):
                u=center+half*(2*i/(cols-1)-1)
                vs.append(point(u,v0+(v1-v0)*t,lift));uv.append((i/(cols-1),t))
        for j in range(rows-1):
            for i in range(cols-1):
                a=j*cols+i;fs.append((a,a+1,a+1+cols,a+cols))
        add((vs,fs,uv),index)

    # Deliberate construction layers: foam/rubber, toe cap, padded tongue,
    # side quarters and reinforced lace stays.
    panel(0,1,.85,2.9,.0014,4,cols=49,rows=4)
    panel(-.205,.205,3.35,5.65,.0024,1,cols=41,rows=14,taper=.08)
    panel(-.090,.090,5.5,8.95,.004,8,cols=11,rows=12,taper=.1)
    for sign in [-1,1]:
        panel(sign*.12,sign*.30,5.0,8.35,.002,0,cols=14,rows=8,taper=.18)
        panel(sign*.075,sign*.122,5.75,8.65,.005,2,cols=5,rows=11)
        # Fine stitches follow the panel border, with intentional gaps.
        for k in range(19):
            v=5.80+(8.55-5.8)*k/19
            add(tube([point(sign*.124,v,.006),point(sign*.124,v+.075,.006)],.00055,4),3)
        seam=[point(sign*.30,5.1+(8.35-5.1)*t,.003) for t in np.linspace(0,1,18)]
        add(tube(seam,.0010,5),3)
    add(tube([point(u,8.78,.002) for u in np.linspace(0,1,65)],.0044,8),8)
    # A heel counter and pull loop meet the collar and avoid a floating tab.
    panel(.435,.565,5.3,8.7,.003,2,cols=9,rows=10)
    pull=[point(.48,8.2,.005),point(.48,8.95,.009),point(.50,9,.013),point(.52,8.95,.009),point(.52,8.2,.005)]
    add(tube(pull,.0023,6),3)

    samples=np.linspace(6.,8.50,160)
    path=np.array([point(.095,v) for v in samples])
    length=np.r_[0,np.cumsum(np.linalg.norm(np.diff(path,axis=0),axis=1))]
    rows=np.interp(np.linspace(0,length[-1],7),length,samples)
    for v in rows:
        for sign in [-1,1]:
            center=point(sign*.095,v,.006)
            across=(point(sign*.095+.004,v)-point(sign*.095-.004,v)).normalized()
            along=(point(sign*.095,v+.02)-point(sign*.095,v-.02)).normalized()
            path=[center+.0028*(across*math.cos(a)+along*math.sin(a)) for a in np.linspace(0,math.tau,17)]
            add(tube(path,.00075,6),6)
    for i in range(len(rows)-1):
        for sign in [-1,1]:
            path=[point(sign*.095*(1-2*t),rows[i]+(rows[i+1]-rows[i])*t,.009+math.sin(t*math.pi)*.002)
                  for t in np.linspace(0,1,15)]
            add(tube(path,.0018 if sex=='male' else .0021,6),7)
    # Bow loops and two capped ends complete the lacing instead of seven bars.
    for sign in [-1,1]:
        bow=[point(sign*.078*math.sin(t*math.pi),8.53+.40*math.sin(t*math.tau),.013+.009*math.sin(t*math.pi))
             for t in np.linspace(0,1,25)]
        add(tube(bow,.0018,6),7)
        tail=[point(sign*(.012+.045*t),8.54-.53*t,.012+.004*math.sin(t*math.pi)) for t in np.linspace(0,1,10)]
        add(tube(tail,.0017,6),7);add(tube(tail[-2:],.002,6),6)

    # Sole ribs keep the original ground plane and provide a readable edge.
    for k in range(28):
        u0=(k+.17)/28;u1=(k+.83)/28
        panel(u0,u1,.18,1.0,.0026,5,cols=4,rows=2)
    for v in [1.2,2.5]:
        add(tube([point(u,v,.002) for u in np.linspace(0,1,65)],.0011,5),3)
    if sex=='female':
        add(tube([point(u,2.05,.0025) for u in np.linspace(0,1,81)],.0028,6),9)
    # Small perforations are geometry-owned and follow the toe surface.
    for v in [5.18,5.42]:
        for u in [-.12,-.06,0,.06,.12]:
            c=point(u,v,.0024)
            across=(point(u+.004,v)-point(u-.004,v)).normalized()
            along=(point(u,v+.015)-point(u,v-.015)).normalized()
            verts=[c]+[c+.0009*(across*math.cos(a)+along*math.sin(a)) for a in np.linspace(0,math.tau,9)[:-1]]
            add((verts,[(0,i+1,(i+1)%8+1) for i in range(8)],[(.5,.5)]*9),3)

    v,f,uv=join(parts)
    new=create('Launch constructed sneaker details '+side,v,f,mats,surf,weights=surf.weights_at(v),uv=uv,
               slot='shoes',option=shoe['avatarOptionId'])
    for poly,index in zip(new.data.polygons,matids):poly.material_index=index
    bpy.context.view_layer.update()
    newp=array(new,True)
    assert np.isfinite(newp).all()
    assert newp[:,2].min() >= floor-.001, (floor,newp[:,2].min())
    return {'carrierVertices':len(shoe.data.vertices),'overlayVertices':len(v),'overlayFaces':len(f),'minimumSoleHeightM':float(newp[:,2].min()),
            'retainedFloorM':floor,'laceRows':7,'crossingLaces':12,'eyelets':14,'lastShape':last_report}, new


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-surface-refined.blend'))
    s=bpy.context.scene;r=bpy.data.objects['AvatarSkeleton']
    r.animation_data.action=bpy.data.actions['idle'];s.frame_set(1);bpy.context.view_layer.update()
    report={};overlays=[]
    for side in ['l','r']:
        report[side],new=finish_shoe(sex,side,r);overlays.append(new)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-footwear-refined.blend'),compress=True)
    (OUT/f'{sex}-footwear-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:
        camera=review.configure_scene();camera.data.type='ORTHO';camera.data.ortho_scale=.65
        s.view_settings.exposure=-.8;s.render.resolution_x=950;s.render.resolution_y=750
        for label,x,y in [('front',.2,-4),('oblique',2.5,-4),('side',4,-.5)]:
            camera.location=(x,y,.24);review.look_at(camera,Vector((0,-.06,.12)))
            s.render.filepath=str(OUT/f'{sex}-footwear-refined-{label}.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(a.sex,a.render)
