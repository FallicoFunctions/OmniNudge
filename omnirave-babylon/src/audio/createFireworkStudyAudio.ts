import type { FireworkStudy, StudyEvent, Vec3 } from '../fireworks/fireworkTypes';
import { clamp, seededRandom } from '../fireworks/fireworkStudy';

/** Original procedural sound studies; replace with final mastered assets during art review. */
export function synthesizeStudySound(study:FireworkStudy,kind:StudyEvent['kind'],sampleRate:number):Float32Array {
  const profile=study.definition.sound;
  const duration=kind==='launch'?2.4:kind==='break'?Math.max(profile.decay,study.definition.life*.75):kind==='split'?.23:.09;
  const samples=new Float32Array(Math.ceil(duration*sampleRate));
  const random=seededRandom(study.seed+Number(study.definition.id.slice(1))*997+(kind==='break'?311:17));
  let low=0,phase=0,previous=0;
  for(let i=0;i<samples.length;i++){
    const t=i/sampleRate,n=random()*2-1;
    low+=.075*(n-low);
    const high=n-previous;previous=n;
    const onset=Math.min(1,t/(kind==='break'?profile.attack:.003));
    let value:number;
    if(kind==='launch'){
      phase+=Math.PI*2*(profile.bass*.8*Math.exp(-t*5)+28)/sampleRate;
      value=(Math.sin(phase)*.45+low*.4)*Math.exp(-t*13)+high*.018*Math.sin(Math.PI*t/2.4);
      if(profile.whistle)value+=Math.sin(Math.PI*2*(260*t+170*t*t))*.028*Math.sin(Math.PI*t/2.4);
    }else if(kind==='break'){
      phase+=Math.PI*2*(28+profile.bass*Math.exp(-t*6))/sampleRate;
      const body=Math.sin(phase)*.42+low*.8;
      const burnEnvelope=Math.min(1,t*6)*Math.exp(-t/Math.max(.3,study.definition.life*.24));
      const modulation=study.definition.family==='bees'?(.5+.5*Math.sin(t*65)):study.definition.family==='whirlwind'||study.definition.family==='wave'?(.7+.3*Math.sin(t*9)):1;
      value=body*Math.exp(-t*4/profile.decay)+high*.28*Math.exp(-t*45)+n*profile.burn*.17*burnEnvelope*modulation;
    }else{
      value=(high*.42+low)*Math.exp(-t*(kind==='split'?32:75));
    }
    samples[i]=Math.tanh(value*onset)*.65;
  }
  return samples;
}

export function createFireworkStudyAudio(contextFactory:()=>AudioContext=()=>new AudioContext()) {
  let context:AudioContext|null=null;
  let master:GainNode|null=null;
  let compressor:DynamicsCompressorNode|null=null;
  let enabled=false,disposed=false,volume=.3,generation=0;
  let cacheKey='';
  const buffers=new Map<StudyEvent['kind'],AudioBuffer>();
  const sources=new Set<{source:AudioBufferSourceNode;panner:PannerNode;gain:GainNode}>();
  const delivered=new Set<number>();
  let activeStudy:FireworkStudy|null=null;
  let mutedThrough=-1;

  function stop(){
    for(const voice of sources){voice.source.onended=null;try{voice.source.stop();}catch{/* Already ended. */}
      voice.source.disconnect();voice.panner.disconnect();voice.gain.disconnect();}
    sources.clear();
  }
  return {
    async enable(value:boolean):Promise<boolean>{
      const request=++generation;
      enabled=false;stop();
      if(!value||disposed)return false;
      try{
        if(!context){
          context=contextFactory();master=context.createGain();compressor=context.createDynamicsCompressor();
          compressor.threshold.value=-14;compressor.ratio.value=10;compressor.attack.value=.002;compressor.release.value=.18;
          master.gain.value=volume;master.connect(compressor);compressor.connect(context.destination);
        }
        if(context.state==='suspended')await context.resume();
        if(disposed||generation!==request)return false;
        enabled=context.state==='running';return enabled;
      }catch{enabled=false;return false;}
    },
    setVolume(value:number){volume=Number.isFinite(value)?clamp(value,0,1):.3;if(master&&context)master.gain.setTargetAtTime(volume,context.currentTime,.015);},
    reset(study:FireworkStudy,time:number){
      stop();activeStudy=study;delivered.clear();mutedThrough=time;
      const key=`${study.definition.id}:${study.seed}`;
      if(cacheKey!==key){buffers.clear();cacheKey=key;}
      // Seek, pause, unlock, and selection changes must never replay a backlog.
      study.events.forEach((event,index)=>{if(event.time<=time)delivered.add(index);});
    },
    update(study:FireworkStudy,time:number,position:Vec3,forward:Vec3,up:Vec3){
      if(!enabled||disposed||!context||!master||context.state!=='running')return;
      if(activeStudy!==study)return;
      const listener=context.listener;
      if('positionX' in listener){
        listener.positionX.value=position[0];listener.positionY.value=position[1];listener.positionZ.value=position[2];
        listener.forwardX.value=forward[0];listener.forwardY.value=forward[1];listener.forwardZ.value=forward[2];
        listener.upX.value=up[0];listener.upY.value=up[1];listener.upZ.value=up[2];
      }
      for(let index=0;index<study.events.length;index++){
        const event=study.events[index];
        if(delivered.has(index)||event.time<=mutedThrough)continue;
        const distance=Math.hypot(event.position[0]-position[0],event.position[1]-position[1],event.position[2]-position[2]);
        const arrival=event.time+distance/343;
        if(time<arrival)continue;
        delivered.add(index);
        if(time-arrival>.18||sources.size>=24)continue;
        let buffer=buffers.get(event.kind);
        if(!buffer){
          const samples=synthesizeStudySound(study,event.kind,context.sampleRate);
          buffer=context.createBuffer(1,samples.length,context.sampleRate);buffer.getChannelData(0).set(samples);buffers.set(event.kind,buffer);
        }
        const source=context.createBufferSource(),panner=context.createPanner(),gain=context.createGain();
        source.buffer=buffer;panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=55;panner.rolloffFactor=.7;
        panner.positionX.value=event.position[0];panner.positionY.value=event.position[1];panner.positionZ.value=event.position[2];
        gain.gain.value=event.strength;source.connect(gain);gain.connect(panner);panner.connect(master);
        const voice={source,panner,gain};sources.add(voice);
        source.onended=()=>{source.disconnect();gain.disconnect();panner.disconnect();sources.delete(voice);};
        source.start();
      }
    },
    stop,
    get activeVoices(){return sources.size;},
    get enabled(){return enabled;},
    dispose(){if(disposed)return;disposed=true;generation++;enabled=false;stop();buffers.clear();master?.disconnect();compressor?.disconnect();
      if(context)void context.close().catch(()=>{});context=null;master=null;compressor=null;},
  };
}
