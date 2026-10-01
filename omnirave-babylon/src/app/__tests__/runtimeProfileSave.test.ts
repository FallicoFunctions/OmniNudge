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

async function setup(preview = false, initialMode: RuntimeAuthSession['mode'] = 'account') {
  vi.resetModules(); window.history.replaceState(null, '', '/?perf=webgl&mode=account&handoff=fixture');
  let setControlling: ((controlling: boolean) => void) | undefined;
  mockShowControlRuntime(options => { setControlling = options.onControlVisibilityChange; });
  const first = account();
  first.mode = initialMode;
  vi.doMock('../../network/sessionExchange', () => ({
    parseSessionExchangeParams: () => ({mode:'account',handoff:'fixture'}), exchangeLaunchSession:async () => ({...first,zoneMedia:[]}),
  }));
  const login = vi.fn().mockResolvedValue(account('alice','female','renewed-alice'));
  const signup = vi.fn().mockResolvedValue(account('alice','female','renewed-alice'));
  vi.doMock('../../network/runtimeAuth', () => ({
    RuntimeAuthError:class extends Error {}, runtimeLogin:login, runtimeSignup:signup, runtimeLogout:vi.fn(),
  }));
  const snapshots: ((snapshot: WorldSnapshot) => void)[] = [];
  const statuses: ((status: WorldSocketStatus) => void)[] = [];
  const socket = {
    resumeSnapshots: vi.fn(), status: () => 'open',
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
  emit();
  // Outfit edits reach the saver through the wardrobe itself; the venue panel
  // no longer has part checkboxes.
  const toggle = (slot: 'jacket' | 'hair') => avatar.wardrobe!.setVisible(slot, !avatar.wardrobe!.isVisible(slot));
  return {fetchMock,login,signup,toggle,restore,socket,emit,host,setControlling};
}

it('hides the surrounding HUDs and releases chat focus during show control, then restores them', async () => {
  const app = await setup();
  const input = app.host.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]')!;
  input.value = 'draft'; input.focus();
  expect(app.setControlling).toBeTypeOf('function');
  app.setControlling!(true);
  expect(app.host.classList.contains('babylon-runtime-host--show-control')).toBe(true);
  expect(app.host.querySelector<HTMLElement>('[data-testid="chat-panel"]')!.hidden).toBe(true);
  expect(document.activeElement).not.toBe(input);
  app.emit();
  expect(app.host.classList.contains('babylon-runtime-host--show-control')).toBe(true);
  app.setControlling!(false);
  expect(app.host.classList.contains('babylon-runtime-host--show-control')).toBe(false);
  expect(app.host.querySelector<HTMLElement>('[data-testid="chat-panel"]')!.hidden).toBe(false);
  expect(input.value).toBe('draft');
},20_000);

it.each(['login','signup'] as const)('closes successful %s directly back to the venue without a welcome popup', async mode => {
  const app = await setup(false, 'guest');
  const control = mode === 'login' ? 'log-in' : 'sign-up';
  document.querySelector<HTMLButtonElement>(`[data-hud-control="${control}"]`)!.click();
  const popup = document.querySelector<HTMLElement>('[data-testid="auth-popup"]')!;
  const field = (name: string) => popup.querySelector<HTMLInputElement>(`[data-auth-field="${name}"]`)!;
  field('username').value = 'alice'; field('password').value = 'fixture-password';
  if (mode === 'signup') {
    field('email').value = 'alice@example.test';
    field('accept-terms').checked = true; field('accept-privacy').checked = true;
  }
  popup.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(app.socket.reconnect).toHaveBeenCalledTimes(1));
  expect(mode === 'login' ? app.login : app.signup).toHaveBeenCalledTimes(1);
  expect(popup.hidden).toBe(true);
  expect(document.querySelector('[data-testid="welcome-card"]')).toBeNull();
  expect(document.querySelector('[data-hud-control="logout"]')?.hasAttribute('hidden')).toBe(false);
},20_000);

it('saves an outfit edit to the account and never the restored state', async () => {
  const app = await setup(); expect(app.fetchMock).not.toHaveBeenCalled();
  app.toggle('jacket');
  await vi.waitFor(() => expect(app.fetchMock).toHaveBeenCalledTimes(1));
  expect(app.fetchMock.mock.lastCall![1]).toMatchObject({headers:{Authorization:'Bearer profile-alice'},body:expect.stringContaining('"cw":"111111"')});
  app.emit(); expect(app.fetchMock).toHaveBeenCalledTimes(1);
},20_000);

it('keeps explicit design previews separate from account saving even with an account handoff', async () => {
  const app = await setup(true); app.toggle('jacket');
  await new Promise(resolve => setTimeout(resolve,450)); expect(app.fetchMock).not.toHaveBeenCalled();
},20_000);
