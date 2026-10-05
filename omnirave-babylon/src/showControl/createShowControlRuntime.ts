import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene';
import type { WorldSnapshot, WorldSocket } from '../network/worldSocket';
import type { PlayerRig } from '../player/createPlayerRig';
import type { PlayerController } from '../player/playerController';
import type { FollowCameraRig } from '../player/createFollowCameraRig';
import type { HologramGrid } from '../scene/createHologramGrid';
import type { StageEventStateInput } from '../scene/createStageVisualizer';
import { FIREWORK_CATALOGUE } from '../fireworks/fireworkCatalogue';
import { createFireworkStudy } from '../fireworks/fireworkStudy';
import { createFireworkStudyRenderer, type FireworkRenderEntry } from '../fireworks/createFireworkStudyRenderer';
import type { FireworkStudy, Vec3 } from '../fireworks/fireworkTypes';
import { createShowAudio } from '../audio/createShowAudio';
import { SHOW_RULES, type PanelName, type ShowLaunch, type ShowState } from './showTypes';
import { createShowControlHud } from './createShowControlHud';

export interface ShowControlRuntimeOptions {
  host:HTMLElement; scene:Scene; socket?:WorldSocket; queueToggleHost?:HTMLElement;
  playerRig?:PlayerRig; playerController?:PlayerController; cameraRig?:FollowCameraRig; hologram:HologramGrid;
  // Before a queue join: true when the player was asked to sign up or log in
  // instead (a guest), and the join is not sent.
  askForAccount?:(panel:PanelName)=>boolean;
  onControlVisibilityChange?:(controlling:boolean)=>void;
}
export function createShowControlRuntime(options:ShowControlRuntimeOptions){
  const {scene,socket,playerRig,playerController,cameraRig,hologram}=options;
  const renderer=createFireworkStudyRenderer(scene,scene.activeCamera!,64000);
  const audio=createShowAudio();
  const hud=socket?createShowControlHud(options.host,c=>socket.sendShowCommand(c),audio,options.askForAccount,options.onControlVisibilityChange,options.queueToggleHost):undefined;
  const studies=new Map<string,FireworkStudy>();
  let fireworkQuads=0;
  let state:ShowState|undefined,serverAt=0,receivedAt=performance.now(),lastRevision='',operating=false,restoreOnSnapshot=false,lastUi=0;
  let returnPosition:Vector3|null=null,preview=false,previewStart=0,previewNext=0,previewSequence=0;
  const previewLaunches:ShowLaunch[]=[];
  const position:Vec3=[0,0,0],forward:Vec3=[0,0,1],up:Vec3=[0,1,0];
  function now(){return serverAt?serverAt+performance.now()-receivedAt:Date.now();}
  function release(){
    if(!operating)return;operating=false;playerController?.setOperatingPosition(null);cameraRig?.setOperatorView(false);
    if(playerRig&&returnPosition)playerRig.root.position.copyFrom(returnPosition);
    playerController?.beginSpawnGhost();
  }
  function applySnapshot(snapshot:WorldSnapshot){
    if(!snapshot.showControl)return;
    state=snapshot.showControl;serverAt=state.serverAt;receivedAt=performance.now();
    hud?.apply(state,snapshot.currentPlayerId);
    const local=snapshot.players.find(p=>p.id===snapshot.currentPlayerId);
    if(!local)return;
    const revision=`${local.id}:${local.showRevision??0}`;
    if(revision!==lastRevision||restoreOnSnapshot){
      const active=local.showPanel==='fireworks'||local.showPanel==='drones';
      if(active){if(!operating)returnPosition=playerRig?.root.position.clone()??null;operating=true;
        const anchor=new Vector3(local.position.x,local.position.y,local.position.z);
        playerController?.setOperatingPosition(anchor);cameraRig?.setOperatorView(true);
      }else{release();if(playerRig&&(lastRevision||restoreOnSnapshot||(local.showRevision??0)>0))playerRig.root.position.set(local.position.x,local.position.y,local.position.z);}
      lastRevision=revision;restoreOnSnapshot=false;
    }
  }
  const unsubscribeResult=socket?.onShowResult(result=>hud?.result(result));
  const unsubscribeStatus=socket?.onStatusChange(status=>{
    hud?.status(status==='open');
    if(status!=='open'){restoreOnSnapshot=operating||restoreOnSnapshot;release();lastRevision='';state=undefined;audio.stop();hologram.setControlState(null,now());}
  });
  function update(){
    const time=now();
    if(state)hologram.setControlState(state.drone,time);
    // Debug previews use the replacement catalogue too. No local preview may override a shared room.
    if(preview&&!socket&&!state&&time>=previewNext){
      const rule=SHOW_RULES.fireworks[previewSequence%SHOW_RULES.fireworks.length];
      previewLaunches.push({id:`preview-${previewSequence}`,design:rule.id,bank:previewSequence%7,seed:42+previewSequence,startsAt:time,endsAt:time+rule.durationMs,cost:rule.cost});
      previewSequence++;previewNext=time+3500;
    }
    for(let i=previewLaunches.length-1;i>=0;i--)if(previewLaunches[i].endsAt<time)previewLaunches.splice(i,1);
    const launches=state?.launches??previewLaunches;
    const entries:(FireworkRenderEntry&{id:string})[]=[];
    for(const launch of launches){
      if(time<launch.startsAt||time>launch.endsAt)continue;
      const bank=SHOW_RULES.banks[launch.bank],definition=FIREWORK_CATALOGUE.find(f=>f.id===launch.design);
      if(!bank||!definition)continue;
      let study=studies.get(launch.id);if(!study){study=createFireworkStudy(definition,launch.seed);studies.set(launch.id,study);}
      entries.push({id:launch.id,study,time:(time-launch.startsAt)/1000,position:[bank.x,bank.y,bank.z],scale:bank.scale});
    }
    const liveIds=new Set(launches.map(l=>l.id));for(const id of studies.keys())if(!liveIds.has(id))studies.delete(id);
    fireworkQuads=renderer.renderMany(entries,{trails:true,sparks:true,smoke:true,quality:'low'});
    const camera=scene.activeCamera;
    if(camera){const p=camera.globalPosition,dir=camera.getForwardRay().direction;position[0]=p.x;position[1]=p.y;position[2]=p.z;forward[0]=dir.x;forward[1]=dir.y;forward[2]=dir.z;audio.update(entries,position,forward,up);}
    if(performance.now()-lastUi>80){lastUi=performance.now();hud?.update(time);}
  }
  const visibility=()=>{if(document.hidden)audio.stop();};document.addEventListener('visibilitychange',visibility);
  return {
    applySnapshot,update,
    // Sends a queue join (the one a guest asked for before signing up); false
    // when it cannot go out yet.
    join(panel:PanelName){return hud?hud.join(panel):false;},
    unlockAudio(){void audio.unlock();},
    setEventState(event:StageEventStateInput|null){const active=event?.phase==='active';if(active&&!preview){previewStart=now();previewNext=previewStart;}preview=active;},
    get operating(){return operating;},
    get fireworkQuads(){return fireworkQuads;},
    dispose(){release();unsubscribeResult?.();unsubscribeStatus?.();document.removeEventListener('visibilitychange',visibility);hud?.dispose();audio.dispose();renderer.dispose();studies.clear();hologram.setControlState(null,now());},
  };
}
