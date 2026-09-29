"""Regularized, local landmark-guided sculpt. Fitted points are diagnostics, not identity scores."""
from pathlib import Path
import json,math
import numpy as np
from scipy.spatial import cKDTree
from scipy.optimize import least_squares
from scipy.interpolate import RBFInterpolator

OUT=Path(__file__).resolve().parents[2]/'assets-src/avatars/astra-male-proof/landmarks'
source=json.loads((OUT/'study04.json').read_text());ref=json.loads((OUT/'original.json').read_text())
geo=json.loads((OUT/'study04-geometry.json').read_text())
xyz=np.asarray(geo['positions']);pixels=np.asarray(geo['pixels'])
valid=(xyz[:,2]>1.485)&(xyz[:,2]<1.72)&(xyz[:,1]<-.048)
ids=np.flatnonzero(valid);tree=cKDTree(pixels[valid]);lm=np.asarray(source['landmarks'])[:468,:2]
dist,idx=tree.query(lm);point=xyz[ids[idx]];target=np.asarray(ref['landmarks'])[:468,:2]
center=np.array([0,-.08,1.615])

def camera(p):
    yaw,pitch,roll,logscale,tx,ty=p
    right=np.array([math.cos(yaw),math.sin(yaw),0])
    up=np.array([-math.sin(pitch)*math.sin(yaw),math.sin(pitch)*math.cos(yaw),math.cos(pitch)])
    a=np.array([[math.cos(roll),-math.sin(roll)],[math.sin(roll),math.cos(roll)]])
    axes=a@np.array([right,-up]);return axes,math.exp(logscale),np.array([tx,ty])

def project(p,points):
    axes,s,t=camera(p);return (points-center)@axes.T*s+t

anchors=np.array([1,4,5,6,33,133,263,362,61,291,152,168,197,2,98,327])
anchors=anchors[dist[anchors]<5]
initial=[.42,-.03,0,math.log(600),510,180]
pose=least_squares(lambda p:(project(p,point[anchors])-target[anchors]).ravel(),initial,
    bounds=([-.1,-.5,-.25,math.log(300),440,130],[1.1,.4,.25,math.log(1000),580,220]),loss='soft_l1',f_scale=1.8)
axes,s,translation=camera(pose.x)
predicted=project(pose.x,point);delta2=target-predicted
# Full dense detector surface is an estimate. Exclude poorly located mesh correspondences,
# forehead points under hair, and extreme residuals; cap each physical correction at 8mm.
mask=(dist<3)&(point[:,2]<1.665)&(np.linalg.norm(delta2,axis=1)<18)
controls=point[mask];moves=delta2[mask]@axes/s
length=np.linalg.norm(moves,axis=1);moves*=np.minimum(1,.008/np.maximum(length,1e-9))[:,None]
# Symmetry is regularization, not a claim that hidden reference features were observed.
mirrored=controls.copy();mirrored[:,0]*=-1
mirrored_moves=moves.copy();mirrored_moves[:,0]*=-1
controls=np.concatenate([controls,mirrored]);moves=np.concatenate([moves,mirrored_moves])
# Consolidate detector points that mapped to the same body vertex.
unique,inverse=np.unique(np.round(controls,5),axis=0,return_inverse=True)
summed=np.zeros_like(unique);counts=np.zeros(len(unique))
for i,j in enumerate(inverse):summed[j]+=moves[i];counts[j]+=1
controls=unique;moves=summed/counts[:,None]
fixed=np.array([[x,y,z] for x in [-.09,0,.09] for y in [-.06,.03] for z in [1.47,1.70]])
field=RBFInterpolator(np.concatenate([controls,fixed])*10,np.concatenate([moves,np.zeros_like(fixed)]),
                     kernel='thin_plate_spline',smoothing=.045)
output={}
for name,data in geo['deform_objects'].items():
    coords=np.array(data['positions']);displacement=np.zeros_like(coords)
    head=coords[:,2]>1.48
    raw=field(coords[head]*10)
    gate=np.clip((coords[head,2]-1.48)/.07,0,1)*np.clip((-.035-coords[head,1])/.04,0,1)
    raw*=gate[:,None]*.8
    raw*=np.minimum(1,.008/np.maximum(np.linalg.norm(raw,axis=1),1e-9))[:,None]
    displacement[head]=raw
    output[name]={'delta_world':displacement.tolist(),'max_mm':float(np.max(np.linalg.norm(raw,axis=1))*1000)}
report={'method':'Regularized symmetric 2D residual sculpt; depth constrained to source; all inference is provisional',
 'pose':{'yaw':float(pose.x[0]),'pitch':float(pose.x[1]),'roll':float(pose.x[2]),'pixels_per_meter':s,'translation':translation.tolist(),'center':center.tolist()},
 'source_landmark_mesh_distance_px_median':float(np.median(dist)),
 'rigid_fit_anchor_rmse_native_px':float(np.sqrt(np.mean((predicted[anchors]-target[anchors])**2))),
 'controls':int(len(controls)),'objects':output,
 'point_diagnostics':[{'id':int(i),'reference':target[i].tolist(),'projected':predicted[i].tolist(),'residual_px':delta2[i].tolist(),'used':bool(mask[i])} for i in range(468)]}
(OUT/'fit05-deformation.json').write_text(json.dumps(report))
print(json.dumps({k:report[k] for k in ['pose','source_landmark_mesh_distance_px_median','rigid_fit_anchor_rmse_native_px','controls']}))
print('Max corrections mm:',{n:round(d['max_mm'],2) for n,d in output.items()})
