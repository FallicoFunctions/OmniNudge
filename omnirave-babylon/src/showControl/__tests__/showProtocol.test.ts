import { describe,it,expect } from 'vitest';
import { createWorldSocket } from '../../network/worldSocket';
const valid=()=>({version:1,serverAt:1000,eventStartsAt:10000,eventEndsAt:310000,turnMs:150000,preparationMs:10000,fireworks:{active:null,preparing:{id:'t',playerId:'a',playerName:'A',startsAt:10000,endsAt:160000,opening:[]},queue:[],nextAt:10000},drones:{active:null,preparing:null,queue:[],nextAt:11000},launches:[],cooldowns:{},banks:{},drone:{clip:'wave',startsAt:1000,endsAt:15000,transitionMs:2500,from:[{clip:'cube',weight:1}],next:''}});
function setup(){const raw:any={send:()=>{},close:()=>{},onopen:null,onclose:null,onerror:null,onmessage:null};const socket=createWorldSocket({url:'ws://localhost/ws',token:'fixture',webSocketFactory:()=>raw});socket.connect();raw.onopen();return {socket,receive:(message:unknown)=>raw.onmessage({data:JSON.stringify(message)})};}
describe('show protocol boundaries',()=>{
 it.each([
  ['null queue entry',(s:any)=>s.fireworks.queue=[null]],
  ['partial turn',(s:any)=>s.fireworks.active={playerId:'a'}],
  ['non-list opening',(s:any)=>s.fireworks.preparing.opening={}],
  ['bad bank',(s:any)=>s.fireworks.preparing.opening=[{design:'F01',bank:7}]],
  ['unknown movement',(s:any)=>s.drone.clip='missing'],
  ['null source',(s:any)=>s.drone.from=[null]],
  ['bad timestamp',(s:any)=>s.drone.endsAt='tomorrow'],
  ['partial launch',(s:any)=>s.launches=[{id:'l'}]],
  ['invalid cooldown',(s:any)=>s.cooldowns={F01:null}],
 ])('drops %s without losing the next valid snapshot',(_name,mutate)=>{
  const {socket,receive}=setup();const seen:any[]=[];socket.onSnapshot(s=>seen.push(s.showControl));
  receive({type:'world_snapshot',showControl:valid()});expect(seen[0]).toEqual(valid());
  const broken=valid();(mutate as (s:any)=>void)(broken);receive({type:'world_snapshot',showControl:broken});expect(seen[1]).toBeUndefined();
  receive({type:'world_snapshot',showControl:valid()});expect(seen[2]).toEqual(valid());socket.dispose();
 });
 it('accepts empty openings and rejects malformed result messages',()=>{
  const {socket,receive}=setup(),states:any[]=[],results:any[]=[];socket.onSnapshot(s=>states.push(s.showControl));socket.onShowResult(r=>results.push(r));const s=valid();(s.fireworks.preparing as any).opening=null;receive({type:'world_snapshot',showControl:s});expect(states[0]).toEqual(s);
  receive({type:'show_result',result:{requestId:'r',ok:false,message:{unexpected:true}}});expect(results).toHaveLength(0);
  receive({type:'show_result',result:{requestId:'r',ok:false,message:'It is not your turn.'}});expect(results).toHaveLength(1);socket.dispose();
 });
});
