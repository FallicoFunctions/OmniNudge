import '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { describe,it,expect } from 'vitest';
import { NullEngine, Scene, Vector3, MeshBuilder, Ray, Mesh } from '@babylonjs/core';
import { createPlayerRig } from '../../player/createPlayerRig';
import { createPlayerController } from '../../player/playerController';
import { createFollowCameraRig } from '../../player/createFollowCameraRig';
import { createHologramGrid } from '../../scene/createHologramGrid';
import { createSoundBooth } from '../../scene/createSoundBooth';
import { FIREWORK_CATALOGUE } from '../../fireworks/fireworkCatalogue';
import { createFireworkStudy,sampleStar,starBrightness } from '../../fireworks/fireworkStudy';
import { SHOW_RULES } from '../showTypes';

describe('shared show integration',()=>{
  it('locks movement, jump and crouch, allows stationary look, then restores the prior camera',()=>{
    const engine=new NullEngine(),scene=new Scene(engine),rig=createPlayerRig(scene,new Vector3(0,1.65,-73));
    const camera=createFollowCameraRig(scene,rig.root);camera.applyCheckpointView({alpha:-1.5,beta:1.1,radius:8,focusOffset:{x:0,y:0,z:0}});
    const input={forward:true,backward:false,left:false,right:true,jump:true,sprint:true,up:false,down:false,crouch:true};
    const controller=createPlayerController({playerRig:rig,avatarRoot:rig.avatarAnchor,camera:camera.camera,collisionMeshes:[],input});
    const anchor=new Vector3(-.92,2.15,-67.3);controller.setOperatingPosition(anchor);camera.setOperatorView(true);
    for(let frame=0;frame<120;frame++){controller.jump();controller.step(1/60);camera.syncZoomState(1/60);}
    expect(rig.root.position.asArray()).toEqual(anchor.asArray());expect(rig.crouched).toBe(false);
    camera.orbit(.3,.1);camera.zoom(80);camera.camera.getViewMatrix(true);
    expect(Vector3.Distance(camera.camera.position,anchor)).toBeLessThan(.001);
    controller.setOperatingPosition(null);rig.root.position.set(0,1.65,-73);camera.setOperatorView(false);camera.syncZoomState(1/60);camera.camera.getViewMatrix(true);
    expect(camera.camera.radius).toBeCloseTo(8);expect(camera.camera.alpha).toBeCloseTo(-1.5);expect(camera.camera.beta).toBeCloseTo(1.1);
    controller.step(.1);expect(rig.root.position.z).not.toBe(-73);
    scene.dispose();engine.dispose();
  });
  it('reconstructs the same drone positions after a late join with different local frame and audio history',()=>{
    const engine=new NullEngine(),a=new Scene(engine),b=new Scene(engine);
    for(const scene of [a,b])MeshBuilder.CreateBox('main-stage-hero-screen-panel-l',{},scene);
    const ga=createHologramGrid(a,{getFrequencyData:t=>t.fill(220)}),gb=createHologramGrid(b,{getFrequencyData:t=>t.fill(0)});
    const state={clip:'wave',startsAt:100000,endsAt:114000,transitionMs:2500,from:[{clip:'cylinder',weight:.7},{clip:'sphere',weight:.3}],next:''};
    for(let frame=0;frame<90;frame++){ga.setControlState(state,100000+frame*16);ga.update(.016);}
    ga.setEventState({phase:'active',activeMinute:3});ga.setControlState(state,101650);ga.update(.032);
    gb.setControlState(state,101650);gb.update(.25);
    const matrices=(scene:Scene)=>Array.from((scene.meshes.find(m=>m.name.includes('hologram-grid-point')) as Mesh).thinInstanceGetWorldMatrices()).flatMap(m=>Array.from(m.m));
    expect(ga.litPoints).toBeGreaterThan(1000);expect(ga.formationOverride).toBe('none');expect(matrices(a)).toEqual(matrices(b));
    ga.dispose();gb.dispose();a.dispose();b.dispose();engine.dispose();
  });
  it('bounds every shell lifetime and keeps lit heads visible past the booth roof',()=>{
    const engine=new NullEngine(),scene=new Scene(engine),booth=createSoundBooth(scene);
    const roof=booth.meshes.filter(m=>m.name==='sound-booth-canopy'||m.name==='sound-booth-canopy-valance');roof.forEach(m=>m.computeWorldMatrix(true));
    const blocked:string[]=[];
    for(const definition of FIREWORK_CATALOGUE){const rule=SHOW_RULES.fireworks.find(r=>r.id===definition.id)!;
      for(const seed of [1,42,4294967295]){
        const study=createFireworkStudy(definition,seed);expect(study.duration*1000,definition.id).toBeLessThanOrEqual(rule.durationMs);
        if(seed!==42)continue;
        for(let t=3;t<study.duration;t+=1)for(const star of study.stars.filter((_,i)=>i%13===0)){
          if(starBrightness(star,t-star.birth)<.1)continue;
          const point=sampleStar(star,t-star.birth);if(point[1]<15)continue;
          for(const bank of [SHOW_RULES.banks[0],SHOW_RULES.banks[3],SHOW_RULES.banks[6]])for(const x of [-.92,.92]){
            const eye=new Vector3(x,2.15,-67.3),world=new Vector3(point[0]*bank.scale+bank.x,point[1]*bank.scale+bank.y,point[2]*bank.scale+bank.z);
            const direction=world.subtract(eye),distance=direction.length();const ray=new Ray(eye,direction.normalize(),distance);
            if(roof.some(m=>ray.intersectsMesh(m,false).hit))blocked.push(`${definition.id}:${t}`);
          }
        }
      }
    }
    expect([...new Set(blocked)]).toEqual([]);booth.dispose();scene.dispose();engine.dispose();
  });
});
