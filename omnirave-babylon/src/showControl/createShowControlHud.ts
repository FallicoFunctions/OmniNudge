import { FIREWORK_CATALOGUE } from '../fireworks/fireworkCatalogue';
import { SHOW_RULES, type PanelName, type ShowCommand, type ShowResult, type ShowShot, type ShowState, type ShowTurn } from './showTypes';
import { showIcon } from './showIcons';
import './showControl.css';

const label=(name:string)=>name[0].toUpperCase()+name.slice(1);
export function countdown(ms:number):string {const seconds=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
function element<K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text=''){const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;}
function button(text:string,click:()=>void,cls=''){const b=element('button',cls,text);b.type='button';b.onclick=click;return b;}

// askForAccount: called before a join; true when it asked the player to sign
// up or log in instead (a guest), and the join is then not sent.
export function createShowControlHud(host:HTMLElement,send:(command:ShowCommand)=>void,audio:{unlock?:()=>Promise<boolean>},askForAccount?:(panel:PanelName)=>boolean){
  const root=element('div','show-controls');host.append(root);
  const toggle=button('Show queues',()=>{hidden=!hidden;try{localStorage.setItem('omnirave.showQueuesHidden',String(hidden));}catch{}updateVisibility();if(!hidden)render();},'show-queue-toggle');root.append(toggle);
  const queue=element('section','show-queue');queue.setAttribute('aria-label','Show queues');root.append(queue);
  const queueTitle=element('div','show-queue-heading','SOUNDBOOTH');queue.append(queueTitle);
  let hidden=false;try{hidden=localStorage.getItem('omnirave.showQueuesHidden')==='true';}catch{}
  const queueSections=new Map<PanelName,{status:HTMLElement;roster:HTMLElement;progress:HTMLElement;place:HTMLElement;wait:HTMLElement;help:HTMLElement;join:HTMLButtonElement;leave:HTMLButtonElement}>();
  for(const name of ['fireworks','drones'] as const){
    const section=element('section','show-queue-section');section.setAttribute('aria-label',`${label(name)} queue`);section.append(element('strong','',label(name)));
    const status=element('p'),roster=element('ol');const join=button(`Join ${name}`,()=>{if(!askForAccount?.(name))command(name,'join');});
    const progress=element('div','show-queue-progress'),place=element('strong','show-queue-place'),wait=element('p','show-queue-wait'),help=element('p','show-queue-help');
    progress.hidden=true;place.setAttribute('aria-live','polite');progress.append(place,wait,help);
    const leave=button(`Leave ${name} queue`,()=>command(name,'leave'));section.append(status,progress,roster,join,leave);queue.append(section);queueSections.set(name,{status,roster,progress,place,wait,help,join,leave});
  }
  const board=element('section','show-board');board.hidden=true;board.setAttribute('aria-label','Show control panel');root.append(board);
  const heading=element('header','show-board-heading'),title=element('strong'),timer=element('span','show-turn-clock');
  const exit=button('End turn',()=>{if(panel&&turn)command(panel,'leave',{turnId:turn.id});});heading.append(title,timer,exit);board.append(heading);
  const body=element('div','show-board-body'),grid=element('div','show-icon-grid'),side=element('aside','show-launch-options');body.append(grid,side);board.append(body);
  const hint=element('div','show-hint');board.append(hint);
  const message=element('div','show-message');message.setAttribute('role','status');root.append(message);
  let messageUntil=0,state:ShowState|undefined,playerId='',now=0,connected=false,panel:PanelName|null=null,turn:ShowTurn|null=null,preparing=false;
  let selected:ShowShot[]=[],bank=3,multiple=false,viewKey='',rosterKey='';
  let pendingLaunch:{requestId:string;shots:ShowShot[];selectionRevision:number}|undefined,selectionRevision=0;
  let acceptedOpening:ShowShot[]=[];
  const pendingOpenings=new Map<string,{shots:ShowShot[];selectionRevision:number}>();
  const tiles=new Map<string,{button:HTMLButtonElement;cover:HTMLElement;count:HTMLElement;marker:HTMLElement}>();
  const bankButtons=new Map<number,HTMLButtonElement>();let multi:HTMLButtonElement|undefined,launch:HTMLButtonElement|undefined,selection:HTMLElement|undefined;
  function notify(text:string){message.textContent=text;messageUntil=performance.now()+4000;}
  function command(name:PanelName,action:ShowCommand['action'],extra:Partial<ShowCommand>={}){
    if(!connected){notify('Connecting to the show…');return;}
    const requestId=extra.requestId??crypto.randomUUID();
    send({requestId,panel:name,action,...extra});
  }
  function updateVisibility(){queue.hidden=hidden;toggle.textContent=hidden?'Show queues':'Hide queues';toggle.setAttribute('aria-expanded',String(!hidden));}
  updateVisibility();
  function saveOpening(){
    if(!turn)return;
    const requestId=crypto.randomUUID(),shots=[...selected];
    pendingOpenings.set(requestId,{shots,selectionRevision});
    command('fireworks','prepare',{requestId,turnId:turn.id,shots});
  }
  function selectFirework(design:string){
    if(!panel||!turn)return;void audio.unlock?.();
    if(preparing||multiple){
      const index=selected.findIndex(s=>s.design===design&&s.bank===bank);
      if(index>=0)selected.splice(index,1);
      else if(selected.length<4)selected.push({design,bank});else{notify('Choose up to four launches together.');return;}
      selectionRevision++;
      if(preparing)saveOpening();
    }else command('fireworks','launch',{turnId:turn.id,shots:[{design,bank}]});
  }
  function buildBoard(){
    grid.replaceChildren();side.replaceChildren();tiles.clear();bankButtons.clear();multi=launch=undefined;selection=undefined;
    if(!panel||!turn)return;
    title.textContent=`${label(panel)} · ${preparing?'Prepare':'Live'}`;exit.textContent=preparing?'Leave queue':'End turn';
    board.dataset.panel=panel;
    const items=panel==='fireworks'?FIREWORK_CATALOGUE.map(f=>({id:f.id,name:f.name,description:f.description})):SHOW_RULES.drones.map(d=>({id:d.id,name:label(d.id),description:`${label(d.id)} movement`}));
    for(const item of items){
      const tile=button('',()=>{if(panel==='fireworks')selectFirework(item.id);else if(turn){void audio.unlock?.();command('drones',preparing?'prepare':'movement',{turnId:turn.id,clip:item.id});}},'show-tile');
      tile.title=item.description;tile.setAttribute('aria-label',item.name);
      const img=element('img');img.src=showIcon(item.id).toDataURL();img.alt='';
      const cover=element('span','show-cooldown'),count=element('span','show-icon-count'),marker=element('span','show-queued','◆');marker.setAttribute('aria-hidden','true');
      tile.append(img,cover,count,marker,element('span','show-tile-name',item.name));grid.append(tile);tiles.set(item.id,{button:tile,cover,count,marker});
    }
    if(panel==='fireworks'){
      side.append(element('div','show-section-label','LAUNCH POSITION'));
      const banks=element('div','show-banks');for(const [index,b] of SHOW_RULES.banks.entries()){const control=button(b.label,()=>{bank=index;},'show-bank');control.setAttribute('aria-label',`Launch bank ${b.label}`);banks.append(control);bankButtons.set(index,control);}side.append(banks);
      multi=button('Select Multiple',()=>{multiple=!multiple;selected=[];selectionRevision++;},'show-multi');multi.hidden=preparing;side.append(multi);
      selection=element('ul','show-selection');side.append(selection);
      launch=button(preparing?'Opening saved':'Launch Together',()=>{
        if(!turn||!selected.length||pendingLaunch||!connected)return;
        pendingLaunch={requestId:crypto.randomUUID(),shots:[...selected],selectionRevision};
        command('fireworks','launch',{requestId:pendingLaunch.requestId,turnId:turn.id,shots:pendingLaunch.shots});
        render();
      },'show-launch');side.append(launch);
      const clear=button('Clear selection',()=>{selected=[];selectionRevision++;if(preparing)saveOpening();});side.append(clear);
      hint.textContent=preparing?'Your choices launch automatically when your turn starts.':'';
    }else{
      side.append(element('p','show-option-hint',preparing?'Choose your first movement.':'Choose the next movement. Tap the active icon to repeat it.'));
      side.append(element('p','show-option-hint','◆ Queued'));
      hint.textContent=preparing?'Your movement starts automatically with your turn.':'Drag the sky to look around.';
    }
    hint.hidden=!hint.textContent;
  }
  function render(){
    if(!state)return;
    let nextPanel:PanelName|null=null,nextTurn:ShowTurn|null=null,isPrep=false;
    if(connected)for(const name of ['fireworks','drones'] as const){const p=state[name];if(p.active?.playerId===playerId){nextPanel=name;nextTurn=p.active;}else if(p.preparing?.playerId===playerId){nextPanel=name;nextTurn=p.preparing;isPrep=true;}}
    const key=`${nextPanel}:${nextTurn?.id}:${isPrep}`;panel=nextPanel;turn=nextTurn;preparing=isPrep;
    if(key!==viewKey){viewKey=key;selected=preparing?[...(turn?.opening??[])]:[];acceptedOpening=[...selected];pendingOpenings.clear();selectionRevision++;pendingLaunch=undefined;multiple=false;bank=3;buildBoard();}
    board.hidden=!panel;board.classList.toggle('is-preparing',preparing);
    if(turn){timer.textContent=`${preparing?'Starts in':'Time left'} ${countdown((preparing?turn.startsAt:turn.endsAt)-now)}`;}
    // Movement snapshots keep arriving while this panel is hidden. Retain the
    // latest state, then refresh the queue synchronously when it is reopened.
    // Operator controls below remain live independently of queue visibility.
    if(!hidden){
    const queueSignature=JSON.stringify([state.fireworks,state.drones,playerId,connected]);
    if(queueSignature!==rosterKey){rosterKey=queueSignature;
      const committed=!!panel||(['fireworks','drones'] as const).some(n=>state![n].queue.some(q=>q.playerId===playerId));
      for(const name of ['fireworks','drones'] as const){const p=state[name],ui=queueSections.get(name)!;ui.roster.replaceChildren();
        if(p.preparing)ui.roster.append(element('li','is-next',`${p.preparing.playerName} · preparing`));
        p.queue.forEach(q=>ui.roster.append(element('li',q.playerId===playerId?'is-you':'',q.playerName+(q.playerId===playerId?' · you':'')+(q.awaySince?' · away':''))));
        if(!p.preparing&&!p.queue.length)ui.roster.append(element('li','','Queue open'));
        ui.join.hidden=connected&&(p.active?.playerId===playerId||p.preparing?.playerId===playerId||p.queue.some(q=>q.playerId===playerId));
        ui.join.disabled=!connected||committed;ui.leave.hidden=!p.queue.some(q=>q.playerId===playerId)&&p.preparing?.playerId!==playerId;
      }
    }
    for(const name of ['fireworks','drones'] as const){const p=state[name],ui=queueSections.get(name)!;
      ui.status.textContent=!connected?'Reconnecting…':p.active?`${p.active.playerName} · ${countdown(p.active.endsAt-now)}`:name==='fireworks'&&now<state.eventStartsAt?`Next show · ${countdown(state.eventStartsAt-now)}`:'Playing automatically';
      const index=p.queue.findIndex(q=>q.playerId===playerId);
      ui.progress.hidden=!connected||index<0;
      if(connected&&index>=0){
        const position=index+1+(p.preparing?1:0),place=position===1?"You're first in line":`You're #${position} in line`;
        if(ui.place.textContent!==place)ui.place.textContent=place;
        const opensAt=p.nextAt-state.preparationMs;
        // The first waiting player can claim any unreserved preparation window.
        // The server sends the preparation panel immediately, even for a late join.
        const nextIsYours=index===0&&!p.preparing;
        ui.wait.textContent=nextIsYours?(now<opensAt?`Your controls open in ${countdown(opensAt-now)}`:'Getting your controls ready…')
          :p.nextAt>now?`Next turn window in ${countdown(p.nextAt-now)}`:'Waiting for the next available turn';
        ui.help.textContent=`Your controls open up to ${Math.ceil(state.preparationMs/1000)} seconds before your turn. Join during that countdown to open them immediately. We'll move you into the booth for ${countdown(state.turnMs)} of control. You can keep exploring while you wait.`;
      }
    }
    }
    for(const [id,tile] of tiles){let remaining=0,duration=1,queued=false,chosen=false;
      if(panel==='drones'){remaining=!preparing&&state.drone.clip===id?Math.max(0,state.drone.endsAt-now):0;duration=SHOW_RULES.drones.find(d=>d.id===id)?.durationMs??1;queued=preparing?turn?.clip===id:state.drone.next===id;}
      else{remaining=preparing?Math.max(0,(state.cooldowns[id]??0)-(turn?.startsAt??now)):Math.max(0,(state.cooldowns[id]??0)-now);duration=SHOW_RULES.fireworks.find(f=>f.id===id)?.cooldownMs??1;chosen=selected.some(s=>s.design===id&&s.bank===bank);}
      tile.cover.hidden=remaining<=0;tile.count.textContent=remaining>0?String(Math.ceil(remaining/1000)):'';
      tile.cover.style.background=`conic-gradient(rgba(0,0,0,.77) ${Math.min(1,remaining/duration)*360}deg,transparent 0deg)`;
      tile.marker.hidden=!queued;tile.button.classList.toggle('is-selected',chosen);tile.button.classList.toggle('is-active',panel==='drones'&&!preparing&&state.drone.clip===id);
      tile.button.setAttribute('aria-pressed',String(chosen||queued));tile.button.disabled=!connected||(!preparing&&!!turn&&now>=turn.endsAt)||(panel==='fireworks'&&remaining>0);
    }
    for(const [index,b] of bankButtons){b.classList.toggle('is-selected',index===bank);b.setAttribute('aria-pressed',String(index===bank));}
    if(multi){multi.classList.toggle('is-selected',multiple);multi.setAttribute('aria-pressed',String(multiple));}
    if(selection){const text=selected.map(s=>`${FIREWORK_CATALOGUE.find(f=>f.id===s.design)?.name} · ${SHOW_RULES.banks[s.bank]?.label}`);if(selection.dataset.key!==text.join('|')){selection.dataset.key=text.join('|');selection.replaceChildren(...text.map(t=>element('li','',t)));}}
    if(launch){launch.hidden=!preparing&&!multiple;launch.disabled=preparing||!selected.length||!connected||!!pendingLaunch;}
    if(performance.now()>messageUntil)message.textContent='';
  }
  return {
    apply(next:ShowState,id:string){now=next.serverAt;state=next;playerId=id;connected=true;render();},
    // The join the player asked for before signing up; false while not connected.
    join(name:PanelName){if(!connected)return false;command(name,'join');return true;},
    update(serverNow:number){now=serverNow;render();},
    result(result:ShowResult){
      const opening=pendingOpenings.get(result.requestId);
      if(opening){
        pendingOpenings.delete(result.requestId);
        if(result.ok)acceptedOpening=[...opening.shots];
        else if(opening.selectionRevision===selectionRevision)selected=[...acceptedOpening];
      }
      if(pendingLaunch?.requestId===result.requestId){
        if(result.ok&&pendingLaunch.selectionRevision===selectionRevision){selected=[];selectionRevision++;}
        pendingLaunch=undefined;
      }
      if(!result.ok)notify(result.message);
      render();
    },
    status(open:boolean){connected=open;rosterKey='';if(!open){board.hidden=true;if(state&&(['fireworks','drones'] as const).some(n=>state![n].queue.some(q=>q.playerId===playerId)||state![n].preparing?.playerId===playerId))notify('Connection lost. Your queue place is held for 2 minutes.');}else{message.textContent='';render();}},
    dispose(){root.remove();},
  };
}
