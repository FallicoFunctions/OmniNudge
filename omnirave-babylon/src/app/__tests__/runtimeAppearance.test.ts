import { afterEach, expect, it, vi } from 'vitest';
import { mockShowControlRuntime } from './mockShowControlRuntime';
import { DEFAULT_AVATAR_DEFINITION } from '../../player/avatarDefinition';
import { COMPLETE_AVATAR_LOADOUT_SLOTS } from '../../player/completeAvatarLoadout';
import type { CompleteAvatarWardrobe } from '../../player/completeAvatarWardrobe';
import type { ReviewAvatar } from '../../player/createReviewAvatar';
import type { WorldSnapshot, WorldSocketStatus } from '../../network/worldSocket';
import type { RuntimeAuthSession } from '../../network/runtimeAuth';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('waits for saved bodies, publishes character switches, and permits independent guest selection after logout', async () => {
  vi.resetModules();
  mockShowControlRuntime();
  window.history.replaceState(null, '', '/?perf=webgl&world=ws://localhost/ws&wtoken=fixture');
  const snapshotListeners: ((snapshot: WorldSnapshot) => void)[] = [];
  const statusListeners: ((status: WorldSocketStatus) => void)[] = [];
  const status = (value: WorldSocketStatus) => statusListeners.forEach(listener => listener(value));
  const socket = {
    onSnapshot: (listener: typeof snapshotListeners[number]) => snapshotListeners.push(listener),
    onStatusChange: (listener: typeof statusListeners[number]) => statusListeners.push(listener),
    onChat: vi.fn(), connect: () => status('connecting'), dispose: vi.fn(),
    sendLoadout: vi.fn(), reconnect: vi.fn(() => status('connecting')),
  };
  vi.doMock('../../network/worldSocket', () => ({ createWorldSocket: () => socket }));
  vi.doMock('../../player/createRemotePlayerRigs', () => ({ createRemotePlayerRigs: () => ({
    applySnapshot: vi.fn(), dispose: vi.fn(), setNameplatesVisible:vi.fn(),
  }) }));
  vi.doMock('../../media/stageMediaPlayer', () => ({ createStageMediaPlayer: () => ({
    getCurrentTime: () => 0, getDuration: () => 0, applyMedia: vi.fn(), dispose: vi.fn(),
  }) }));
  const session = (character: 'male' | 'female' | null): RuntimeAuthSession => ({
    playerId:'me', playerName:'Fixture', mode: character ? 'account' : 'guest',
    worldSocketUrl:'ws://localhost/ws', worldSessionToken: character ?? 'guest', activeZone:'main_stage',
    loadout: character ? { av:'1', cv:'1', cp:character, cw:'110111' } : { av: '1', bb: 'f' },
    sessionToken: character ? `profile-${character}` : undefined,
  });
  const order: string[] = [];
  const save = vi.fn(async () => { order.push('save'); return {status:204}; }); vi.stubGlobal('fetch', save);
  vi.doMock('../../network/runtimeAuth', () => ({
    RuntimeAuthError: class extends Error {}, runtimeLogin: async () => session('male'),
    runtimeSignup: vi.fn(), runtimeLogout: async () => { order.push('logout'); return session(null); },
  }));
  const engine = {
    dispose: vi.fn(), getFps: () => 60, getDeltaTime: () => 16, getHardwareScalingLevel: () => 1,
    onDisposeObservable: { addOnce:vi.fn() }, resize:vi.fn(), runRenderLoop:vi.fn(), setHardwareScalingLevel:vi.fn(),
  };
  vi.doMock('@babylonjs/core/Engines/engine', () => ({ Engine:vi.fn(() => engine) }));
  let finishLoad!: (success?: boolean) => void;
  let avatar = { root:{metadata:{}}, meshes:[] } as unknown as ReviewAvatar;
  const oldWardrobes: { wardrobe:CompleteAvatarWardrobe; listeners:Set<() => void> }[] = [];
  const restoreAvatarLoadout = vi.fn((loadout: Record<string, string>) => new Promise<boolean>(resolve => {
    finishLoad = (success = true) => {
      if (!success) { resolve(false); return; }
      const listeners = new Set<() => void>();
      const visibility = new Map(COMPLETE_AVATAR_LOADOUT_SLOTS.map((slot, i) => [slot, loadout.cw?.[i] === '1']));
      const wardrobe: CompleteAvatarWardrobe = {
        slots: COMPLETE_AVATAR_LOADOUT_SLOTS, isVisible:slot => visibility.get(slot) === true,
        setVisible(slot, value) { visibility.set(slot, value); listeners.forEach(listener => listener()); },
        reset:vi.fn(), dispose:vi.fn(),
        subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
      };
      oldWardrobes.push({ wardrobe, listeners });
      avatar = { root:{ metadata:{avatarCompleteCharacter:loadout.cp} }, meshes:[],
        wardrobe:loadout.cp ? wardrobe : undefined } as unknown as ReviewAvatar;
      resolve(true);
    };
  }));
  const avatarChanged = new Set<() => void>();
  const scene = { metadata:{ reviewRuntime:{
    subscribeAvatarChanged: (listener: () => void) => { avatarChanged.add(listener); return () => avatarChanged.delete(listener); },
    get reviewAvatar() { return avatar; }, avatarDefinition:DEFAULT_AVATAR_DEFINITION, restoreAvatarLoadout,
  } }, getMeshByName:() => null, pick:vi.fn(), render:vi.fn() };
  vi.doMock('../../scene/createMainStageScene', () => ({ createMainStageScene:async () => scene }));
  const { createRuntime } = await import('../createRuntime');
  const host = document.createElement('div'); document.body.appendChild(host);
  const runtime = await createRuntime(host);
  const emit = (character: 'female' | 'male' | null) => {
    status('open');
    const snapshot: WorldSnapshot = { currentPlayerId:'me', activeZone:'main_stage', zoneMedia:[], zoneEvents:[],
      players:[{ id:'me', playerName:'Fixture', mode:character ? 'account' : 'guest', zone:'main_stage',
        position:{x:0,y:1.65,z:0}, loadout:session(character).loadout }] };
    snapshotListeners.forEach(listener => listener(snapshot));
  };
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent === text)!;
  try {
    emit('female');
    expect(socket.sendLoadout).not.toHaveBeenCalled();
    finishLoad();
    await vi.waitFor(() => expect(socket.sendLoadout).toHaveBeenLastCalledWith(expect.objectContaining({cp:'female',cw:'110111'})));
    button('Avatar').click();
    const jacket = Array.from(host.querySelectorAll('label')).find(label => label.textContent === 'Jacket')!.querySelector('input')!;
    expect(jacket.checked).toBe(false); jacket.click();
    expect(socket.sendLoadout).toHaveBeenLastCalledWith(expect.objectContaining({cp:'female',cw:'111111'}));
    expect(save).not.toHaveBeenCalled(); // A world token alone cannot save an account profile.

    host.querySelector<HTMLButtonElement>('[data-hud-control="log-in"]')!.click();
    host.querySelector<HTMLInputElement>('[data-auth-field=username]')!.value = 'fixture';
    host.querySelector<HTMLInputElement>('[data-auth-field=password]')!.value = 'fixture';
    host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
    await vi.waitFor(() => expect(restoreAvatarLoadout).toHaveBeenCalledTimes(2));
    expect(socket.reconnect).not.toHaveBeenCalled();
    finishLoad();
    await vi.waitFor(() => expect(socket.reconnect).toHaveBeenCalledWith('ws://localhost/ws','male'));
    expect(oldWardrobes[0].listeners.size).toBe(0);
    emit('male');
    expect(socket.sendLoadout).toHaveBeenLastCalledWith(expect.objectContaining({cp:'male',cw:'110111'}));

    const sentBeforeSelection = socket.sendLoadout.mock.calls.length;
    button('Female').click();
    expect(button('Male').disabled).toBe(true);
    expect(socket.sendLoadout).toHaveBeenCalledTimes(sentBeforeSelection);
    expect(save).not.toHaveBeenCalled();
    finishLoad();
    await vi.waitFor(() => expect(socket.sendLoadout).toHaveBeenLastCalledWith(expect.objectContaining({cp:'female',cw:'111111'})));
    expect(button('Female').getAttribute('aria-pressed')).toBe('true');
    expect(oldWardrobes[1].listeners.size).toBe(0);
    const selectedSends = socket.sendLoadout.mock.calls.length;
    button('Male').click();
    finishLoad(false);
    await vi.waitFor(() => expect(host.textContent).toContain('Could not load this avatar'));
    expect(button('Female').getAttribute('aria-pressed')).toBe('true');
    expect(socket.sendLoadout).toHaveBeenCalledTimes(selectedSends);
    oldWardrobes[2].wardrobe.setVisible('hair', false);
    expect(socket.sendLoadout).toHaveBeenLastCalledWith(expect.objectContaining({cp:'female',cw:'011111'}));

    button('Logout').click(); button('Confirm?').click();
    await vi.waitFor(() => expect(restoreAvatarLoadout).toHaveBeenCalledTimes(5));
    expect(order).toEqual(['save','logout']);
    expect(save).toHaveBeenCalledWith(expect.stringContaining('/profile/omnirave/loadout'), expect.objectContaining({
      headers:expect.objectContaining({Authorization:'Bearer profile-male'}),
      body:expect.stringContaining('"cw":"011111"'),
    }));
    finishLoad();
    await vi.waitFor(() => expect(socket.reconnect).toHaveBeenLastCalledWith('ws://localhost/ws','guest'));
    emit(null);
    expect(socket.sendLoadout.mock.lastCall![0]).toMatchObject({ cp: 'male', cw: '111111' });
    expect(oldWardrobes[2].listeners.size).toBe(0);
    const restoresAfterLogout = restoreAvatarLoadout.mock.calls.length;
    const accountSaves = save.mock.calls.length;
    button('Female').click();
    expect(restoreAvatarLoadout).toHaveBeenCalledTimes(restoresAfterLogout + 1);
    finishLoad();
    await vi.waitFor(() => expect(button('Female').getAttribute('aria-pressed')).toBe('true'));
    expect(socket.sendLoadout.mock.lastCall![0]).toMatchObject({ cp: 'female', cw: '111111' });
    expect(window.localStorage.getItem('omnirave.guest-character.v1')).toBe('female');
    expect(save).toHaveBeenCalledTimes(accountSaves);
    expect(host.querySelector('[data-auth-field=username]')!.closest('[hidden]')).not.toBeNull();
    // A camera-driven model replacement must rewire the open editor without
    // publishing an unchanged outfit or leaving listeners on the old model.
    const previousWardrobe = oldWardrobes.at(-1)!;
    const beforeDetailSends = socket.sendLoadout.mock.calls.length;
    const detail = restoreAvatarLoadout({cv:'1', cp:'female', cw:'111111'}); finishLoad(); await detail;
    avatarChanged.forEach(listener => listener());
    expect(previousWardrobe.listeners.size).toBe(0);
    expect(socket.sendLoadout).toHaveBeenCalledTimes(beforeDetailSends);
    const newJacket = Array.from(host.querySelectorAll('label')).find(label => label.textContent === 'Jacket')!.querySelector('input')!;
    newJacket.click();
    expect(socket.sendLoadout).toHaveBeenLastCalledWith(expect.objectContaining({cp:'female',cw:'110111'}));

  } finally { runtime.dispose(); expect(avatarChanged.size).toBe(0); }
}, 20_000);
