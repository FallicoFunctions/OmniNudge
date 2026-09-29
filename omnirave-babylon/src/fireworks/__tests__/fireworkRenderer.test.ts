import '@babylonjs/core/Culling/ray.js';
import { describe,expect,it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { FIREWORK_CATALOGUE, resolveFirework } from '../fireworkCatalogue';
import { createFireworkStudy } from '../fireworkStudy';
import { createFireworkStudyRenderer } from '../createFireworkStudyRenderer';

describe('firework render batches',()=>{
  it('renders every accepted overlapping shell beyond the initial batch size',()=>{
    const engine=new NullEngine(),scene=new Scene(engine);
    const camera=new ArcRotateCamera('test',1,1,90,new Vector3(0,40,0),scene);
    const renderer=createFireworkStudyRenderer(scene,camera,64000);
    const options={trails:true,sparks:true,smoke:true,quality:'low' as const};
    // Two groups use disjoint banks every 700ms; each design is launched once
    // as a group, so this sequence respects cooldowns and bank turnaround.
    const entries=FIREWORK_CATALOGUE.flatMap((design,i)=>Array.from({length:i%2?3:4},(_,j)=>({
      study:createFireworkStudy(design,42),time:7.5-Math.floor(i/2)*.7,
      position:[((i%2?4:0)+j-3)*14,8,0] as [number,number,number],scale:1.65,
    })));
    const expected=entries.reduce((sum,entry)=>sum+renderer.renderMany([entry],options),0);
    expect(expected).toBeGreaterThan(67200);
    expect(renderer.renderMany(entries,options)).toBe(expected);
    expect(()=>scene.render()).not.toThrow();
    for(const mesh of scene.meshes)expect(mesh.subMeshes[0].getBoundingInfo()).toBeDefined();
    const one=renderer.renderMany([entries[4]],options);
    expect(one).toBeGreaterThan(0);expect(one).toBeLessThan(expected);
    expect(renderer.renderMany([],options)).toBe(0);
    renderer.dispose();expect(scene.meshes).toHaveLength(0);scene.dispose();engine.dispose();
  });
  it('supports changing active counts, camera changes, backward seeks, and teardown',()=>{
    const engine=new NullEngine();const scene=new Scene(engine);
    const camera=new ArcRotateCamera('test',1,1,90,new Vector3(0,40,0),scene);
    const renderer=createFireworkStudyRenderer(scene,camera);
    const study=createFireworkStudy(resolveFirework('F05'),42);
    for(const time of [0,3.8,8,1,study.duration]){
      camera.alpha+=.4;
      const count=renderer.render(study,time,{trails:true,sparks:true,smoke:true,quality:'high'});
      expect(()=>scene.render()).not.toThrow();
      for(const mesh of scene.meshes)expect(mesh.subMeshes[0].getBoundingInfo()).toBeDefined();
      if(time===study.duration)expect(count).toBe(0);
    }
    renderer.dispose();expect(scene.meshes).toHaveLength(0);expect(scene.materials).toHaveLength(0);
    scene.dispose();engine.dispose();
  });
});
