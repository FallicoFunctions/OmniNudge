import catalogue from '../../../backend/internal/omniraveworld/world/show_catalogue.json';
export const SHOW_RULES = catalogue;
export type PanelName = 'fireworks' | 'drones';
export interface ShowShot { design:string; bank:number }
export interface ShowTurn { id:string; playerId:string; playerName:string; startsAt:number; endsAt:number; opening:ShowShot[]|null; clip?:string }
export interface ShowPanel { queue:{playerId:string;playerName:string;joinedAt:number;awaySince?:number}[]; active:ShowTurn|null; preparing:ShowTurn|null; nextAt:number }
export interface ShowLaunch { id:string; design:string; bank:number; seed:number; startsAt:number; endsAt:number; cost:number }
export interface ShowDrone { clip:string; startsAt:number; endsAt:number; transitionMs:number; from:{clip:string;weight:number}[]; next:string }
export interface ShowState { version:number; serverAt:number; eventStartsAt:number; eventEndsAt:number; turnMs:number; preparationMs:number; fireworks:ShowPanel; drones:ShowPanel; launches:ShowLaunch[]; cooldowns:Record<string,number>; banks:Record<string,number>; drone:ShowDrone }
export interface ShowCommand { requestId:string; panel:PanelName; action:'join'|'leave'|'prepare'|'launch'|'movement'; turnId?:string; shots?:ShowShot[]; clip?:string }
export interface ShowResult { requestId:string; ok:boolean; message:string }
const fireworkIds=new Set(SHOW_RULES.fireworks.map(f=>f.id));
const droneIds=new Set(SHOW_RULES.drones.map(d=>d.id));
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const stamp=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const identifier=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
const bank=(value:unknown)=>stamp(value)&&value<SHOW_RULES.banks.length;
const shot=(value:unknown)=>record(value)&&typeof value.design==='string'&&fireworkIds.has(value.design)&&bank(value.bank);
function turn(value:unknown):boolean {
  return value===null||(record(value)&&identifier(value.id)&&identifier(value.playerId)&&typeof value.playerName==='string'
    &&stamp(value.startsAt)&&stamp(value.endsAt)&&value.endsAt>value.startsAt
    &&(value.opening===null||(Array.isArray(value.opening)&&value.opening.length<=4&&value.opening.every(shot)))
    &&(value.clip===undefined||(typeof value.clip==='string'&&droneIds.has(value.clip))));
}
function panel(value:unknown):boolean {
  return record(value)&&stamp(value.nextAt)&&turn(value.active)&&turn(value.preparing)&&Array.isArray(value.queue)
    &&value.queue.every(q=>record(q)&&identifier(q.playerId)&&typeof q.playerName==='string'&&stamp(q.joinedAt));
}
export function isShowState(value:unknown):value is ShowState {
  if(!record(value))return false;
  const s=value,d=s.drone;
  return s.version===1&&stamp(s.serverAt)&&s.serverAt>0&&stamp(s.eventStartsAt)&&stamp(s.eventEndsAt)&&s.eventEndsAt>s.eventStartsAt
    &&stamp(s.turnMs)&&s.turnMs>0&&stamp(s.preparationMs)&&s.preparationMs>0&&s.preparationMs<s.turnMs
    &&panel(s.fireworks)&&panel(s.drones)&&Array.isArray(s.launches)
    &&s.launches.every(l=>record(l)&&identifier(l.id)&&typeof l.design==='string'&&fireworkIds.has(l.design)&&bank(l.bank)
      &&stamp(l.seed)&&l.seed<=0xffffffff&&stamp(l.startsAt)&&stamp(l.endsAt)&&l.endsAt>l.startsAt&&stamp(l.cost)&&l.cost>0)
    &&record(s.cooldowns)&&Object.entries(s.cooldowns).every(([id,at])=>fireworkIds.has(id)&&stamp(at))
    &&record(s.banks)&&Object.entries(s.banks).every(([id,at])=>String(Number(id))===id&&bank(Number(id))&&stamp(at))
    &&record(d)&&typeof d.clip==='string'&&droneIds.has(d.clip)&&stamp(d.startsAt)&&stamp(d.endsAt)&&d.endsAt>d.startsAt
    &&stamp(d.transitionMs)&&d.transitionMs>0&&typeof d.next==='string'&&(d.next===''||droneIds.has(d.next))
    &&Array.isArray(d.from)&&d.from.every(f=>record(f)&&typeof f.clip==='string'&&droneIds.has(f.clip)
      &&typeof f.weight==='number'&&Number.isFinite(f.weight)&&f.weight>=0&&f.weight<=1);
}
