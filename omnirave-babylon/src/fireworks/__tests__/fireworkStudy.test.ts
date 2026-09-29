import { describe,expect,it } from 'vitest';
import { FIREWORK_CATALOGUE,resolveFirework } from '../fireworkCatalogue';
import { createFireworkStudy,parseStudySeed,sampleStar,starBrightness } from '../fireworkStudy';

describe('individual firework studies',()=>{
  it('reconstructs identical motion after seeking backward and replaying a seed',()=>{
    const a=createFireworkStudy(resolveFirework('F20'),42),b=createFireworkStudy(resolveFirework('F20'),42);
    expect(a).toEqual(b);
    const before=a.stars.map(star=>sampleStar(star,1.1));
    a.stars.forEach(star=>sampleStar(star,4));a.stars.forEach(star=>sampleStar(star,.1));
    expect(a.stars.map(star=>sampleStar(star,1.1))).toEqual(before);
    expect(createFireworkStudy(resolveFirework('F20'),43).stars).not.toEqual(a.stars);
  });
  it('supports the complete catalogue across seeds with finite motion and a fully dark end',()=>{
    expect(FIREWORK_CATALOGUE).toHaveLength(25);
    for(const definition of FIREWORK_CATALOGUE)for(const seed of [0,42,4294967295]){
      const study=createFireworkStudy(definition,seed);
      expect(study.duration).toBeLessThan(20);
      for(const star of study.stars){
        for(const age of [0,.017,.5,1.5,star.life])expect(sampleStar(star,age).every(Number.isFinite)).toBe(true);
        expect(starBrightness(star,-.01)).toBe(0);
        expect(starBrightness(star,study.duration-star.birth)).toBe(0);
        expect(star.birth+star.life+star.tail).toBeLessThan(study.duration);
      }
      expect(study.events.map(event=>event.time)).toEqual(study.events.map(event=>event.time).sort((a,b)=>a-b));
    }
  });
  it('splits every crossette parent into exactly four stars at its actual moving position',()=>{
    const study=createFireworkStudy(resolveFirework('F17'),62);
    const parents=study.stars.filter(star=>star.behavior!=='rocket'&&star.parent===undefined);
    for(const parent of parents){
      const children=study.stars.filter(star=>star.parent===parent.id);
      expect(children).toHaveLength(4);
      const position=sampleStar(parent,parent.life);
      for(const child of children){expect(sampleStar(child,0)).toEqual(position);expect(child.birth).toBe(parent.birth+parent.life);}
      // The four relative branches sum to zero, retaining the parent's drift.
      const prev=sampleStar(parent,parent.life-.001);
      for(let axis=0;axis<3;axis++)expect(children.reduce((sum,child)=>sum+child.velocity[axis],0)/4).toBeCloseTo((position[axis]-prev[axis])*1000,5);
    }
  });
  it('keeps patterned shells in a fixed world plane with an open center',()=>{
    const ring=createFireworkStudy(resolveFirework('F22'),42);
    for(const star of ring.stars.slice(1)){
      const p=sampleStar(star,1.2);
      expect(Math.abs(p[2])).toBeLessThan(.3);
      expect(Math.hypot(p[0],p[1]-45)).toBeGreaterThan(12);
    }
  });
  it('keeps strobe darkness separate from crackling sound events',()=>{
    const study=createFireworkStudy(resolveFirework('F11'),42);
    expect(study.events.map(event=>event.kind)).toEqual(['launch','break']);
    const star=study.stars[1];
    const levels=Array.from({length:100},(_,i)=>starBrightness(star,.4+i*.015));
    expect(Math.min(...levels)).toBe(0);expect(Math.max(...levels)).toBeGreaterThan(.5);
  });
  it('rejects invalid or unbounded URL seeds',()=>{
    for(const value of [null,'','NaN','Infinity','-1','4294967296','2.3','1e5','<script>'])expect(parseStudySeed(value)).toBe(42);
    expect(parseStudySeed('0')).toBe(0);expect(parseStudySeed('4294967295')).toBe(4294967295);
  });
});
