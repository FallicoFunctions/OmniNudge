import {Engine} from '@babylonjs/core/Engines/engine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {ArcRotateCamera} from '@babylonjs/core/Cameras/arcRotateCamera.js';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight.js';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color.js';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader.js';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import comparison from './comparison.json';
const el=id=>document.getElementById(id);
const engine=new Engine(el('body-canvas'),true);engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.5));
const scene=new Scene(engine);scene.clearColor=new Color4(.105,.135,.18,1);
const camera=new ArcRotateCamera('camera',Math.PI/2,Math.PI/2,2.5,new Vector3(0,.95,0),scene);camera.attachControl(el('body-canvas'),true);camera.lowerRadiusLimit=1.1;camera.upperRadiusLimit=5;camera.wheelPrecision=60;
camera.minZ=.01;camera.maxZ=20;
const hemi=new HemisphericLight('fill',new Vector3(0,1,0),scene);hemi.intensity=.8;
const key=new DirectionalLight('key',new Vector3(.3,-.6,-1),scene);key.intensity=1.8;
const clay=new PBRMaterial('Body clay',scene);clay.albedoColor=new Color3(.53,.60,.67);clay.roughness=.83;clay.metallic=0;
const cloth=new PBRMaterial('Prototype cloth',scene);cloth.albedoColor=new Color3(.15,.30,.35);cloth.roughness=.86;cloth.metallic=0;
let container,animation,generation=0,playing=false,disposed=false,inspectingFeet=false,inspectingTorso=false;
const frames={relaxed:0,tpose:30,reach:60,crouch:90,step:120};
const paths={male:'male-luxury-festival',female:'female-plurr-warehouse'};
function ref(){const sex=el('character').value==='female'?'female':'male';const original=el('reference').value==='original';el('reference-image').src=original?`/assets-src/avatars/launch-body-proof/${sex}-original.png`:`/assets-src/avatars/reference-turnarounds/${paths[sex]}/front-v1.png`;el('reference-image').alt=`${sex} ${original?'original artwork':'supporting T-pose'}`;el('reference-caption').textContent=original?'Original artwork · appearance authority.':'Supporting T-pose · generated view; hidden anatomy is inferred.';}
function wardrobe(){
  if(!container)return;
  const version=el('revision').value;
  const topStudy=['top01','outfit04'].includes(version);
  const bodyOnly=['body04','body05'].includes(version);
  const showBomber=el('bomber').checked&&el('character').value==='male'&&['body03','outfit04'].includes(version);
  for(const option of el('top').options)option.disabled=option.value!=='none'&&(topStudy ? option.value!=='tailored' : option.value==='tailored');
  if(el('top').selectedOptions[0].disabled)el('top').value='none';
  el('top').disabled=(showBomber&&!topStudy)||bodyOnly;
  el('pants').disabled=bodyOnly||topStudy;
  for(const m of container.meshes){
    if(m.name.startsWith('Luxury_'))m.setEnabled(showBomber);
    if(m.name.startsWith('AvatarTop_'))m.setEnabled((!showBomber||topStudy)&&m.name===`AvatarTop_${el('top').value}`);
    if(m.name.startsWith('AvatarBottoms_'))m.setEnabled(el('pants').checked);
  }
  const modules=container.meshes.filter(m=>m.name.startsWith('Luxury_'));
  el('outfit-status').textContent=version==='outfit04' ? 'Jacket construction experiment · arm-contact findings remain · body and top preserved' : topStudy
    ? 'Body05 + removable top · construction study; jacket and reference tailoring pending'
    : bodyOnly ? 'Body-only study · garment refit pending'
    : showBomber ? `Bomber draft · ${modules.filter(m=>m.isEnabled()).length}/${modules.length} parts enabled · ${el('bomber-version').value==='outfit03'?'layer repair experiment; self-intersections remain':'layering and likeness pending'}` : '';
}
function frameView(){
  const wide=playing||el('pose').value==='reach';
  camera.lowerRadiusLimit=inspectingFeet ? .35 : inspectingTorso ? .65 : 1.1;
  camera.radius=inspectingFeet ? .65 : inspectingTorso ? 1.05 : (wide ? 3.15 : 2.5);
  camera.target.set(0,inspectingFeet ? .10 : inspectingTorso ? 1.28 : (wide ? 1.10 : .95),inspectingFeet ? .12 : 0);
}
function pose(){if(!animation)return;playing=false;frameView();animation.start(true);animation.goToFrame((frames[el('pose').value]??0)/30*animation.targetedAnimations[0].animation.framePerSecond);animation.pause();playing=false;el('motion').textContent='Play joint test';el('motion').setAttribute('aria-pressed','false');}
async function load(){const mine=++generation;ref();el('status').textContent='Loading model…';el('measurements').textContent='';if(container){container.dispose();container=undefined;animation=undefined;}try{const sex=el('character').value==='female'?'female':'male';el('revision').querySelector('option[value=outfit04]').disabled=sex==='female';if(sex==='female'&&el('revision').value==='outfit04')el('revision').value='top01';const version=['body02','body03','body04','body05','top01','outfit04'].includes(el('revision').value)?el('revision').value:'body03';const asset=sex==='male'&&version==='body03'?`male-${['outfit01','outfit02','outfit03'].includes(el('bomber-version').value)?el('bomber-version').value:'outfit02'}`:`${sex}-${version}`;el('bomber').disabled=!(sex==='male'&&['body03','outfit04'].includes(version));el('bomber-version').disabled=version!=='body03';const next=await LoadAssetContainerAsync(`/assets-src/avatars/launch-body-proof/${asset}.glb`,scene);if(disposed||mine!==generation){next.dispose();return;}container=next;container.addAllToScene();for(const m of container.meshes){if(m.getTotalVertices()>0&&!m.name.startsWith('Luxury_')&&m.name!=='AvatarTop_tailored')m.material=m.name.startsWith('AvatarTop_')||m.name.startsWith('AvatarBottoms_')?cloth:clay;}for(const a of container.animationGroups)a.stop();animation=container.animationGroups.find(a=>a.name==='Body joint test');if(!animation)throw new Error('Joint animation is missing');if(['top01','outfit04'].includes(version))el('top').value='tailored';if(version==='outfit04')el('bomber').checked=true;wardrobe();pose();const measured=comparison[sex][['top01','outfit04'].includes(version)?'body05':version];el('measurements').textContent=`Arm span / height: ${measured.spanHeightRatio.toFixed(3)} · body height: ${measured.heightM.toFixed(3)} m · measurements describe this model, not a likeness score`;el('status').textContent=`${sex==='male'?'Male':'Female'} ${version} · ${container.skeletons[0]?.bones.length??0} bones · joint animation loaded · complete feet`; }catch(error){if(mine===generation&&!disposed){container?.dispose();container=undefined;animation=undefined;el('status').textContent=`Unable to load this study: ${error instanceof Error?error.message:'unknown error'}`;}}}
el('character').addEventListener('change',load);el('revision').addEventListener('change',load);el('reference').addEventListener('change',ref);el('top').addEventListener('change',wardrobe);el('pants').addEventListener('change',wardrobe);el('bomber').addEventListener('change',wardrobe);el('bomber-version').addEventListener('change',load);el('pose').addEventListener('change',pose);
el('motion').addEventListener('click',()=>{if(!animation)return;playing=!playing;if(playing){frameView();animation.restart();}else animation.pause();el('motion').textContent=playing?'Pause joint test':'Play joint test';el('motion').setAttribute('aria-pressed',String(playing));});
for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>{inspectingFeet=button.dataset.view==='feet';inspectingTorso=button.dataset.view==='torso';camera.alpha={front:Math.PI/2,'three-quarter':Math.PI/2-.5,profile:0,feet:Math.PI/2-.45,torso:Math.PI/2-.35}[button.dataset.view];camera.beta=inspectingFeet?Math.PI/3:Math.PI/2;frameView();});
const resize=()=>engine.resize();window.addEventListener('resize',resize);engine.runRenderLoop(()=>scene.render());window.addEventListener('pagehide',()=>{disposed=true;generation++;window.removeEventListener('resize',resize);container?.dispose();scene.dispose();engine.dispose();},{once:true});load();
