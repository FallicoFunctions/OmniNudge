import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_AVATAR_DEFINITION } from '../../player/avatarDefinition';

// The runtime lines that give every light effect the shared show clock, run
// the fireworks phases on the server clock each frame, place the sprint bar,
// and join a show queue after a guest signs up from its Join button. Each of
// them was once a line no test read (review of 2026-10-01).

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const SERVER_NOW = Date.UTC(2026, 5, 4, 14, 59, 55); // 5 s before a show
const HOUR = Date.UTC(2026, 5, 4, 14, 0, 0);
const eventSnapshot = (playerId: string) => ({
  currentPlayerId: playerId, activeZone: 'main_stage', players: [],
  zoneMedia: [{ zoneId: 'main_stage', trackId: 'set', artist: '', title: '', playlistIndex: 0, playheadSeconds: 100, sampledAtMs: SERVER_NOW, durationSeconds: 0 }],
  // The snapshot still says "none": the schedule decides.
  zoneEvents: [{ zoneId: 'main_stage', phase: 'none', eventName: 'fireworks', activeStartMs: HOUR, periodSeconds: 3600, leadInSeconds: 10, activeSeconds: 300 }],
});

async function boot({ snapshotDuringBoot = false } = {}) {
  vi.resetModules();
  window.history.replaceState(null, '', '/?perf=webgl&world=ws://localhost/ws&wtoken=fixture');
  const snapshotListeners: ((snapshot: unknown) => void)[] = [];
  const emit = (snapshot: unknown) => { for (const listener of snapshotListeners) listener(snapshot); };
  let socketClock: { addSample(sent: number, server: number, received: number): void } | undefined;
  const socket = {
    resumeSnapshots: vi.fn(() => { if (snapshotDuringBoot) emit(eventSnapshot('guest-1')); }),
    status: () => 'open',
    onSnapshot: vi.fn((listener: (snapshot: unknown) => void) => { snapshotListeners.push(listener); }),
    onStatusChange: vi.fn(), onChat: vi.fn(), connect: vi.fn(), dispose: vi.fn(), sendLoadout: vi.fn(), reconnect: vi.fn(),
  };
  vi.doMock('../../network/worldSocket', () => ({
    createWorldSocket: vi.fn((options: { serverClock: typeof socketClock }) => {
      socketClock = options.serverClock;
      // The server clock is known before the first snapshot.
      const local = Date.now();
      socketClock!.addSample(local, SERVER_NOW, local);
      return socket;
    }),
  }));
  vi.doMock('../../network/worldSessionRenewal', () => ({ keepWorldSessionAlive: () => () => {} }));
  const signup = vi.fn(async () => ({
    playerId: 'account-1', playerName: 'New', mode: 'account', sessionToken: 'session', worldSocketUrl: 'ws://localhost/ws',
    worldSessionToken: 'world-account', activeZone: 'main_stage', loadout: {},
  }));
  vi.doMock('../../network/runtimeAuth', () => ({
    RuntimeAuthError: class extends Error {}, runtimeLogin: signup, runtimeSignup: signup, runtimeLogout: vi.fn(),
  }));
  vi.doMock('../../player/createRemotePlayerRigs', () => ({ createRemotePlayerRigs: () => ({
    applySnapshot: vi.fn(), dispose: vi.fn(), setNameplatesVisible: vi.fn(), update: vi.fn(), stats: () => null, collisionTargets: () => [],
  }) }));
  const player = {
    getCurrentTime: () => 0, getDuration: () => 0, applyMedia: vi.fn(), dispose: vi.fn(), unlock: vi.fn(), isAudible: () => false,
    readBeat: vi.fn(() => true), getFrequencyData: vi.fn(), getShowSeconds: () => 42, getTrackStartServerMs: () => SERVER_NOW - 100_000,
    isPaused: () => true,
  };
  vi.doMock('../../media/stageMediaPlayer', () => ({ createStageMediaPlayer: () => player }));
  type Options = { getShowSeconds?: () => number | undefined; getBeat?: () => unknown };
  const effectOptions: Record<string, Options> = {};
  const effectStates: Record<string, ReturnType<typeof vi.fn>> = {};
  const effect = (name: string) => (_scene: unknown, options: Options) => {
    effectOptions[name] = options;
    effectStates[name] = vi.fn();
    return { update: vi.fn(), dispose: vi.fn(), setEventState: effectStates[name], setControlMode: vi.fn(), setTrackInfo: vi.fn(), bassLevel: 0 };
  };
  vi.doMock('../../scene/createStageVisualizer', async (original) => ({
    ...(await original<object>()), createStageVisualizer: effect('visualizer'),
  }));
  vi.doMock('../../scene/createImmersiveAudioShow', () => ({ createImmersiveAudioShow: effect('lasers') }));
  vi.doMock('../../scene/createCrownEffects', () => ({ createCrownEffects: effect('crown') }));
  vi.doMock('../../scene/createCascadeCourtLightFloor', () => ({ createCascadeCourtLightFloor: effect('floor') }));
  vi.doMock('../../scene/createHologramGrid', () => ({ createHologramGrid: effect('hologram') }));
  vi.doMock('../../scene/createStageAtmospherics', () => ({ createStageAtmospherics: effect('atmospherics') }));
  let showOptions: { askForAccount?: (panel: 'fireworks' | 'drones') => boolean } = {};
  const join = vi.fn(() => true);
  vi.doMock('../../showControl/createShowControlRuntime', () => ({
    createShowControlRuntime: (options: typeof showOptions) => {
      showOptions = options;
      return { applySnapshot: vi.fn(), update: vi.fn(), unlockAudio: vi.fn(), setEventState: vi.fn(), dispose: vi.fn(), join, operating: false, fireworkQuads: 0 };
    },
  }));
  let staminaOptions: { avoid?: () => readonly (Element | null | undefined)[] } = {};
  vi.doMock('../../ui/createStaminaBar', async (original) => {
    const actual = await original<typeof import('../../ui/createStaminaBar')>();
    return { ...actual, createStaminaBar: (host: HTMLElement, options: typeof staminaOptions) => { staminaOptions = options; return actual.createStaminaBar(host, options); } };
  });
  let frame: (() => void) | undefined;
  const engine = {
    dispose: vi.fn(), getFps: () => 60, getDeltaTime: () => 16, getHardwareScalingLevel: () => 1, frameId: 0,
    onDisposeObservable: { addOnce: vi.fn() }, resize: vi.fn(), setHardwareScalingLevel: vi.fn(),
    runRenderLoop: vi.fn((callback: () => void) => { frame = () => { engine.frameId += 1; callback(); }; }),
  };
  vi.doMock('@babylonjs/core/Engines/engine', () => ({ Engine: vi.fn(function () { return engine; }) }));
  const stageShow = { setAudioEnergy: vi.fn(), setShowClock: vi.fn() };
  let vipBlocked: (() => void) | undefined;
  const scene = { metadata: { reviewRuntime: {
    reviewAvatar: { root: { metadata: {} }, meshes: [] }, avatarDefinition: DEFAULT_AVATAR_DEFINITION,
    restoreAvatarLoadout: vi.fn(async () => true), stageShow,
    vipGate: { setUnlocked: vi.fn(), setOnBlockedApproach: (callback: () => void) => { vipBlocked = callback; }, setOnApproachCleared: vi.fn() },
  } }, getMeshByName: () => null, pick: vi.fn(), render: vi.fn(), isReady: () => true };
  vi.doMock('../../scene/createMainStageScene', () => ({ createMainStageScene: async () => scene }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204 }));

  const { createRuntime } = await import('../createRuntime');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const runtime = await createRuntime(host);
  return { runtime, emit, frame: () => frame!(), effectOptions, effectStates, stageShow, showOptions: () => showOptions, join, signup,
    staminaOptions: () => staminaOptions, socketClock: () => socketClock!, vipBlocked: () => vipBlocked!, socket };
}

async function signUpInWindow(signup: ReturnType<typeof vi.fn>) {
  const window = document.querySelector('.venue-window') as HTMLElement;
  const fill = (field: string, value: string) => {
    const input = window.querySelector<HTMLInputElement>(`input[data-auth-field="${field}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  fill('username', 'newname');
  fill('password', 'not-a-real-password-1');
  for (const box of window.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  window.querySelector<HTMLButtonElement>('[data-auth-submit]')!.click();
  await vi.waitFor(() => expect(signup).toHaveBeenCalled());
  // Let the session upgrade finish.
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

it('gives the stage screens and every light effect the player\'s show clock', async () => {
  const app = await boot();
  for (const name of ['visualizer', 'lasers', 'crown', 'floor', 'hologram', 'atmospherics']) {
    expect(app.effectOptions[name]?.getShowSeconds?.(), name).toBe(42);
  }
  app.runtime.dispose();
}, 30_000);

it('runs the event phase on the server clock each frame, and gives the spill lights the show clock', async () => {
  const app = await boot();
  app.emit(eventSnapshot('guest-1'));
  expect(app.effectStates.lasers.mock.lastCall?.[0]).toEqual({ phase: 'lead_in', countdownSeconds: 5 });
  // Ten seconds later, with no new snapshot: one frame later the show has
  // started.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + 10_000);
  app.frame();
  expect(app.effectStates.lasers.mock.lastCall?.[0]).toEqual({ phase: 'active', activeMinute: 1 });
  expect(app.stageShow.setShowClock).toHaveBeenLastCalledWith(42, undefined);
  app.runtime.dispose();
}, 30_000);

it('gives the effects the event phase of a snapshot that arrived before they existed', async () => {
  const app = await boot({ snapshotDuringBoot: true });
  expect(app.effectStates.lasers.mock.lastCall?.[0]).toEqual({ phase: 'lead_in', countdownSeconds: 5 });
  app.runtime.dispose();
}, 30_000);

it('lifts the sprint bar clear of the chat and now-playing panels', async () => {
  const app = await boot();
  const avoided = app.staminaOptions().avoid?.() ?? [];
  expect(avoided.map((element) => element?.className.split(' ')[0])).toEqual(['chat-panel', 'player-hud']);
  app.runtime.dispose();
}, 30_000);

it('joins the queue a guest pressed Join on, once the sign-up has connected the account', async () => {
  const app = await boot();
  app.emit(eventSnapshot('guest-1'));
  expect(app.showOptions().askForAccount?.('drones')).toBe(true);
  await signUpInWindow(app.signup);
  app.emit(eventSnapshot('guest-1')); // a late snapshot of the old session
  expect(app.join).not.toHaveBeenCalled();
  app.emit(eventSnapshot('account-1'));
  app.emit(eventSnapshot('account-1'));
  expect(app.join.mock.calls).toEqual([['drones']]);
  app.runtime.dispose();
}, 30_000);

it.each(['Close', 'Sign Up', 'Log In', 'VIP gate'] as const)('drops the queued join when the window is closed or opened another way (%s)', async (how) => {
  const app = await boot();
  app.emit(eventSnapshot('guest-1'));
  app.showOptions().askForAccount?.('fireworks');
  const button = (name: string, root: ParentNode = document) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
  if (how === 'Close') {
    button('Close', document.querySelector('.venue-window')!).click();
    button('Sign Up', document.querySelector('.hud-controls--top-right')!).click();
  } else if (how === 'VIP gate') {
    app.vipBlocked()();
  } else {
    button(how, document.querySelector('.hud-controls--top-right')!).click();
  }
  await signUpInWindow(app.signup);
  app.emit(eventSnapshot('account-1'));
  expect(app.join).not.toHaveBeenCalled();
  app.runtime.dispose();
}, 30_000);
