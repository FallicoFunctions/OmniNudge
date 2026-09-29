import { it,expect,vi } from 'vitest';
import { NullEngine,Scene,Vector3,FreeCamera,MeshBuilder } from '@babylonjs/core';
import { createShowControlRuntime } from '../createShowControlRuntime';
import { createHologramGrid } from '../../scene/createHologramGrid';
import type { WorldSocket,WorldSocketStatus,WorldSnapshot } from '../../network/worldSocket';
vi.mock('../showIcons',()=>({showIcon:()=>({toDataURL:()=>''})}));
it('releases the shared drone clock on disconnect and disposal',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);scene.activeCamera=new FreeCamera('camera',new Vector3(0,2,-60),scene);MeshBuilder.CreateBox('main-stage-hero-screen-panel-l',{},scene);
 const grid=createHologramGrid(scene,{getFrequencyData:t=>t.fill(0)});let status:((s:WorldSocketStatus)=>void)|undefined;
 const socket={onShowResult:()=>()=>{},onStatusChange:(cb:typeof status)=>{status=cb;return ()=>{};},sendShowCommand:()=>{}} as unknown as WorldSocket;
 const runtime=createShowControlRuntime({host:document.body,scene,socket,hologram:grid});
 const snapshot:WorldSnapshot={players:[],zoneMedia:[],zoneEvents:[],currentPlayerId:'a',activeZone:'main_stage',showControl:{version:1,serverAt:1000,eventStartsAt:10000,eventEndsAt:310000,turnMs:150000,preparationMs:10000,fireworks:{active:null,preparing:null,queue:[],nextAt:10000},drones:{active:null,preparing:null,queue:[],nextAt:11000},launches:[],cooldowns:{},banks:{},drone:{clip:'wave',startsAt:1000,endsAt:15000,transitionMs:2500,from:[{clip:'cube',weight:1}],next:''}}};
 runtime.applySnapshot(snapshot);runtime.update();expect(grid.currentShape).toBe('wave');status!('closed');runtime.update();expect(grid.currentShape).toBe('cube');
 runtime.applySnapshot(snapshot);runtime.update();expect(grid.currentShape).toBe('wave');runtime.dispose();expect(grid.currentShape).toBe('cube');grid.dispose();scene.dispose();engine.dispose();
});
