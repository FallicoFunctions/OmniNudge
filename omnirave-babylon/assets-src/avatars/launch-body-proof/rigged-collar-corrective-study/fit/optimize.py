import sys
import numpy as np,json
from pathlib import Path
from scipy.optimize import minimize
root=Path(sys.argv[1])
reports=[]
for pose in ['overhead','forward']:
 d=np.load(root/(pose+'-constraints.npz'));p=d['posed']*1000;t=d['reference_t']*1000;e=d['edges'];planes=d['planes'];hits=planes[:,:,:3]*1000;normals=planes[:,:,3:6];signed=np.sum((p[None]-hits)*normals,axis=-1)
 print(pose,'signed ranges',[(float(x.min()),float(np.median(x)))for x in signed],flush=True)
 # Preserve each source side of its nearest surface with a conservative local plane.
 normals*=np.where(signed<0,-1,1)[...,None];signed=abs(signed);margin=np.minimum(signed,.25)
 tt=t[1152:].reshape(439,9,2,3).mean(axis=2);angle=abs(np.degrees(np.arctan2(tt[...,0],-(tt[...,1]-5))));free=np.flatnonzero(angle.ravel()>65)
 rest=np.linalg.norm(t[e[:,0]]-t[e[:,1]],axis=1);active=(e[:,0]>=1152)|(e[:,1]>=1152);ee=e[active];rr=rest[active]
 def fun(x):
  mid=np.zeros((3951,3));mid[free]=x.reshape(-1,3);delta=np.zeros_like(p);delta[1152:]=np.repeat(mid,2,axis=0);q=p+delta;v=q[ee[:,0]]-q[ee[:,1]];length=np.linalg.norm(v,axis=1);ratio=length/rr-1;err=np.maximum(abs(ratio)-.32,0);loss=np.sum(err**2)*10;dv=20*err*np.sign(ratio)/rr;g=np.zeros_like(p);vec=dv[:,None]*v/length[:,None];np.add.at(g,ee[:,0],vec);np.add.at(g,ee[:,1],-vec)
  diff=delta[ee[:,0]]-delta[ee[:,1]];loss+=.004*np.sum(diff**2)+.0005*np.sum(delta**2);vec=.008*diff;np.add.at(g,ee[:,0],vec);np.add.at(g,ee[:,1],-vec);g+=.001*delta
  depth=margin-np.sum((q[None]-hits)*normals,axis=-1);err=np.maximum(depth,0);loss+=100*np.sum(err**2);g-=200*np.sum(err[...,None]*normals,axis=0)
  grad=g[1152:].reshape(3951,2,3).sum(axis=1)[free].ravel();return loss,grad
 opt=minimize(fun,np.zeros(len(free)*3),jac=True,method='L-BFGS-B',bounds=[(-2,2)]*(len(free)*3),options={'maxiter':240,'ftol':1e-11,'maxcor':15})
 mid=np.zeros((3951,3));mid[free]=opt.x.reshape(-1,3);delta=np.zeros_like(p);delta[1152:]=np.repeat(mid,2,axis=0);q=p+delta;ratio=np.linalg.norm(q[e[:,0]]-q[e[:,1]],axis=1)/rest-1
 np.savez_compressed(root/(pose+'-optimized.npz'),posed_delta=delta/1000)
 row=dict(pose=pose,iterations=opt.nit,success=bool(opt.success),message=str(opt.message),peak_strain_percent=float(abs(ratio).max()*100),max_displacement_mm=float(np.linalg.norm(delta,axis=1).max()),loss=float(opt.fun));reports.append(row);print(row,flush=True)
(root/'optimization.json').write_text(json.dumps(reports,indent=2)+'\n')
