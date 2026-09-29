import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { BoundingInfo } from '@babylonjs/core/Culling/boundingInfo.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import type { FireworkStudy, Rgb, Vec3 } from './fireworkTypes';
import { clamp, sampleStar, starBrightness } from './fireworkStudy';

const vertexSource = `precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
attribute float shape;
uniform mat4 worldViewProjection;
varying vec2 vUV;
varying vec4 vColor;
varying float vShape;
void main(){ vUV=uv; vColor=color; vShape=shape; gl_Position=worldViewProjection*vec4(position,1.0); }`;
const fragmentSource = `precision highp float;
varying vec2 vUV;
varying vec4 vColor;
varying float vShape;
void main(){
  vec2 p=vUV*2.0-1.0;
  float mask;
  if(vShape>1.5){
    float n=0.64+0.16*sin(p.x*13.0+sin(p.y*9.0))+0.12*cos(p.y*17.0+p.x*6.0);
    mask=exp(-dot(p,p)*3.7)*smoothstep(1.0,0.35,length(p))*n;
  }else if(vShape>0.5){
    mask=exp(-p.x*p.x*5.5);
  }else{
    float r=dot(p,p);
    mask=exp(-r*5.0)*0.42+exp(-r*36.0)*0.58;
  }
  float alpha=mask*vColor.a;
  if(alpha<0.002) discard;
  gl_FragColor=vec4(vColor.rgb,alpha);
}`;

/** Two shared batches: alpha smoke and additive emissive heads/trails. */
function createBatch(scene: Scene, name: string, initialCapacity: number, smoke: boolean) {
  let capacity=0;
  let positions = new Float32Array(0);
  let colors = new Float32Array(0);
  let shapes = new Float32Array(0);
  const mesh = new Mesh(name, scene);
  const bounds=new BoundingInfo(new Vector3(-200,-100,-200),new Vector3(200,180,200));
  function reserve(nextCapacity:number){
    capacity=Math.max(1,Math.ceil(nextCapacity));
    const nextPositions=new Float32Array(capacity*12);nextPositions.set(positions);positions=nextPositions;
    const nextColors=new Float32Array(capacity*16);nextColors.set(colors);colors=nextColors;
    const nextShapes=new Float32Array(capacity*4);nextShapes.set(shapes);shapes=nextShapes;
    const uvs=new Float32Array(capacity*8),indices=new Uint32Array(capacity*6);
    for(let i=0;i<capacity;i++){
      uvs.set([0,0,1,0,0,1,1,1],i*8);
      indices.set([i*4,i*4+1,i*4+2,i*4+1,i*4+3,i*4+2],i*6);
    }
    mesh.setVerticesData('position',positions,true,3);
    mesh.setVerticesData('color',colors,true,4);
    mesh.setVerticesData('uv',uvs,false,2);
    mesh.setVerticesData('shape',shapes,true,1);
    mesh.setIndices(indices);
    mesh.setBoundingInfo(bounds);
    // Resizing recreates submeshes; transparent sorting needs bounds again.
    mesh.subMeshes[0].setBoundingInfo(bounds);
  }
  reserve(initialCapacity);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  mesh.renderingGroupId = smoke ? 1 : 2;
  const material = new ShaderMaterial(`${name}-material`,scene,{vertexSource,fragmentSource},
    {attributes:['position','uv','color','shape'],uniforms:['worldViewProjection'],needAlphaBlending:true});
  material.backFaceCulling=false;
  material.disableDepthWrite=true;
  material.alphaMode=smoke ? Constants.ALPHA_COMBINE : Constants.ALPHA_ADD;
  mesh.material=material;
  let count=0;
  return {
    reset(){count=0;},
    quad(a:Vec3,b:Vec3,c:Vec3,d:Vec3,color:Rgb,alpha0:number,alpha1:number,shape:number){
      // Admission is not limited by sky capacity. Grow and retain the buffers
      // instead of silently omitting later shells when the initial pool fills.
      if(count>=capacity) reserve(capacity*2);
      const base=count*4;
      positions.set(a,base*3); positions.set(b,(base+1)*3); positions.set(c,(base+2)*3); positions.set(d,(base+3)*3);
      for(let v=0;v<4;v++){
        const offset=(base+v)*4;
        colors[offset]=color[0];colors[offset+1]=color[1];colors[offset+2]=color[2];
        colors[offset+3]=v<2?alpha0:alpha1;shapes[base+v]=shape;
      }
      count++;
    },
    commit(){
      mesh.setEnabled(count>0);
      if(!count)return;
      mesh.getVertexBuffer('position')!.updateDirectly(positions.subarray(0,count*12),0);
      mesh.getVertexBuffer('color')!.updateDirectly(colors.subarray(0,count*16),0);
      mesh.getVertexBuffer('shape')!.updateDirectly(shapes.subarray(0,count*4),0);
      mesh.subMeshes[0].indexCount=count*6;
    },
    get count(){return count;},
    dispose(){mesh.dispose();material.dispose();},
  };
}

export interface FireworkRenderOptions { trails:boolean; sparks:boolean; smoke:boolean; quality:'high'|'low' }
export interface FireworkRenderEntry { study:FireworkStudy; time:number; position:Vec3; scale:number }
export function createFireworkStudyRenderer(scene:Scene,camera:Camera,capacity=20000) {
  const luminous=createBatch(scene,'firework-study-light',capacity,false);
  const mist=createBatch(scene,'firework-study-smoke',Math.max(1200,capacity/20),true);
  const right=Vector3.Zero(),up=Vector3.Zero(),forward=Vector3.Zero();
  const a:Vec3=[0,0,0],b:Vec3=[0,0,0],c:Vec3=[0,0,0],d:Vec3=[0,0,0];
  const point:Vec3=[0,0,0],prior:Vec3=[0,0,0];
  const tint:Rgb=[0,0,0];
  let origin:Vec3=[0,0,0],worldScale=1;
  function transformQuad(){
    for(const v of [a,b,c,d]) for(let axis=0;axis<3;axis++) v[axis]=v[axis]*worldScale+origin[axis];
  }
  function sprite(position:Vec3,size:number,color:Rgb,alpha:number,smoke=false){
    for(let axis=0;axis<3;axis++){
      const r=axis===0?right.x:axis===1?right.y:right.z;
      const u=axis===0?up.x:axis===1?up.y:up.z;
      a[axis]=position[axis]+(-r-u)*size;b[axis]=position[axis]+(r-u)*size;
      c[axis]=position[axis]+(-r+u)*size;d[axis]=position[axis]+(r+u)*size;
    }
    transformQuad();
    (smoke?mist:luminous).quad(a,b,c,d,color,alpha,alpha,smoke?2:0);
  }
  function segment(p:Vec3,q:Vec3,width:number,color:Rgb,alphaP:number,alphaQ:number){
    const dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2];
    let x=dy*forward.z-dz*forward.y,y=dz*forward.x-dx*forward.z,z=dx*forward.y-dy*forward.x;
    const length=Math.hypot(x,y,z);
    if(length<.000001)return;
    const scale=width/length;x*=scale;y*=scale;z*=scale;
    a[0]=p[0]-x;a[1]=p[1]-y;a[2]=p[2]-z;b[0]=p[0]+x;b[1]=p[1]+y;b[2]=p[2]+z;
    c[0]=q[0]-x;c[1]=q[1]-y;c[2]=q[2]-z;d[0]=q[0]+x;d[1]=q[1]+y;d[2]=q[2]+z;
    transformQuad();
    luminous.quad(a,b,c,d,color,alphaP,alphaQ,1);
  }
  function renderMany(entries:FireworkRenderEntry[],options:FireworkRenderOptions){
      luminous.reset();mist.reset();
      const view=scene.activeCamera??camera;
      const transform=view.getWorldMatrix();
      Vector3.TransformNormalToRef(Vector3.RightReadOnly,transform,right);right.normalize();
      Vector3.TransformNormalToRef(Vector3.UpReadOnly,transform,up);up.normalize();
      view.getForwardRay().direction.normalizeToRef(forward);
      const steps=options.quality==='high'?28:16;
      for(const entry of entries){
      const {study,time}=entry;origin=entry.position;worldScale=entry.scale;
      for(const star of study.stars){
        const age=time-star.birth;
        if(age<0||age>star.life+star.tail)continue;
        const brightness=starBrightness(star,age);
        const cooling=clamp(age/star.life,0,1);
        if(brightness>.001){
          sampleStar(star,age,point);
          // Small head plus a much smaller pale core, never an independently moving core system.
          for(let channel=0;channel<3;channel++)tint[channel]=star.color[channel]*5.5;
          sprite(point,star.width*3.2,tint,brightness*.95);
          tint[0]=6;tint[1]=5.5;tint[2]=4.8;
          sprite(point,star.width*.8,tint,brightness*.7);
        }
        if(options.trails&&star.tail>.12){
          const end=Math.min(age,star.life),begin=Math.max(0,age-star.tail);
          if(end>begin){
            sampleStar(star,begin,prior);
            let oldAlpha=0;
            for(let step=1;step<=steps;step++){
              const emission=begin+(end-begin)*step/steps;
              sampleStar(star,emission,point);
              const oldAge=age-emission;
              // Deposited trail material separates from the head and drifts/cools in world space.
              point[0]+=.13*oldAge;point[1]-=.13*oldAge*oldAge;point[2]+=.04*oldAge;
              const alpha=starBrightness(star,emission)*Math.pow(Math.max(0,1-oldAge/star.tail),1.25)*.8;
              for(let channel=0;channel<3;channel++)tint[channel]=star.trailColor[channel]*(4.2-cooling*1.5);
              segment(prior,point,star.width*(.3+.7*step/steps),tint,oldAlpha,alpha);
              prior[0]=point[0];prior[1]=point[1];prior[2]=point[2];oldAlpha=alpha;
            }
          }
        }
        if(options.sparks&&star.glitter>0){
          const n=options.quality==='high'?star.glitter*4:star.glitter*2;
          for(let i=0;i<n;i++){
            const offset=(i+.5)/n*Math.min(star.tail+1.0,2.6);
            const emission=age-offset;
            if(emission<0||emission>star.life)continue;
            sampleStar(star,emission,point);
            const angle=star.phase+i*2.4;
            point[0]+=Math.sin(angle)*offset*.65;point[1]-=offset*offset*.45;point[2]+=Math.cos(angle)*offset*.65;
            const sparkle=Math.pow(Math.max(0,Math.sin(time*(12+i%5)+angle)),3);
            const alpha=starBrightness(star,emission)*(1-offset/3)*(.15+sparkle*.85);
            for(let channel=0;channel<3;channel++)tint[channel]=star.trailColor[channel]*5;
            sprite(point,.075+sparkle*.04,tint,alpha);
          }
        }
        if(options.smoke&&star.id%5===0&&age>0&&age<star.life+1.8){
          for(let i=0;i<3;i++){
            const emission=Math.min(star.life,age)*(i+1)/4;
            sampleStar(star,emission,point);
            const oldAge=age-emission;point[0]+=.32*oldAge;point[1]+=.08*oldAge;
            const fade=Math.max(0,1-oldAge/8);
            tint[0]=.10+star.trailColor[0]*.12;tint[1]=.10+star.trailColor[1]*.10;tint[2]=.12+star.trailColor[2]*.08;
            sprite(point,.45+oldAge*.38,tint,fade*.026,true);
          }
        }
      }
      const burstAge=time-study.ascent;
      if(burstAge>=0&&burstAge<.14){
        const alpha=Math.pow(1-burstAge/.14,2);
        sprite([0,45,0],1.4+burstAge*5,[4,3.5,2.8],alpha);
      }
      }
      luminous.commit();mist.commit();
      return luminous.count+mist.count;
    }
  return {
    renderMany,
    render(study:FireworkStudy,time:number,options:FireworkRenderOptions){return renderMany([{study,time,position:[0,0,0],scale:1}],options);},
    dispose(){luminous.dispose();mist.dispose();},
  };
}
