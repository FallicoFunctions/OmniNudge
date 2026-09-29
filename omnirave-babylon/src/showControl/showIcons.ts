import { FIREWORK_CATALOGUE } from '../fireworks/fireworkCatalogue';
import { createFireworkStudy, sampleStar } from '../fireworks/fireworkStudy';
import type { Vec3 } from '../fireworks/fireworkTypes';
const cache=new Map<string,HTMLCanvasElement>();
export function showIcon(id:string):HTMLCanvasElement {
  const cached=cache.get(id);if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;
  const c=canvas.getContext('2d');if(!c)return canvas;
  const fire=FIREWORK_CATALOGUE.find(f=>f.id===id);
  c.fillStyle='#08121d';c.fillRect(0,0,128,96);
  if(fire){
    const study=createFireworkStudy(fire,42),p:Vec3=[0,0,0];
    const age=fire.family==='willow'||fire.family==='waterfall'?3.3:1.6;
    c.globalCompositeOperation='lighter';c.lineWidth=.7;
    const tint=fire.color.map(x=>Math.round(x*255));c.strokeStyle=`rgb(${tint.join(',')})`;c.fillStyle=c.strokeStyle;
    for(const star of study.stars){if(star.behavior==='rocket'||star.birth>study.ascent+age)continue;
      const t=study.ascent+age-star.birth;if(t>star.life)continue;
      sampleStar(star,t,p);const x=64+p[0]*1.22,y=45-(p[1]-45)*1.22;
      c.beginPath();c.moveTo(x,y);
      sampleStar(star,Math.max(0,t-Math.min(1.5,star.tail)),p);c.lineTo(64+p[0]*1.22,45-(p[1]-45)*1.22);c.stroke();
      c.fillRect(x,y,1.4,1.4);
    }
  }else{
    c.fillStyle='#83f2f0';
    for(let i=0;i<150;i++){
      const u=i/149,a=i*2.399963;let x=0,y=0,z=0;
      switch(id){
        case 'sphere': y=(u*2-1)*27;x=Math.cos(a)*Math.sqrt(27*27-y*y);z=Math.sin(a)*Math.sqrt(27*27-y*y);break;
        case 'cylinder':y=(Math.floor(i/15)/9-.5)*48;x=Math.cos(i%15/15*Math.PI*2)*28;z=Math.sin(i%15/15*Math.PI*2)*28;break;
        case 'helix':y=(u-.5)*58;x=Math.cos(u*Math.PI*8)*27;z=Math.sin(u*Math.PI*8)*27;break;
        case 'wave':x=(i%15/14-.5)*76;z=(Math.floor(i/15)/9-.5)*40;y=Math.sin(x*.1+z*.08)*12;break;
        case 'orbit':x=Math.cos(a)*40;y=Math.sin(a)*24;z=Math.sin(a*3)*8;break;
        case 'crown':x=(u-.5)*76;y=-10+Math.abs(Math.sin(u*Math.PI*5))*30;z=Math.sin(a)*4;break;
        case 'wordmark':c.font='bold 15px sans-serif';c.fillText('OMNIRAVE',19,52);i=150;continue;
        default:x=(i%5/4-.5)*48;y=(Math.floor(i/5)%5/4-.5)*48;z=(Math.floor(i/25)/5-.5)*36;
      }
      c.globalAlpha=.5+(z+40)/160;c.fillRect(64+x+z*.26,48-y+z*.2,1.8,1.8);
    }
  }
  c.globalAlpha=1;cache.set(id,canvas);return canvas;
}
