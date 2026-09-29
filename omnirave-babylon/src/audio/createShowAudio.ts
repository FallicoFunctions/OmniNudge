import { synthesizeStudySound } from './createFireworkStudyAudio';
import type { FireworkRenderEntry } from '../fireworks/createFireworkStudyRenderer';
import type { Vec3 } from '../fireworks/fireworkTypes';

/** One context and bounded voice pool for every simultaneous shell. */
export function createShowAudio(contextFactory:()=>AudioContext=()=>new AudioContext()) {
  let context:AudioContext|null=null,master:GainNode|null=null,compressor:DynamicsCompressorNode|null=null;
  let enabled=false,disposed=false,generation=0,muted=false;
  const buffers=new Map<string,AudioBuffer>();
  const delivered=new Map<string,Set<number>>();
  const voices=new Set<{source:AudioBufferSourceNode;panner:PannerNode;gain:GainNode}>();
  function stop(){for(const v of voices){v.source.onended=null;try{v.source.stop();}catch{}v.source.disconnect();v.gain.disconnect();v.panner.disconnect();}voices.clear();}
  async function activate(value=true){
      const request=++generation;enabled=false;
      if(!value||disposed){stop();return false;}
      try{
        if(!context){context=contextFactory();master=context.createGain();compressor=context.createDynamicsCompressor();
          master.gain.value=.3;compressor.threshold.value=-14;compressor.ratio.value=10;compressor.attack.value=.002;compressor.release.value=.18;
          master.connect(compressor);compressor.connect(context.destination);}
        if(context.state==='suspended')await context.resume();
        if(disposed||generation!==request)return false;
        enabled=context.state==='running';return enabled;
      }catch{return false;}
  }
  return {
    enable(value=true){muted=!value;return activate(value);},
    unlock(){return muted?Promise.resolve(false):activate(true);},
    update(entries:(FireworkRenderEntry&{id:string})[],position:Vec3,forward:Vec3,up:Vec3){
      const ids=new Set(entries.map(e=>e.id));for(const id of delivered.keys())if(!ids.has(id))delivered.delete(id);
      if(context && enabled){const l=context.listener;
        if('positionX' in l){l.positionX.value=position[0];l.positionY.value=position[1];l.positionZ.value=position[2];
          l.forwardX.value=forward[0];l.forwardY.value=forward[1];l.forwardZ.value=forward[2];l.upX.value=up[0];l.upY.value=up[1];l.upZ.value=up[2];}}
      for(const entry of entries){
        let seen=delivered.get(entry.id);if(!seen){seen=new Set();delivered.set(entry.id,seen);}
        entry.study.events.forEach((event,index)=>{
          if(seen!.has(index))return;
          const x=event.position[0]*entry.scale+entry.position[0],y=event.position[1]*entry.scale+entry.position[1],z=event.position[2]*entry.scale+entry.position[2];
          const arrival=event.time+Math.hypot(x-position[0],y-position[1],z-position[2])/343;
          if(entry.time<arrival)return;seen!.add(index);
          // Muting, a late join, or background throttling never replays a backlog.
          if(!enabled||disposed||!context||!master||context.state!=='running'||document.hidden||entry.time-arrival>.18||voices.size>=32)return;
          const key=`${entry.study.definition.id}:${event.kind}`;
          let buffer=buffers.get(key);
          if(!buffer){const samples=synthesizeStudySound(entry.study,event.kind,context.sampleRate);
            buffer=context.createBuffer(1,samples.length,context.sampleRate);buffer.getChannelData(0).set(samples);buffers.set(key,buffer);}
          const source=context.createBufferSource(),panner=context.createPanner(),gain=context.createGain();source.buffer=buffer;
          panner.panningModel='HRTF';panner.distanceModel='inverse';panner.refDistance=55;panner.rolloffFactor=.7;
          panner.positionX.value=x;panner.positionY.value=y;panner.positionZ.value=z;gain.gain.value=event.strength;
          source.connect(gain);gain.connect(panner);panner.connect(master);const voice={source,panner,gain};voices.add(voice);
          source.onended=()=>{source.disconnect();panner.disconnect();gain.disconnect();voices.delete(voice);};source.start();
        });
      }
    },
    get enabled(){return enabled;},
    get activeVoices(){return voices.size;},
    stop,
    dispose(){disposed=true;generation++;enabled=false;stop();buffers.clear();delivered.clear();master?.disconnect();compressor?.disconnect();void context?.close().catch(()=>{});context=null;},
  };
}
