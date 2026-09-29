/** Apply the native lower-face field to arbitrary LOD vertices and morphs. */
import assert from 'node:assert/strict';
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function warp(p,s) {
  // glTF Y is Blender Z; glTF Z is -Blender Y.
  const [x,z,front]=p,y=-front;
  const jaw=(1-smooth(Math.abs(z-s.jawCenterZ)/s.jawHalfHeight))*smooth((s.jawFrontY-y)/s.jawFrontSpan);
  const mouth=(1-smooth(Math.abs(x)/s.mouthHalfWidth))*(1-smooth(Math.abs(z-s.mouthCenterZ)/s.mouthHalfHeight))*smooth((s.mouthFrontY-y)/s.mouthFrontSpan);
  const corner=(1-smooth(Math.abs(Math.abs(x)-s.cornerX)/s.cornerHalfWidth))*(1-smooth(Math.abs(z-s.mouthCenterZ)/s.cornerHalfHeight))*smooth((-.095-y)/.025);
  return [x*(1-s.jawTaper*jaw)+s.mouthWiden*x*mouth,z-s.mouthCompress*(z-s.mouthCenterZ)*mouth+s.cornerLift*corner,front-s.mouthRecess*mouth];
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
  assert.equal(record.spec.version,1);
  const node=doc.getRoot().listNodes().find(n=>n.getName()===record.mesh);assert(node);
  assert.deepEqual(node.getMatrix(),[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  let changed=0,maxMove=0;
  for(const primitive of node.getMesh().listPrimitives()) {
    const pos=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL'),tangent=primitive.getAttribute('TANGENT');
    for(let i=0;i<pos.getCount();i++) {
      const p=pos.getElement(i,[]),q=warp(p,record.spec);
      const move=Math.hypot(...q.map((v,a)=>v-p[a]));if(move===0)continue;
      changed++;maxMove=Math.max(maxMove,move);
      const n=normal?.getElement(i,[]),nn=n?normalAt(n,p,record.spec):null;
      for(const target of primitive.listTargets()) {
        const dp=target.getAttribute('POSITION'),dn=target.getAttribute('NORMAL');
        const d=dp.getElement(i,[]),pp=p.map((v,a)=>v+d[a]),qq=warp(pp,record.spec);
        dp.setElement(i,qq.map((v,a)=>v-q[a]));
        if(dn){const nd=dn.getElement(i,[]),posedNormal=normalAt(n.map((v,a)=>v+nd[a]),pp,record.spec);dn.setElement(i,posedNormal.map((v,a)=>v-nn[a]));}
      }
      if(tangent){const t=tangent.getElement(i,[]),j=jacobian(p,record.spec),tt=unit([0,1,2].map(a=>j.reduce((v,col,k)=>v+col[a]*t[k],0)));tangent.setElement(i,[...tt,t[3]]);}
      pos.setElement(i,q);if(normal)normal.setElement(i,nn);
    }
  }
  return {changedVertices:changed,maximumDisplacementMm:maxMove*1000};
}
