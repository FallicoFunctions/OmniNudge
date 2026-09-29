import './fireworks.css';
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
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3,Color4 } from '@babylonjs/core/Maths/math.color.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { FIREWORK_CATALOGUE,resolveFirework } from '../fireworks/fireworkCatalogue';
import { createFireworkStudy,parseStudySeed,clamp,studyPhase } from '../fireworks/fireworkStudy';
import { createFireworkStudyRenderer } from '../fireworks/createFireworkStudyRenderer';
import { createFireworkStudyAudio } from '../audio/createFireworkStudyAudio';

function element<T extends HTMLElement>(id:string):T {
  const value=document.getElementById(id);if(!value)throw new Error(`Missing review control: ${id}`);return value as T;
}
const canvas=element<HTMLCanvasElement>('firework-canvas');
const picker=element<HTMLSelectElement>('firework');
const play=element<HTMLButtonElement>('play');
const timeControl=element<HTMLInputElement>('time');
const seedInput=element<HTMLInputElement>('seed');
const speed=element<HTMLSelectElement>('speed');
const loop=element<HTMLInputElement>('loop');
const sound=element<HTMLInputElement>('sound');
const status=element('status');
const parameters=new URLSearchParams(location.search);
const numberParameter=(key:string,fallback:number,min:number,max:number)=>{
  const raw=parameters.get(key),value=Number(raw);return raw!==null&&Number.isFinite(value)?clamp(value,min,max):fallback;
};

async function start(){
  const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,limitDeviceRatio:2},true);
  const scene=new Scene(engine);scene.clearColor=new Color4(.0006,.001,.002,1);
  const camera=new ArcRotateCamera('firework-review-camera',Math.PI/2,1.47,106,new Vector3(0,29,0),scene);
  camera.fov=.78;camera.minZ=.1;camera.maxZ=1000;camera.lowerRadiusLimit=12;camera.upperRadiusLimit=200;
  camera.lowerBetaLimit=.08;camera.upperBetaLimit=Math.PI-.08;camera.wheelDeltaPercentage=.012;camera.panningSensibility=0;
  camera.attachControl(canvas,true);
  const pipeline=new DefaultRenderingPipeline('firework-review-pipeline',true,scene,[camera]);
  pipeline.samples=1;pipeline.fxaaEnabled=true;pipeline.imageProcessingEnabled=true;
  pipeline.imageProcessing.toneMappingEnabled=true;pipeline.imageProcessing.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
  pipeline.bloomEnabled=true;pipeline.bloomThreshold=.65;pipeline.bloomWeight=.45;pipeline.bloomKernel=56;pipeline.bloomScale=.5;
  const lines:Vector3[][]=[];
  for(let i=-4;i<=4;i++){
    lines.push([new Vector3(i*10,0,-40),new Vector3(i*10,0,40)]);
    lines.push([new Vector3(-40,0,i*10),new Vector3(40,0,i*10)]);
  }
  const guides=MeshBuilder.CreateLineSystem('firework-ground-guides',{lines},scene);guides.color=new Color3(.18,.24,.31);guides.alpha=.4;guides.setEnabled(false);
  const renderer=createFireworkStudyRenderer(scene,camera);
  const audio=createFireworkStudyAudio();
  let study=createFireworkStudy(resolveFirework(parameters.get('firework')),parseStudySeed(parameters.get('seed')));
  let time=numberParameter('t',0,0,study.duration);
  let paused=parameters.has('t')||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let view=parameters.get('view')??'flight';
  let disposed=false,lastPhase='',clock=performance.now(),lastStats=0,quads=0;
  let audioRequest=0;
  for(const definition of FIREWORK_CATALOGUE){const option=document.createElement('option');option.value=definition.id;option.textContent=`${definition.id} · ${definition.name}`;picker.append(option);}
  function saveLocation(){
    const url=new URL(location.href);url.search='';
    const values={firework:study.definition.id,seed:String(study.seed),t:time.toFixed(3),view,
      alpha:camera.alpha.toFixed(4),beta:camera.beta.toFixed(4),radius:camera.radius.toFixed(3),target:camera.target.y.toFixed(3),
      bloom:String(element<HTMLInputElement>('bloom').checked),trails:String(element<HTMLInputElement>('trails').checked),
      sparks:String(element<HTMLInputElement>('sparks').checked),smoke:String(element<HTMLInputElement>('smoke').checked)};
    for(const [key,value] of Object.entries(values))url.searchParams.set(key,value);
    history.replaceState(null,'',url);return url.href;
  }
  function sync(){
    play.textContent=paused?'Play':'Pause';play.setAttribute('aria-pressed',String(!paused));
    timeControl.value=String(time);element('time-label').textContent=`${time.toFixed(2)} / ${study.duration.toFixed(2)} s`;
    const phase=studyPhase(study,time);if(phase!==lastPhase){element('phase').textContent=phase;lastPhase=phase;}
  }
  function resetAudio(includeLaunch=false){audio.reset(study,includeLaunch?-.001:time);}
  function seek(value:number){time=clamp(value,0,study.duration);paused=true;resetAudio();sync();saveLocation();}
  function replay(){time=0;paused=false;clock=performance.now();resetAudio(true);sync();saveLocation();}
  function setView(next:string,save=true){
    view=['flight','burst','side','ground'].includes(next)?next:'flight';
    camera.alpha=view==='side'?0:Math.PI/2;
    camera.beta=view==='ground'?1.06:1.47;
    camera.radius=view==='burst'||view==='side'?58:view==='ground'?96:106;
    camera.target.set(0,view==='burst'||view==='side'?42:view==='ground'?47:29,0);
    camera.inertialAlphaOffset=0;camera.inertialBetaOffset=0;camera.inertialRadiusOffset=0;
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
    if(save)saveLocation();
  }
  function load(id:string,seed:number,autoPlay=true){
    audio.stop();study=createFireworkStudy(resolveFirework(id),seed);
    time=0;paused=!autoPlay;picker.value=study.definition.id;seedInput.value=String(study.seed);
    const definition=study.definition;
    element('design-name').textContent=definition.name;
    element('design-description').textContent=definition.description;
    element('tail-brief').textContent=definition.ascentBrief;
    element('explosion-brief').textContent=definition.explosionBrief;
    element('sound-brief').textContent=definition.soundBrief;
    timeControl.max=String(study.duration);clock=performance.now();resetAudio(true);sync();
    status.textContent=`${definition.id} · ${definition.recognition}`;
  }
  const initialTime=time,initialPaused=paused;
  load(study.definition.id,study.seed,!initialPaused);time=initialTime;paused=initialPaused;resetAudio(initialTime===0&&!paused);
  setView(view,false);
  camera.alpha=numberParameter('alpha',camera.alpha,-Math.PI*8,Math.PI*8);
  camera.beta=numberParameter('beta',camera.beta,.08,Math.PI-.08);
  camera.radius=numberParameter('radius',camera.radius,12,200);
  camera.target.y=numberParameter('target',camera.target.y,0,80);
  for(const id of ['bloom','trails','sparks','smoke']){
    const input=element<HTMLInputElement>(id);input.checked=parameters.get(id)!=='false';input.addEventListener('change',saveLocation);
  }
  pipeline.bloomEnabled=element<HTMLInputElement>('bloom').checked;
  element<HTMLInputElement>('bloom').addEventListener('change',()=>{pipeline.bloomEnabled=element<HTMLInputElement>('bloom').checked;});
  element<HTMLInputElement>('guides').addEventListener('change',()=>guides.setEnabled(element<HTMLInputElement>('guides').checked));
  picker.addEventListener('change',()=>{load(picker.value,study.seed);saveLocation();});
  for(const [id,direction] of [['previous',-1],['next',1]] as const)element(id).addEventListener('click',()=>{
    const index=FIREWORK_CATALOGUE.findIndex(definition=>definition.id===study.definition.id);
    load(FIREWORK_CATALOGUE[(index+direction+FIREWORK_CATALOGUE.length)%FIREWORK_CATALOGUE.length].id,study.seed);saveLocation();
  });
  seedInput.addEventListener('change',()=>{load(study.definition.id,parseStudySeed(seedInput.value));saveLocation();});
  element('variation').addEventListener('click',()=>{load(study.definition.id,crypto.getRandomValues(new Uint32Array(1))[0]);saveLocation();});
  play.addEventListener('click',()=>{
    if(paused&&time>=study.duration){replay();return;}
    paused=!paused;clock=performance.now();resetAudio();sync();saveLocation();
  });
  element('replay').addEventListener('click',replay);
  element('break').addEventListener('click',()=>{seek(study.ascent+Math.min(4,study.definition.life*.45));setView('burst');});
  timeControl.addEventListener('input',()=>seek(Number(timeControl.value)));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view??'flight')));
  speed.addEventListener('change',()=>{resetAudio();element('audio-status').textContent=sound.checked?(speed.value==='1'?'Sound on · spatial preview':'Sound paused during slow motion'):'Sound off · audition at 1× speed';});
  sound.addEventListener('change',async()=>{
    const request=++audioRequest;const intended=sound.checked;resetAudio();
    const success=await audio.enable(intended);
    if(request!==audioRequest||disposed)return;
    sound.checked=success;
    // Anything that happened while unlock was pending is discarded, too.
    resetAudio();
    element('audio-status').textContent=success?(speed.value==='1'?'Sound on · replay to hear the whole firework':'Sound paused during slow motion'):
      intended?'Sound unavailable in this browser':'Sound off · audition at 1× speed';
  });
  element<HTMLInputElement>('volume').addEventListener('input',()=>audio.setVolume(Number(element<HTMLInputElement>('volume').value)/100));
  element('copy-link').addEventListener('click',async()=>{
    const url=saveLocation();
    try{await navigator.clipboard.writeText(url);status.textContent='Review link copied with this design, variation, camera, and moment.';}
    catch{status.textContent='This view is saved in the address bar. Copy that address to return to this moment.';}
  });
  element('save-frame').addEventListener('click',()=>{
    seek(time);scene.render();
    const filename=`${study.definition.id}-seed-${study.seed}-${time.toFixed(2)}s.png`;
    canvas.toBlob(blob=>{if(!blob||disposed)return;const url=URL.createObjectURL(blob);const link=document.createElement('a');
      link.href=url;link.download=filename;link.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Saved this paused frame as a PNG.';});
  });
  const resizeView=()=>{
    engine.resize();
    // Preserve enough horizontal sky for wide bursts in narrow review panels.
    const aspect=Math.max(.1,engine.getAspectRatio(camera));
    camera.fov=2*Math.atan(Math.tan(.78/2)*Math.max(1,1.4/aspect));
  };
  const resize=new ResizeObserver(resizeView);resize.observe(canvas);resizeView();
  const onVisibility=()=>{clock=performance.now();if(document.hidden){paused=true;resetAudio();sync();}};
  document.addEventListener('visibilitychange',onVisibility);
  const render=()=>{
    const now=performance.now(),dt=Math.min(.1,(now-clock)/1000);clock=now;
    if(!paused&&!document.hidden){
      time+=dt*Number(speed.value);
      if(time>=study.duration){
        if(loop.checked){time=0;resetAudio(true);}else{time=study.duration;paused=true;resetAudio();}
      }
    }
    const options={trails:element<HTMLInputElement>('trails').checked,sparks:element<HTMLInputElement>('sparks').checked,
      smoke:element<HTMLInputElement>('smoke').checked,quality:element<HTMLSelectElement>('quality').value==='low'?'low' as const:'high' as const};
    quads=renderer.render(study,time,options);
    if(!paused&&speed.value==='1'){
      const forward=camera.getForwardRay().direction;
      const up=Vector3.TransformNormal(Vector3.UpReadOnly,camera.getWorldMatrix());
      audio.update(study,time,[camera.position.x,camera.position.y,camera.position.z],[forward.x,forward.y,forward.z],[up.x,up.y,up.z]);
    }
    scene.render();sync();
    if(now-lastStats>800){element('performance').textContent=`${Math.round(engine.getFps())} fps · ${study.stars.length-1} stars · ${quads.toLocaleString()} light / smoke quads`;lastStats=now;}
  };
  function dispose(){if(disposed)return;disposed=true;audioRequest++;resize.disconnect();document.removeEventListener('visibilitychange',onVisibility);
    engine.stopRenderLoop(render);audio.dispose();renderer.dispose();pipeline.dispose();scene.dispose();engine.dispose();}
  window.addEventListener('pagehide',dispose,{once:true});
  if(import.meta.hot)import.meta.hot.dispose(dispose);
  element<HTMLFieldSetElement>('library-controls').disabled=false;element<HTMLFieldSetElement>('playback-controls').disabled=false;
  sync();engine.runRenderLoop(render);
}
void start().catch(error=>{console.error('Fireworks review failed',error);status.textContent='The 3D review could not start. Enable hardware acceleration and reload.';});
