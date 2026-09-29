import { describe,it,expect,vi,afterEach } from 'vitest';
import { createShowAudio } from '../createShowAudio';
import { createFireworkStudy } from '../../fireworks/fireworkStudy';
import { resolveFirework } from '../../fireworks/fireworkCatalogue';
function context(){
 const node=()=>({connect:vi.fn(),disconnect:vi.fn()}),param=()=>({value:0});
 const sources:any[]=[],panners:any[]=[];
 const ctx={state:'running',sampleRate:4000,currentTime:0,destination:{},listener:{},
  createGain:()=>({...node(),gain:param()}),createDynamicsCompressor:()=>({...node(),threshold:param(),ratio:param(),attack:param(),release:param()}),
  createPanner:()=>{const p={...node(),positionX:param(),positionY:param(),positionZ:param()};panners.push(p);return p;},
  createBuffer:(_c:number,n:number)=>({getChannelData:()=>new Float32Array(n)}),
  createBufferSource:()=>{const s={...node(),start:vi.fn(),stop:vi.fn(),onended:null,buffer:null};sources.push(s);return s;},resume:vi.fn(),close:vi.fn(async()=>{})};
 return {ctx:ctx as unknown as AudioContext,sources,panners,close:ctx.close};
}
afterEach(()=>vi.restoreAllMocks());
describe('shared firework audio',()=>{
 it('keeps an explicit mute through repeated gesture unlocks',async()=>{
  const fake=context(),audio=createShowAudio(()=>fake.ctx);await audio.unlock();expect(audio.enabled).toBe(true);
  await audio.enable(false);await audio.unlock();expect(audio.enabled).toBe(false);
  await audio.enable(true);expect(audio.enabled).toBe(true);audio.dispose();
 });
 it('uses one context, transforms both emitters, and never replays late events',async()=>{
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const fake=context(),factory=vi.fn(()=>fake.ctx),audio=createShowAudio(factory),study=createFireworkStudy(resolveFirework('F01'),42);
  await audio.enable();
  const a={id:'a',study,time:.1,position:[10,0,0] as [number,number,number],scale:1.65},b={...a,id:'b',position:[-10,0,0] as [number,number,number]};
  audio.update([a,b],[0,0,0],[0,0,1],[0,1,0]);audio.update([a,b],[0,0,0],[0,0,1],[0,1,0]);
  expect(factory).toHaveBeenCalledOnce();expect(fake.sources).toHaveLength(2);expect(fake.panners.map(p=>p.positionX.value)).toEqual([10,-10]);
  audio.update([{...a,id:'late',time:9}],[0,0,0],[0,0,1],[0,1,0]);expect(fake.sources).toHaveLength(2);
  audio.dispose();audio.dispose();expect(fake.sources.every(s=>s.stop.mock.calls.length===1)).toBe(true);expect(fake.close).toHaveBeenCalledOnce();
 });
 it('caps concurrent voices and drops muted events instead of replaying them after unlock',async()=>{
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const fake=context(),audio=createShowAudio(()=>fake.ctx),study=createFireworkStudy(resolveFirework('F01'),42);
  study.events=Array.from({length:60},()=>({time:0,position:[0,0,0],strength:.1,kind:'crackle'}));
  const e={id:'a',study,time:0,position:[0,0,0] as [number,number,number],scale:1};
  audio.update([e],[0,0,0],[0,0,1],[0,1,0]);await audio.enable();audio.update([e],[0,0,0],[0,0,1],[0,1,0]);expect(audio.activeVoices).toBe(0);
  audio.update([{...e,id:'b'}],[0,0,0],[0,0,1],[0,1,0]);expect(audio.activeVoices).toBe(32);
  await audio.enable(false);expect(audio.activeVoices).toBe(0);audio.dispose();
 });
});
