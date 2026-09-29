"""Release the male torso panels and shape a hanging female hood.

Connection map: male collar, cuffs and hem retain their boundary positions.
The front opening is a free cloth edge and follows the flatter chest panel;
sewn zipper fittings follow the measured shell and retain corrective owners.
The female hood's inner neck row remains exact. Its outer edge curls around
an authored rear pocket, with its 1.6 mm binding rebuilt on that measured edge.
The existing armature owns both garments; body and other garment meshes stay exact.
"""
import argparse,json,math,sys,shutil
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from assemble_complete_pair import OUT,array
from complete_pair_geometry import skin_weights,smooth,Surface,create,tube
from refine_complete_drape import adjacency,diffuse,fit,offset_keys
from refine_complete_surfaces import posed_offset,fit_hood
from refine_complete_jacket_finish import reattach_hardware,render_view,fold_profile,surface_finish
import audit_rigged_jacket_sleeves as A


def male_panels(coat,rig):
    p=array(coat,True);q=p.copy();names=list(rig.data.bones.keys());w=skin_weights(coat,names)
    arm=sum(w[:,names.index(b+'_'+s)] for b in ['upperarm','lowerarm'] for s in ['l','r'])
    _,_,_,boundary=adjacency(coat)
    torso=smooth((.34-arm)/.30)
    lower=smooth((p[:,2]-1.085)/.085);upper=smooth((1.53-p[:,2])/.075)
    front=smooth((-p[:,1]-.010)/.055)*torso*lower*upper
    back=smooth((p[:,1]-.006)/.047)*torso*lower*upper
    # The free front edge moves with the panel. All true sewn connections stay.
    opening={i for i in boundary if front[i]>.05 and abs(p[i,0])<.11 and 1.14<p[i,2]<1.49}
    fixed=boundary-opening
    front[list(fixed)]=0;back[list(fixed)]=0
    # Remove excess chest depth, leaving measured ease above the body. Release
    # the waist forward a little, so the cloth no longer traces the abdomen.
    chest=.019*np.exp(-((p[:,2]-1.373)/.083)**4)
    waist=.007*np.exp(-((p[:,2]-1.228)/.085)**4)
    q[:,1]+=(chest-waist)*front
    # Bridge the hollow at the lower back with a continuous hanging panel.
    back_y=np.interp(p[:,2],[1.08,1.15,1.23,1.32,1.41,1.48,1.53],[.109,.098,.087,.085,.087,.080,.060])
    across=1-.25*smooth((np.abs(p[:,0])-.065)/.10)
    q[:,1]+=(back_y-p[:,1])*.84*back*across
    side=smooth((np.abs(p[:,0])-.095)/.045)*torso*lower*upper
    side[list(fixed)]=0
    q[:,0]+=np.sign(p[:,0])*.009*np.exp(-((p[:,2]-1.205)/.12)**4)*side
    # Sparse longer folds divide those planes. They terminate before the
    # shoulders and hem rather than circling the chest like padded bands.
    for sign in [-1,1]:
        sx=p[:,0]*sign;one=smooth(sx/.03)
        envelope=smooth((p[:,2]-1.105)/.07)*smooth((1.465-p[:,2])/.09)*one
        line=.099+.019*np.sin((p[:,2]-1.1)*6+sign*.45)
        crease=fold_profile(sx-line,.007)*.0045
        q[:,1]-=crease*front*envelope
        line2=.073+.020*np.sin((p[:,2]-1.15)*5-sign*.4)
        q[:,1]+=fold_profile(sx-line2,.011)*.0065*back*envelope
    q[list(fixed)]=p[list(fixed)]
    posed_offset(coat,rig,q-p)
    chest_ids=(front>.7)&(p[:,2]>1.32)&(p[:,2]<1.42)
    waist_ids=(back>.7)&(p[:,2]>1.18)&(p[:,2]<1.27)
    return {'measurementStage':'before pose clearance fitting','fixedBoundaryVertices':len(fixed),'freeOpeningVertices':len(opening),'chestDepthReductionMedianMm':float(np.median((q-p)[chest_ids,1])*1000),'rearWaistReleaseMedianMm':float(np.median((q-p)[waist_ids,1])*1000),'maximumPanelDisplacementMm':float(np.linalg.norm(q-p,axis=1).max()*1000)},fixed


def follow_hardware(coat,original):
    delta=array(coat)-original;tree=KDTree(len(delta))
    for i,p in enumerate(original):tree.insert(Vector(p),i)
    tree.balance();report=[]
    for ob in [o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('jacketHardware')]:
        offsets=[]
        for p in array(ob):
            near=tree.find_n(Vector(p),6);ids=[i for _,i,_ in near];w=np.array([1/(.005+d)**2 for _,_,d in near]);offsets.append(np.sum(delta[ids]*w[:,None],axis=0)/w.sum())
        offset_keys(ob,np.array(offsets));report.append(ob.name)
    return report


def hood_pocket(hood,rig):
    p=array(hood,True);assert len(p)==9*60
    grid=p.reshape(9,60,3);v=np.linspace(0,1,9)[:,None]
    center=np.array([0.,-.025]);inner=grid[0,:,:2]-center
    radius=np.linalg.norm(inner,axis=1);direction=inner/radius[:,None]
    theta=np.unwrap(np.arctan2(direction[:,0],-direction[:,1]))
    assert np.all(np.diff(theta)>.005),'Hood neck angular order changed'
    back=smooth((direction[:,1]-.10)/.85)
    outer=np.einsum('ij,ij->i',grid[-1,:,:2]-center,direction)+.110*back
    outer=np.maximum(outer,radius+.023)
    # A monotone polar loft cannot fold through itself in the idle projection.
    # Sag is restricted to the rear; side cloth remains above the shoulders.
    growth=(1-back)[None,:]*v+back[None,:]*v**.68
    r=radius[None,:]+growth*(outer-radius)[None,:]
    r+=.004*np.sin(theta[None,:]*5+.4+v*.6)*np.sin(math.pi*v)
    q=np.zeros_like(grid);q[:,:,:2]=center+r[:,:,None]*direction[None,:,:]
    outer_z=grid[-1,:,2]-.020*back
    q[:,:,2]=(1-v)*grid[0,:,2]+v*outer_z
    sag=.142+.046*np.exp(-((theta-math.pi-.10)/.58)**2)
    q[:,:,2]-=sag[None,:]*np.sin(math.pi*v)**1.35*back[None,:]
    q[:,:,2]+=.004*np.sin(theta[None,:]*5+v*2.8)*np.sin(math.pi*v)**2
    q[0]=grid[0]
    posed_offset(hood,rig,q.reshape(-1,3)-p)
    hood['jacketShapeInnerRowVertices']=60
    hood['jacketShapePocket']='monotone radial loft with sagging rear and raised rim'
    selected=np.arange(24,36)
    return {'measurementStage':'before pose clearance fitting','neckRowVerticesPreserved':60,'rearRimDepthIncreaseMm':float(np.mean((q-grid)[-1,selected,1])*1000),'rearPocketSagBelowRimMm':float((q[-1,selected,2].mean()-q[4,selected,2].mean())*1000),'maximumDisplacementMm':float(np.linalg.norm(q.reshape(-1,3)-p,axis=1).max()*1000)}


def bind_hood_rim(hood,rig):
    old=bpy.data.objects['PLURR hood binding'];mat=old.data.materials[0]
    surface=Surface(rig,hood);points=array(hood,True).reshape(9,60,3)[-1]
    weights=np.repeat(skin_weights(hood,surface.names).reshape(9,60,len(surface.names))[-1],6,axis=0)
    vertices,faces,uv=tube(points,.0016,6)
    bpy.data.objects.remove(old,do_unlink=True)
    binding=create('PLURR hood binding',vertices,faces,mat,surface,weights=weights,uv=uv,slot='jacket',option='plurr-foil')
    binding['outfitDetailCarrier']=hood.name
    binding['jacketShapeRimBinding']='exact edge vertex weights'
    return {'vertices':len(vertices),'radiusMm':1.6,'weightOwner':'each hood edge vertex, repeated around its six-vertex binding ring'}


def run(sex,render=False):
    bpy.ops.wm.open_mainfile(filepath=str(OUT/f'{sex}-jacket-refined.blend'))
    scene=bpy.context.scene;rig=bpy.data.objects['AvatarSkeleton'];rig.animation_data.action=bpy.data.actions['idle'];A.sample(scene,1)
    retained={o.name:array(o).copy() for o in scene.objects if o.type=='MESH' and o.get('avatarSlot')!='jacket'}
    if render:
        # These preceding native renders use the same render_view camera/lights.
        for view in ['front','oblique','back']:shutil.copy2(OUT/f'{sex}-jacket-final-{view}.png',OUT/f'{sex}-jacket-shape-before-{view}.png')
    coat=bpy.data.objects['Structured armhole jacket'];initial=array(coat).copy();report={'source':'jacket-refined'}
    affected=[coat] if sex=='male' else [bpy.data.objects['PLURR folded hood'],bpy.data.objects['PLURR hood binding']]
    disabled=[]
    for ob in affected:
        for m in ob.modifiers:
            if m.type!='ARMATURE':disabled.append((m,m.show_viewport,m.show_render));m.show_viewport=False;m.show_render=False
    A.update()
    if sex=='male':
        report['panels'],boundary=male_panels(coat,rig)
        report['fit']=fit([coat],rig,{coat.name:boundary})
        assert np.array_equal(array(coat)[list(boundary)],initial[list(boundary)])
        report['hardwareFollowed']=follow_hardware(coat,initial)
        report['hardwareRebinding']=reattach_hardware(rig,coat)
    else:
        hood=bpy.data.objects['PLURR folded hood'];before=array(hood).copy()
        report['hood']=hood_pocket(hood,rig)
        # Fit against the evaluated coat, then rebuild the lime rim exactly on
        # the fitted edge with its surface skin weights.
        report['hoodFit']=fit_hood(scene,rig,fixed_vertices=range(60))
        report['hoodRimBinding']=bind_hood_rim(hood,rig)
        report['hoodMaterials']=surface_finish(hood,rig,sex,label='jacket-shape')
        report['hood']['neckRowMaximumChangeAfterFitMm']=float(np.linalg.norm(array(hood)[:60]-before[:60],axis=1).max()*1000)
        assert np.array_equal(array(hood)[:60],before[:60]),'Hood neck attachment moved'
        assert np.array_equal(array(coat),initial),'Female main jacket changed'
    for m,view,ren in disabled:m.show_viewport=view;m.show_render=ren
    A.update()
    for name,points in retained.items():assert np.array_equal(points,array(bpy.data.objects[name])),name
    report['preservedNonJacketMeshes']=len(retained)
    report['jacketCageVertices']=len(coat.data.vertices)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(OUT/f'{sex}-jacket-shape-refined.blend'),compress=True)
    (OUT/f'{sex}-jacket-shape-refinement.json').write_text(json.dumps(report,indent=2)+'\n')
    if render:render_view(sex,'shape-pilot')
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sex',choices=['male','female'],required=True);p.add_argument('--render',action='store_true')
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run(args.sex,args.render)
