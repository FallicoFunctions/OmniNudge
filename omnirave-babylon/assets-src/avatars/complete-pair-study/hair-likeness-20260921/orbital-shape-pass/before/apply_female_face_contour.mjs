/** Apply the native face field to arbitrary LOD vertices and morphs. */
import assert from 'node:assert/strict';
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function warp(p,s) {
  // glTF Y is Blender Z; glTF Z is -Blender Y.
  const [x,z,front]=p,y=-front;
  const jaw=(1-smooth(Math.abs(z-s.jawCenterZ)/s.jawHalfHeight))*smooth((s.jawFrontY-y)/s.jawFrontSpan);
  const mouth=(1-smooth(Math.abs(x)/s.mouthHalfWidth))*(1-smooth(Math.abs(z-s.mouthCenterZ)/s.mouthHalfHeight))*smooth((s.mouthFrontY-y)/s.mouthFrontSpan);
  const corner=(1-smooth(Math.abs(Math.abs(x)-s.cornerX)/s.cornerHalfWidth))*(1-smooth(Math.abs(z-s.mouthCenterZ)/s.cornerHalfHeight))*smooth((-.095-y)/.025);
  const q=[x*(1-s.jawTaper*jaw)+s.mouthWiden*x*mouth,z-s.mouthCompress*(z-s.mouthCenterZ)*mouth+s.cornerLift*corner,front-s.mouthRecess*mouth];
  if(s.version>=2) {
    const angle=(1-smooth(Math.abs(z-1.520)/.043))*smooth((.012-y)/.075)*smooth((Math.abs(x)-.026)/.025)*(1-smooth((Math.abs(x)-.057)/.008));
    q[0]*=1-s.jawAngleTaper*angle;
    const chin=(1-smooth(Math.abs(z-s.chinCenterZ)/s.chinHalfHeight))*(1-smooth(Math.abs(x)/s.chinHalfWidth))*smooth((s.chinFrontY-y)/s.chinFrontSpan);
    q[2]-=s.chinRecess*chin; q[1]+=s.chinLift*chin;
    const cheek=(1-smooth(Math.abs(Math.abs(x)-s.cheekCenterX)/s.cheekHalfWidth))*(1-smooth(Math.abs(z-s.cheekCenterZ)/s.cheekHalfHeight))*smooth((s.cheekFrontY-y)/s.cheekFrontSpan);
    q[2]+=s.cheekFullness*cheek;
    const nose=(1-smooth(Math.abs(x)/s.noseHalfWidth))*(1-smooth(Math.abs(z-s.noseCenterZ)/s.noseHalfHeight))*smooth((s.noseFrontY-y)/s.noseFrontSpan);
    q[2]-=s.noseRecess*nose; q[0]-=s.noseTaper*x*nose;
  }
  if(s.version>=3) {
    const gate=smooth((-.083-y)/.037);
    const eye=smooth((Math.abs(x)-.025)/.020)*(1-smooth((Math.abs(x)-.052)/.014))*(1-smooth(Math.abs(z-1.607)/.021));
    q[1]+=s.outerEyeLift*eye*gate;
    const brow=1-smooth(Math.abs(z-1.624)/.028);
    const inner=1-smooth(Math.abs(Math.abs(x)-.014)/.023),arch=1-smooth(Math.abs(Math.abs(x)-.037)/.020);
    q[1]+=(s.innerBrowLift*inner-s.browArchRelax*arch)*brow*gate;
    const upper=(1-smooth(Math.abs(q[1]-1.549)/.008))*smooth((-.133+q[2])/.012);
    const dip=1-smooth(Math.abs(q[0])/.0065),peaks=1-smooth(Math.abs(Math.abs(q[0])-.006)/.005),recess=1-smooth(Math.abs(q[0])/.013);
    q[1]+=(s.cupidPeak*peaks-s.cupidDip*dip)*upper;
    q[2]-=s.upperLipRecess*recess*upper;
  }
  if(s.version>=4) {
    const pad=(1-smooth(Math.abs(Math.abs(x)-s.buccalCenterX)/s.buccalHalfWidth))*(1-smooth(Math.abs(z-s.buccalCenterZ)/s.buccalHalfHeight))*smooth((-.028-y)/.077);
    q[0]+=Math.sign(x)*s.buccalSideFullness*pad;
    q[2]+=s.buccalFrontFullness*pad;
    const ridge=(1-smooth(Math.abs(Math.abs(x)-.054)/.018))*(1-smooth(Math.abs(z-1.580)/.016))*smooth((-.045-y)/.055);
    q[0]-=Math.sign(x)*s.cheekRidgeEase*ridge;
    q[2]-=s.cheekRidgeRecess*ridge;
    const chinCorner=(1-smooth(Math.abs(Math.abs(x)-.024)/.019))*(1-smooth(Math.abs(z-1.504)/.023))*smooth((-.075-y)/.045);
    q[1]+=s.chinCornerLift*chinCorner;
  }
  if(s.version>=5) {
    const tip=(1-smooth(Math.abs(x)/.021))*(1-smooth(Math.abs(z-1.574)/.024))*smooth((-.126-y)/.022);
    const wing=(1-smooth(Math.abs(Math.abs(x)-.013)/.011))*(1-smooth(Math.abs(z-1.571)/.016))*smooth((-.119-y)/.021);
    q[2]-=s.noseTipRecess*tip;
    q[1]+=s.noseTipLift*tip;
    q[0]-=Math.sign(x)*s.noseWingInset*wing;
    const lipFront=smooth((-.124+q[2])/.015);
    const shoulder=smooth((Math.abs(q[0])-.004)/.009)*(1-smooth((Math.abs(q[0])-.014)/.009))*(1-smooth(Math.abs(q[1]-s.mouthCenterZ)/.015))*lipFront;
    const upper=(1-smooth(Math.abs(q[0])/.020))*(1-smooth(Math.abs(q[1]-1.549)/.009))*lipFront;
    const lower=(1-smooth(Math.abs(q[0])/.018))*(1-smooth(Math.abs(q[1]-1.537)/.009))*lipFront;
    q[2]-=s.lipShoulderRecess*shoulder+s.upperLipBalanceRecess*upper+s.lowerLipBalanceRecess*lower;
    q[1]-=s.lipShoulderCompress*(q[1]-s.mouthCenterZ)*shoulder;
  }
  return q;
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const d=Math.hypot(...v);assert(d>1e-9);return v.map(x=>x/d);};
function jacobian(p,s) {
  const h=1e-5;
  return [0,1,2].map(a=>{const lo=[...p],hi=[...p];lo[a]-=h;hi[a]+=h;const l=warp(lo,s),r=warp(hi,s);return r.map((v,i)=>(v-l[i])/(2*h));});
}
function normalAt(n,p,s) {
  const j=jacobian(p,s),cof=[cross(j[1],j[2]),cross(j[2],j[0]),cross(j[0],j[1])];
  return unit([0,1,2].map(i=>cof.reduce((sum,c,a)=>sum+c[i]*n[a],0)));
}
export function applyFaceContour(doc,record) {
  assert([1,2,3,4,5].includes(record.spec.version));
  if(record.spec.version>=2) {
    const iris=doc.getRoot().listMaterials().find(m=>m.getName()==='Launch female iris');assert(iris);
    iris.setBaseColorFactor(iris.getBaseColorFactor().map((v,i)=>v*record.spec.irisColorFactor[i]));
  }
  const meshes={};
  for(const name of [record.mesh,...(record.companionMeshes??[])]) {
  const node=doc.getRoot().listNodes().find(n=>n.getName()===name);assert(node);
  assert.deepEqual(node.getMatrix(),[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  let changed=0,maxMove=0;
  for(const primitive of node.getMesh().listPrimitives()) {
    const pos=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL'),tangent=primitive.getAttribute('TANGENT');
    for(let i=0;i<pos.getCount();i++) {
      const p=pos.getElement(i,[]),q=warp(p,record.spec);
      const move=Math.hypot(...q.map((v,a)=>v-p[a]));
      if(move>0){changed++;maxMove=Math.max(maxMove,move);}
      const n=normal?.getElement(i,[]),nn=n?(move>0?normalAt(n,p,record.spec):n):null;
      for(const [targetIndex,target] of primitive.listTargets().entries()) {
        const scale=node.getMesh().getExtras().targetNames[targetIndex]==='Expression_Smile'?record.spec.smileScale:1;
        const dp=target.getAttribute('POSITION'),dn=target.getAttribute('NORMAL');
        const d=dp.getElement(i,[]),pp=p.map((v,a)=>v+d[a]),qq=warp(pp,record.spec);
        if(move===0&&scale===1&&qq.every((v,a)=>v===pp[a]))continue;
        dp.setElement(i,qq.map((v,a)=>(v-q[a])*scale));
        if(dn){
          const nd=dn.getElement(i,[]);
          // Preserve inactive morph vertices exactly. Renormalizing an unchanged
          // float normal would introduce tiny deltas across the entire body.
          if(d.every(v=>v===0)&&nd.every(v=>v===0))dn.setElement(i,[0,0,0]);
          else {const posedNormal=normalAt(n.map((v,a)=>v+nd[a]),pp,record.spec);dn.setElement(i,posedNormal.map((v,a)=>(v-nn[a])*scale));}
        }
      }
      if(move===0)continue;
      if(tangent){const t=tangent.getElement(i,[]),j=jacobian(p,record.spec),tt=unit([0,1,2].map(a=>j.reduce((v,col,k)=>v+col[a]*t[k],0)));tangent.setElement(i,[...tt,t[3]]);}
      pos.setElement(i,q);if(normal)normal.setElement(i,nn);
    }
  }
  meshes[name]={changedVertices:changed,maximumDisplacementMm:maxMove*1000};
  }
  return {...meshes[record.mesh],companionRevisions:Object.fromEntries(Object.entries(meshes).filter(([name])=>name!==record.mesh))};
}
