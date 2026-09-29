import { afterEach, expect, it, vi } from 'vitest';
import { mockShowControlRuntime } from './mockShowControlRuntime';
import { DEFAULT_AVATAR_DEFINITION } from '../../player/avatarDefinition';
import { COMPLETE_AVATAR_LOADOUT_SLOTS } from '../../player/completeAvatarLoadout';
import type { CompleteAvatarWardrobe } from '../../player/completeAvatarWardrobe';
import type { ReviewAvatar } from '../../player/createReviewAvatar';
import type { RuntimeAuthSession } from '../../network/runtimeAuth';
import type { WorldSnapshot, WorldSocketStatus } from '../../network/worldSocket';

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach(dispose => dispose());
  document.body.innerHTML = ''; window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

function account(playerId = 'alice', cp = 'female', sessionToken = 'profile-alice'): RuntimeAuthSession {
  return {playerId,playerName:playerId,mode:'account',sessionToken,worldSocketUrl:'ws://localhost/ws',
    worldSessionToken:`world-${playerId}`,activeZone:'main_stage',loadout:{av:'1',cv:'1',cp,cw:'110111'}};
}

async function setup(preview = false) {
  vi.resetModules(); window.history.replaceState(null, '', '/?perf=webgl&mode=account&handoff=fixture');
  mockShowControlRuntime();
  const first = account();
  vi.doMock('../../network/sessionExchange', () => ({
    parseSessionExchangeParams: () => ({mode:'account',handoff:'fixture'}), exchangeLaunchSession:async () => first,
  }));
  const login = vi.fn().mockResolvedValue(account('alice','female','renewed-alice'));
  vi.doMock('../../network/runtimeAuth', () => ({
    RuntimeAuthError:class extends Error {}, runtimeLogin:login, runtimeSignup:vi.fn(), runtimeLogout:vi.fn(),
  }));
  const snapshots: ((snapshot: WorldSnapshot) => void)[] = [];
  const statuses: ((status: WorldSocketStatus) => void)[] = [];
  const socket = {
    onSnapshot:(listener:typeof snapshots[number]) => snapshots.push(listener),
    onStatusChange:(listener:typeof statuses[number]) => statuses.push(listener),
    onChat:vi.fn(),connect:() => statuses.forEach(listener => listener('connecting')),dispose:vi.fn(),sendLoadout:vi.fn(),
    reconnect:vi.fn(() => statuses.forEach(listener => listener('connecting'))),
  };
  vi.doMock('../../network/worldSocket', () => ({createWorldSocket:() => socket}));
  vi.doMock('../../player/createRemotePlayerRigs', () => ({createRemotePlayerRigs:() => ({
    applySnapshot:vi.fn(),dispose:vi.fn(),setNameplatesVisible:vi.fn(),
  })}));
  vi.doMock('../../media/stageMediaPlayer', () => ({createStageMediaPlayer:() => ({
    getCurrentTime:() => 0,getDuration:() => 0,applyMedia:vi.fn(),dispose:vi.fn(),
    unlock:vi.fn(),isAudible:() => false,
  })}));
  const engine = {dispose:vi.fn(),getFps:() => 60,getDeltaTime:() => 16,getHardwareScalingLevel:() => 1,
    onDisposeObservable:{addOnce:vi.fn()},resize:vi.fn(),runRenderLoop:vi.fn(),setHardwareScalingLevel:vi.fn()};
  vi.doMock('@babylonjs/core/Engines/engine', () => ({Engine:vi.fn(function () { return engine; })}));
  const makeAvatar = (loadout: Record<string,string>) => {
    const listeners = new Set<() => void>();
    const visible = new Map(COMPLETE_AVATAR_LOADOUT_SLOTS.map((slot,i) => [slot,loadout.cw[i] === '1']));
    const wardrobe: CompleteAvatarWardrobe = {
      slots:COMPLETE_AVATAR_LOADOUT_SLOTS,isVisible:slot => visible.get(slot) === true,
      setVisible(slot,value) { if (visible.get(slot) === value) return; visible.set(slot,value); listeners.forEach(listener => listener()); },
      reset() { COMPLETE_AVATAR_LOADOUT_SLOTS.forEach(slot => wardrobe.setVisible(slot,true)); },dispose:() => listeners.clear(),
      subscribe(listener) { listeners.add(listener); return () => {listeners.delete(listener);}; },
    };
    return {root:{metadata:{avatarCompleteCharacter:loadout.cp}},meshes:[],wardrobe} as unknown as ReviewAvatar;
  };
  let avatar = makeAvatar(first.loadout);
  const restore = vi.fn(async (loadout:Record<string,string>) => { if (!preview) avatar = makeAvatar(loadout); return true; });
  const scene = {metadata:{reviewRuntime:{get reviewAvatar() {return avatar;},avatarDefinition:DEFAULT_AVATAR_DEFINITION,
    restoreAvatarLoadout:restore,avatarPreviewLocked:preview}},getMeshByName:() => null,pick:vi.fn(),render:vi.fn()};
  vi.doMock('../../scene/createMainStageScene', () => ({createMainStageScene:async () => scene}));
  const fetchMock = vi.fn().mockResolvedValue({status:204}); vi.stubGlobal('fetch',fetchMock);
  const host = document.createElement('div'); document.body.appendChild(host);
  const {createRuntime} = await import('../createRuntime'); const runtime = await createRuntime(host);
  cleanup.push(runtime.dispose);
  const emit = () => snapshots.forEach(listener => listener({currentPlayerId:'alice',activeZone:'main_stage',zoneMedia:[],zoneEvents:[],
    players:[{id:'alice',playerName:'Alice',mode:'account',position:{x:0,y:1.65,z:0},zone:'main_stage',loadout:first.loadout}]}));
  emit(); host.querySelector<HTMLButtonElement>('[data-hud-control=avatar]')!.click();
  const checkbox = (label: string) => Array.from(host.querySelectorAll('label')).find(item => item.textContent === label)!.querySelector('input')!;
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent === text)!;
  const status = () => host.querySelector('[aria-label="Avatar editor"] fieldset [role=status]')!.textContent;
  const submitLogin = () => {
    button('Sign in to save').click();
    host.querySelector<HTMLInputElement>('[data-auth-field=username]')!.value = 'fixture';
    host.querySelector<HTMLInputElement>('[data-auth-field=password]')!.value = 'fixture';
    host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  };
  return {fetchMock,login,checkbox,button,status,submitLogin,restore,socket,emit};
}

it('does not save restored state, then exposes a failed edit and saves its retry', async () => {
  const app = await setup(); expect(app.status()).toBe('Changes save to your account.'); expect(app.fetchMock).not.toHaveBeenCalled();
  app.fetchMock.mockResolvedValueOnce({status:500}); app.checkbox('Jacket').click();
  await vi.waitFor(() => expect(app.status()).toContain('could not be saved'));
  expect(app.checkbox('Jacket').checked).toBe(true); app.button('Retry save').click();
  await vi.waitFor(() => expect(app.status()).toBe('Outfit saved to your account.'));
  expect(app.fetchMock).toHaveBeenCalledTimes(2);
  expect(app.fetchMock.mock.lastCall![1]).toMatchObject({headers:{Authorization:'Bearer profile-alice'},body:expect.stringContaining('"cw":"111111"')});
  app.emit(); expect(app.fetchMock).toHaveBeenCalledTimes(2);
},20_000);

it('preserves the latest edits through same-account reauthentication and saves with the renewed credential', async () => {
  const app = await setup(); app.fetchMock.mockResolvedValueOnce({status:401}); app.checkbox('Jacket').click();
  await vi.waitFor(() => expect(app.status()).toContain('Sign in again'));
  let finishLogin!: (value: RuntimeAuthSession) => void;
  app.login.mockReturnValueOnce(new Promise<RuntimeAuthSession>(resolve => {finishLogin = resolve;}));
  app.submitLogin(); await vi.waitFor(() => expect(app.login).toHaveBeenCalledTimes(1));
  app.checkbox('Hair').click(); // Still editable while authentication is pending.
  finishLogin(account('alice','female','renewed-alice'));
  await vi.waitFor(() => expect(app.socket.reconnect).toHaveBeenCalled());
  await vi.waitFor(() => expect(app.status()).toBe('Outfit saved to your account.'));
  expect(app.checkbox('Jacket').checked).toBe(true); expect(app.checkbox('Hair').checked).toBe(false);
  expect(app.fetchMock.mock.lastCall![1]).toMatchObject({headers:{Authorization:'Bearer renewed-alice'},body:expect.stringContaining('"cw":"011111"')});
},20_000);

it('loads a different account\'s own outfit without copying the prior account\'s unsaved edits', async () => {
  const app = await setup(); app.fetchMock.mockResolvedValueOnce({status:401}); app.checkbox('Jacket').click();
  await vi.waitFor(() => expect(app.status()).toContain('Sign in again'));
  app.login.mockResolvedValueOnce(account('bob','male','profile-bob')); app.submitLogin();
  await vi.waitFor(() => expect(app.socket.reconnect).toHaveBeenCalledWith('ws://localhost/ws','world-bob'));
  expect(app.checkbox('Jacket').checked).toBe(false); expect(app.status()).toBe('Changes save to your account.');
  expect(app.fetchMock).toHaveBeenCalledTimes(1);
  expect(app.restore).toHaveBeenLastCalledWith(expect.objectContaining(account('bob','male','profile-bob').loadout));
  app.checkbox('Jacket').click(); await vi.waitFor(() => expect(app.fetchMock).toHaveBeenCalledTimes(2));
  expect(app.fetchMock.mock.lastCall![1]).toMatchObject({headers:{Authorization:'Bearer profile-bob'},body:expect.stringContaining('"cp":"male"')});
},20_000);

it('keeps explicit design previews separate from account saving even with an account handoff', async () => {
  const app = await setup(true); app.checkbox('Jacket').click();
  expect(app.status()).toContain('Browser saving');
  await new Promise(resolve => setTimeout(resolve,450)); expect(app.fetchMock).not.toHaveBeenCalled();
},20_000);
