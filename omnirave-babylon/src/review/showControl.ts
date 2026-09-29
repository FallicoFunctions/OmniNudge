import '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Shaders/bloomMerge.fragment.js';
import '@babylonjs/core/Shaders/extractHighlights.fragment.js';
import '@babylonjs/core/Shaders/kernelBlur.fragment.js';
import '@babylonjs/core/Shaders/kernelBlur.vertex.js';
import '@babylonjs/core/Shaders/postprocess.vertex.js';
import '@babylonjs/core/Shaders/imageProcessing.fragment.js';
import '@babylonjs/core/Shaders/fxaa.fragment.js';
import '@babylonjs/core/Shaders/fxaa.vertex.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3,Color4 } from '@babylonjs/core/Maths/math.color.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { createSoundBooth } from '../scene/createSoundBooth';
import { createHologramGrid } from '../scene/createHologramGrid';
import { createPlayerRig } from '../player/createPlayerRig';
import { createFollowCameraRig } from '../player/createFollowCameraRig';
import { createPlayerController } from '../player/playerController';
import { createInputMap } from '../player/createInputMap';
import { createWorldSocket, type WorldSocketStatus } from '../network/worldSocket';
import { createShowControlRuntime } from '../showControl/createShowControlRuntime';
import { createMainStageCollisionBlockers } from '../scene/createMainStageCollisionBlockers';
import { showReviewLocation } from './showReviewLocation';

export function startShowControlReview(onConnection:(status:WorldSocketStatus)=>void){
const host=document.getElementById('show-review')!,canvas=document.getElementById('show-canvas') as HTMLCanvasElement;
const parameters=new URLSearchParams(location.search),world=parameters.get('world'),token=parameters.get('wtoken');
if(!world||!token)throw new Error('A player connection is required.');
  // Review credentials are kept in memory only, and stripped from the address bar.
  history.replaceState(null,'',showReviewLocation(location.search,location.pathname).cleanUrl);
  const engine=new Engine(canvas,true,{preserveDrawingBuffer:true},true);engine.setHardwareScalingLevel(Math.max(1,devicePixelRatio/1.5));
  const scene=new Scene(engine);scene.clearColor=new Color4(.002,.005,.012,1);
  const light=new HemisphericLight('review-light',new Vector3(0,1,-.4),scene);light.intensity=.8;
  const ground=MeshBuilder.CreateGround('review-ground',{width:260,height:260},scene);
  const surface=new StandardMaterial('review-ground-material',scene);surface.diffuseColor=new Color3(.04,.055,.075);surface.specularColor=Color3.Black();ground.material=surface;
  const booth=createSoundBooth(scene),floor=booth.meshes.find(m=>m.name==='sound-booth-deck')!;
  const sentinel=MeshBuilder.CreateBox('main-stage-hero-screen-panel-l',{size:.01},scene);sentinel.isVisible=false;
  const grid=createHologramGrid(scene,{getFrequencyData:target=>target.fill(0)});
  const rig=createPlayerRig(scene,new Vector3(0,1.65,-73)),camera=createFollowCameraRig(scene,rig.root,{groundCollisionMeshes:[ground,floor]});
  camera.applyCheckpointView({alpha:-Math.PI/2,beta:1.1,radius:10,focusOffset:{x:0,y:0,z:0}});scene.activeCamera=camera.camera;
  const input=createInputMap(window);const controller=createPlayerController({playerRig:rig,avatarRoot:rig.avatarAnchor,camera:camera.camera,input:input.state,collisionMeshes:[ground,floor],solidCollisionMeshes:createMainStageCollisionBlockers(scene,[])});
  const pipeline=new DefaultRenderingPipeline('review-show-pipeline',true,scene,[camera.camera]);pipeline.samples=1;pipeline.fxaaEnabled=true;pipeline.bloomEnabled=true;pipeline.bloomThreshold=.65;pipeline.bloomWeight=.45;pipeline.bloomKernel=56;
  pipeline.imageProcessing.toneMappingEnabled=true;pipeline.imageProcessing.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
  const socket=createWorldSocket({url:world,token});const runtime=createShowControlRuntime({host,scene,socket,playerRig:rig,playerController:controller,cameraRig:camera,hologram:grid});
  let initialized=false;
  const peers=new Map<string,ReturnType<typeof MeshBuilder.CreateCapsule>>();
  socket.onSnapshot(snapshot=>{
    if(!initialized){const local=snapshot.players.find(p=>p.id===snapshot.currentPlayerId);if(local){rig.root.position.set(local.position.x,local.position.y,local.position.z);initialized=true;}}
    runtime.applySnapshot(snapshot);
    const ids=new Set<string>();for(const p of snapshot.players){if(p.id===snapshot.currentPlayerId)continue;ids.add(p.id);let mesh=peers.get(p.id);
      if(!mesh){mesh=MeshBuilder.CreateCapsule(`review-player-${p.id}`,{height:1.8,radius:.27},scene);const mat=new StandardMaterial(`review-player-material-${p.id}`,scene);mat.diffuseColor=new Color3(.2,.6,.7);mesh.material=mat;peers.set(p.id,mesh);}
      mesh.position.set(p.position.x,p.position.y-.75,p.position.z);
    }
    for(const [id,mesh] of peers)if(!ids.has(id)){mesh.material?.dispose();mesh.dispose();peers.delete(id);}
  });
  socket.onStatusChange(onConnection);socket.connect();
  let pointer:number|null=null,lastX=0,lastY=0;
  canvas.addEventListener('pointerdown',event=>{pointer=event.pointerId;lastX=event.clientX;lastY=event.clientY;canvas.setPointerCapture(pointer);runtime.unlockAudio();});
  canvas.addEventListener('pointermove',event=>{if(pointer!==event.pointerId)return;camera.orbit((event.clientX-lastX)*.003,-(event.clientY-lastY)*.003);lastX=event.clientX;lastY=event.clientY;});
  canvas.addEventListener('pointerup',()=>{pointer=null;});canvas.addEventListener('pointercancel',()=>{pointer=null;});
  canvas.addEventListener('wheel',event=>{event.preventDefault();camera.zoom(event.deltaY*.01);},{passive:false});
  const resize=()=>engine.resize();window.addEventListener('resize',resize);
  engine.runRenderLoop(()=>{const dt=engine.getDeltaTime()/1000;runtime.update();controller.step(dt);camera.syncZoomState(dt);grid.update(dt);scene.render();if(initialized&&!runtime.operating)socket.sendMove(rig.root.position);});
  window.addEventListener('pagehide',()=>{runtime.dispose();socket.dispose();input.dispose();engine.stopRenderLoop();grid.dispose();booth.dispose();pipeline.dispose();scene.dispose();engine.dispose();window.removeEventListener('resize',resize);},{once:true});
}
