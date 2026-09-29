import { describe,expect,it,vi } from 'vitest';
import { FIREWORK_CATALOGUE,resolveFirework } from '../../fireworks/fireworkCatalogue';
import { createFireworkStudy } from '../../fireworks/fireworkStudy';
import { createFireworkStudyAudio,synthesizeStudySound } from '../createFireworkStudyAudio';

function fakeContext(){
  const param=()=>({value:0,setTargetAtTime:vi.fn()});
  const node=()=>({connect:vi.fn(),disconnect:vi.fn()});
  const sources:Array<ReturnType<typeof node>&{start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;onended:(()=>void)|null;buffer:unknown}>=[];
  const context={state:'running',sampleRate:4000,currentTime:0,destination:{},listener:{},
    createGain:()=>({...node(),gain:param()}),createDynamicsCompressor:()=>({...node(),threshold:param(),ratio:param(),attack:param(),release:param()}),
    createPanner:()=>({...node(),positionX:param(),positionY:param(),positionZ:param()}),
    createBuffer:(_channels:number,length:number)=>({getChannelData:()=>new Float32Array(length)}),
    createBufferSource:()=>{const source={...node(),start:vi.fn(),stop:vi.fn(),onended:null,buffer:null};sources.push(source);return source;},
    resume:vi.fn(async()=>{}),close:vi.fn(async()=>{})};
  return {context:context as unknown as AudioContext,raw:context,sources};
}
describe('firework sound review',()=>{
  it('produces finite, non-clipping, repeatable and distinct sound studies',()=>{
    const signatures=new Set<string>();
    for(const definition of FIREWORK_CATALOGUE){
      const study=createFireworkStudy(definition,42),a=synthesizeStudySound(study,'break',4000),b=synthesizeStudySound(study,'break',4000);
      expect(a).toEqual(b);expect(a.every(value=>Number.isFinite(value)&&Math.abs(value)<1)).toBe(true);
      expect(a.some(value=>Math.abs(value)>.1)).toBe(true);
      signatures.add(Array.from(a.slice(100,120)).join(','));
    }
    expect(signatures.size).toBe(25);
  });
  it('requires unlock, delivers an event once, and stops every voice on seek or disposal',async()=>{
    const fake=fakeContext(),factory=vi.fn(()=>fake.context),audio=createFireworkStudyAudio(factory);
    const study=createFireworkStudy(resolveFirework('F01'),42);
    audio.reset(study,-.001);audio.update(study,0,[0,0,0],[0,0,-1],[0,1,0]);expect(factory).not.toHaveBeenCalled();
    await audio.enable(true);audio.update(study,0,[0,0,0],[0,0,-1],[0,1,0]);expect(fake.sources).toHaveLength(1);
    audio.update(study,.01,[0,0,0],[0,0,-1],[0,1,0]);expect(fake.sources).toHaveLength(1);
    audio.reset(study,4);expect(fake.sources[0].stop).toHaveBeenCalledOnce();expect(audio.activeVoices).toBe(0);
    audio.update(study,4.1,[0,45,0],[0,0,-1],[0,1,0]);expect(fake.sources).toHaveLength(1);
    audio.dispose();audio.dispose();expect(fake.raw.close).toHaveBeenCalledOnce();
  });
  it('does not re-enable sound when a pending unlock completes after mute',async()=>{
    const fake=fakeContext();fake.raw.state='suspended';let resume!:()=>void;
    fake.raw.resume.mockImplementation(()=>new Promise<void>(resolve=>{resume=resolve;}));
    const audio=createFireworkStudyAudio(()=>fake.context);
    const unlocking=audio.enable(true);await audio.enable(false);fake.raw.state='running';resume();
    expect(await unlocking).toBe(false);expect(audio.enabled).toBe(false);audio.dispose();
  });
});
