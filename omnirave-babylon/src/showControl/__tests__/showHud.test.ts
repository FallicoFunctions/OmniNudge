import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
vi.mock('../showIcons',()=>({showIcon:()=>({toDataURL:()=>''})}));
import { createShowControlHud } from '../createShowControlHud';
import type { ShowCommand,ShowState,ShowTurn } from '../showTypes';
const turn:ShowTurn={id:'turn-a',playerId:'a',playerName:'<img src=x onerror=alert(1)>',startsAt:10000,endsAt:160000,opening:[]};
const state=():ShowState=>({version:1,serverAt:0,eventStartsAt:10000,eventEndsAt:310000,turnMs:150000,preparationMs:10000,fireworks:{active:null,preparing:null,queue:[],nextAt:10000},drones:{active:null,preparing:null,queue:[],nextAt:10000},launches:[],cooldowns:{},banks:{},drone:{clip:'wave',startsAt:10000,endsAt:24000,transitionMs:2500,from:[{clip:'cube',weight:1}],next:''}});
const click=(name:string)=>{const b=Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-label')??b.textContent)===name);expect(b,name).toBeDefined();b!.click();};
describe('show control HUD',()=>{
 it('preserves an acknowledged opening when a later rejection arrives before its snapshot',()=>{
  const sent:ShowCommand[]=[],hud=createShowControlHud(document.body,c=>sent.push(c),{});
  const s=state();s.serverAt=1000;s.fireworks.preparing={...turn,opening:[]};hud.apply(s,'a');
  click('Ruby Peony');hud.result({requestId:sent[0].requestId,ok:true,message:'Accepted'});
  click('Champagne Willow');hud.result({requestId:sent[1].requestId,ok:false,message:'Choose a smaller opening group.'});hud.update(1000);
  expect(document.querySelector('.show-selection')?.textContent).toBe('Ruby Peony · C');hud.dispose();
 });

 beforeEach(()=>{localStorage.clear();document.body.replaceChildren();});
 afterEach(()=>{document.body.replaceChildren();});
 it('does no hidden queue DOM work, keeps operator controls live, and refreshes on reopening',()=>{
  const hud=createShowControlHud(document.body,()=>{},{}),s=state();
  hud.apply(s,'a');click('Hide queues');
  const queue=document.querySelector('.show-queue')!;
  const observer=new MutationObserver(()=>{});observer.observe(queue,{subtree:true,childList:true,attributes:true,characterData:true});
  s.serverAt=20000;s.fireworks.active={...turn};
  s.drones.queue=[{playerId:'b',playerName:'New arrival',joinedAt:19000}];
  for(let i=0;i<30;i++){s.serverAt+=33;hud.apply(s,'a');hud.update(s.serverAt);}
  expect(observer.takeRecords()).toHaveLength(0);
  expect(document.querySelector('.show-board')?.hasAttribute('hidden')).toBe(false);
  expect(document.querySelector('.show-turn-clock')?.textContent).toBe('Time left 2:20');
  click('Show queues');
  expect(queue.textContent).toContain('New arrival');
  expect(queue.textContent).toContain('<img src=x onerror=alert(1)> · 2:20');
  expect(queue.querySelector('img')).toBeNull();
  observer.disconnect();hud.dispose();
 });
 it('explains a queued turn and counts down to controls while the current show is automatic',()=>{
  const sent:ShowCommand[]=[],hud=createShowControlHud(document.body,c=>sent.push(c),{}),s=state();
  s.serverAt=20000;s.fireworks.nextAt=160000;s.fireworks.queue=[{playerId:'a',playerName:'A',joinedAt:19000}];hud.apply(s,'a');
  const queue=document.querySelector('[aria-label="Fireworks queue"]')!;
  expect(queue.textContent).toContain('Playing automatically');expect(queue.textContent).toContain("You're first in line");
  expect(queue.textContent).toContain('Your controls open in 2:10');expect(queue.textContent).toContain('up to 10 seconds before your turn');
  expect(queue.textContent).toContain('move you into the booth for 2:30');
  hud.update(50000);expect(queue.textContent).toContain('Your controls open in 1:40');expect(sent).toHaveLength(0);
  hud.status(false);hud.update(51000);expect(queue.querySelector('.show-queue-progress')?.hasAttribute('hidden')).toBe(true);hud.dispose();
 });
 it('waits behind an assigned player but readies controls for a late join to an open window',()=>{
  const hud=createShowControlHud(document.body,()=>{},{}),s=state();
  s.serverAt=20000;s.fireworks.nextAt=160000;s.fireworks.queue=[{playerId:'b',playerName:'B',joinedAt:1000},{playerId:'a',playerName:'A',joinedAt:19000}];hud.apply(s,'a');
  const progress=document.querySelector('[aria-label="Fireworks queue"] .show-queue-progress')!;
  expect(progress.textContent).toContain("You're #2 in line");expect(progress.textContent).toContain('Next turn window in 2:20');expect(progress.querySelector('.show-queue-wait')?.textContent).not.toContain('Your controls open');
  s.fireworks.queue.shift();s.serverAt=155000;s.fireworks.queue[0].joinedAt=155000;hud.apply(s,'a');
  expect(progress.textContent).toContain("You're first in line");expect(progress.textContent).toContain('Getting your controls ready…');expect(progress.textContent).not.toContain("preparation has closed");expect(progress.querySelector('.show-queue-wait')?.textContent).not.toContain('Your controls open');
  s.fireworks.queue=[];s.fireworks.preparing={...turn,startsAt:160000,endsAt:310000};hud.apply(s,'a');
  expect(progress.hasAttribute('hidden')).toBe(true);expect(document.querySelector('.show-board')?.hasAttribute('hidden')).toBe(false);hud.dispose();
 });
 it('stages an opening, hides the queue without leaving, and renders player names as text',()=>{
  const sent:ShowCommand[]=[],hud=createShowControlHud(document.body,c=>sent.push(c),{});
  const s=state();s.serverAt=1000;s.fireworks.preparing={...turn};hud.apply(s,'a');hud.update(1000);
  expect(document.body.textContent).toContain('Starts in 0:09');
  click('Ruby Peony');expect(sent.at(-1)).toMatchObject({action:'prepare',turnId:'turn-a',shots:[{design:'F01',bank:3}]});
  click('Hide queues');expect(sent).toHaveLength(1);expect(document.querySelector('.show-queue')?.hasAttribute('hidden')).toBe(true);
  expect(document.querySelector('.show-queue img')).toBeNull();expect(document.querySelector('.show-queue')?.textContent).toContain('<img src=x onerror=alert(1)>');
  hud.dispose();expect(document.querySelector('.show-controls')).toBeNull();
 });
 it('places the active countdown and queued repeat on the same icon',()=>{
  const sent:ShowCommand[]=[],hud=createShowControlHud(document.body,c=>sent.push(c),{});
  const s=state();s.serverAt=20000;s.drones.active=turn;hud.apply(s,'a');hud.update(20000);
  const wave=document.querySelector('button[aria-label="Wave"]')!;
  expect(wave.querySelector('.show-icon-count')?.textContent).toBe('4');click('Wave');
  expect(sent.at(-1)).toMatchObject({action:'movement',clip:'wave',turnId:'turn-a'});
  s.drone.next='wave';hud.apply(s,'a');expect(wave.getAttribute('aria-pressed')).toBe('true');
  expect(wave.querySelector('.show-queued')?.hasAttribute('hidden')).toBe(false);
  s.drone.startsAt=24000;s.drone.endsAt=38000;s.drone.next='';hud.apply(s,'a');hud.update(24000);
  expect(wave.querySelector('.show-icon-count')?.textContent).toBe('14');expect(wave.getAttribute('aria-pressed')).toBe('false');
  hud.status(false);hud.update(25000);expect(document.querySelector('.show-board')?.hasAttribute('hidden')).toBe(true);
  expect(Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Join drones')?.disabled).toBe(true);hud.dispose();
 });
 it('clears the opening selection after the server starts the turn',()=>{
  const hud=createShowControlHud(document.body,()=>{}, {});
  const s=state();s.serverAt=9000;s.fireworks.preparing={...turn,opening:[{design:'F01',bank:3}]};hud.apply(s,'a');
  expect(document.querySelector('.show-selection')?.textContent).toContain('Ruby Peony');
  s.serverAt=10000;s.fireworks.active=s.fireworks.preparing;s.fireworks.preparing=null;s.cooldowns.F01=14000;hud.apply(s,'a');
  expect(document.querySelector('.show-selection')?.textContent).toBe('');
  expect(document.querySelector('button[aria-label="Ruby Peony"]')?.getAttribute('aria-pressed')).toBe('false');
  expect(document.querySelector('button[aria-label="Ruby Peony"] .show-icon-count')?.textContent).toBe('4');hud.dispose();
 });
 it('keeps a rejected group for retry and prevents duplicate clicks while awaiting the result',()=>{
  const sent:ShowCommand[]=[],hud=createShowControlHud(document.body,c=>sent.push(c),{});
  const s=state();s.serverAt=10000;s.fireworks.active={...turn};hud.apply(s,'a');
  click('Select Multiple');click('Ruby Peony');click('Launch bank R2');click('Copper Palm');hud.update(10000);
  click('Launch Together');click('Launch Together');expect(sent).toHaveLength(1);
  expect(sent[0].shots).toEqual([{design:'F01',bank:3},{design:'F07',bank:5}]);
  hud.result({requestId:sent[0].requestId,ok:false,message:'That launch bank is busy.'});
  expect(document.querySelector('[role="status"]')?.textContent).toBe('That launch bank is busy.');
  expect(document.querySelector('.show-selection')?.children).toHaveLength(2);
  click('Launch Together');expect(sent).toHaveLength(2);expect(sent[1].shots).toEqual(sent[0].shots);
  hud.result({requestId:sent[1].requestId,ok:true,message:'Accepted'});
  expect(document.querySelector('.show-selection')?.children).toHaveLength(0);hud.dispose();
 });
 it('does not discard a newer selection when an earlier launch is acknowledged',()=>{
  const sent:ShowCommand[]=[],hud=createShowControlHud(document.body,c=>sent.push(c),{});
  const s=state();s.serverAt=10000;s.fireworks.active={...turn};hud.apply(s,'a');
  click('Select Multiple');click('Ruby Peony');hud.update(10000);click('Launch Together');
  click('Clear selection');click('Launch bank R2');click('Copper Palm');
  hud.result({requestId:sent[0].requestId,ok:true,message:'Accepted'});
  expect(document.querySelector('.show-selection')?.textContent).toBe('Copper Palm · R2');
  click('Launch Together');expect(sent[1].shots).toEqual([{design:'F07',bank:5}]);hud.dispose();
 });
});
