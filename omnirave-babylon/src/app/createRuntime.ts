import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { parsePerfFlags } from './perfFlags';
import { exchangeLaunchSession, parseSessionExchangeParams, requestFreshLaunch } from '../network/sessionExchange';
import { runtimeLogin, runtimeLogout, runtimeSignup, RuntimeAuthError, type RuntimeAuthSession } from '../network/runtimeAuth';
import './webgpuShaders';
import '@babylonjs/core/Shaders/bloomMerge.fragment';
import '@babylonjs/core/Shaders/extractHighlights.fragment';
import '@babylonjs/core/Shaders/fxaa.fragment';
import '@babylonjs/core/Shaders/fxaa.vertex';
import '@babylonjs/core/Shaders/imageProcessing.fragment';
import '@babylonjs/core/Shaders/kernelBlur.fragment';
import '@babylonjs/core/Shaders/kernelBlur.vertex';
import '@babylonjs/core/Shaders/particles.fragment';
import '@babylonjs/core/Shaders/particles.vertex';
import '@babylonjs/core/Shaders/pbr.fragment';
import '@babylonjs/core/Shaders/pbr.vertex';
// Asset-container cloning may briefly request the scene's StandardMaterial.
// Register it before any clone can fall back to fetching a .fx file.
import '@babylonjs/core/Shaders/default.vertex.js';
import '@babylonjs/core/Shaders/default.fragment.js';
import '@babylonjs/core/Shaders/rgbdDecode.fragment';
import {
  ADAPTIVE_RESOLUTION_DEFAULTS,
  createAdaptiveResolutionState,
  resolveAdaptiveResolutionConfig,
  resolveManualHardwareScalingLevel,
  stepAdaptiveResolution,
} from './adaptiveResolutionMath';
import { createDisplayRefreshMonitor, type DisplayRefreshMonitor } from './displayRefreshRate';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { createMainStageScene } from '../scene/createMainStageScene';
import { resolveTravelCameraOffsets, TRAVEL_CAMERA_DISTANCE } from '../player/cameraRigMath';
import {
  DEFAULT_AVATAR_DEFINITION,
  FEMALE_V2_PREVIEW_DEFINITION,
  hasAvatarLoadout,
  MALE_V2_PREVIEW_DEFINITION,
  parseAvatarLoadout,
  serializeAvatarLoadout,
  type AvatarDefinition,
} from '../player/avatarDefinition';
import { BACK_PLAZA_SPAWN } from '../scene/reviewRouteData';
import { normalizeLaunchAvatarLoadout, parseCompleteAvatarLoadout, readGuestCharacter, saveGuestCharacter, serializeRenderedAvatarLoadout } from '../player/completeAvatarLoadout';
import { createInitialWorldSpawn } from '../network/initialWorldSpawn';
import { eventWindows, readEventSchedule, scheduledEventState, type EventSchedule } from '../media/eventSchedule';
import type { ShowEventWindows } from '../media/showTimeline';
import { createInitialWorldAppearance } from '../network/initialWorldAppearance';
import { createAvatarProfileSaver } from '../network/avatarProfileSave';
import type { ReviewCheckpoint } from '../scene/reviewRouteData';
import type { StageEventStateInput } from '../scene/createStageVisualizer';
import { createDebugPanel } from '../ui/createDebugPanel';
import { createPerfOverlay, updatePerfOverlay } from '../ui/createPerfOverlay';
import { createReviewHud, formatCheckpointLabel } from '../ui/createReviewHud';
import type { FireworksPreviewAct } from '../ui/createReviewHud';
import { createRuntimeLoadingOverlay } from '../ui/createRuntimeLoadingOverlay';
import { createSoundHint } from '../ui/createSoundHint';
import { markBootPhase } from './bootTiming';
import { createHudNotice } from '../ui/createHudNotice';
import { createSettingsPopup } from '../ui/createSettingsPopup';
import { createTopLeftControls } from '../ui/createTopLeftControls';
import { createTopRightControls } from '../ui/createTopRightControls';
import { createAuthPopup } from '../ui/createAuthPopup';
import { loadPlayerSettings, savePlayerSettings } from '../ui/playerSettings';
import { applyUiTheme } from '../ui/uiTheme';
import { RUNTIME_CONFIG } from './runtimeConfig';

// OmniRave is MULTIPLAYER-ONLY. There is no single-player mode and no offline
// product mode. The shipped game always boots with a world connection
// (?world=<ws url>&wtoken=<world session JWT>).
//
// This runtime can also boot with those params absent, and several comments
// below distinguish "the world path" from "no world connection". That
// no-socket boot is dev/review scaffolding: it exists so the local preview
// server can drive the scene without a world backend. It is not a mode players
// can be in, and nothing about it should be described as a product feature.
type RuntimeEngine = Engine | WebGPUEngine;

const LEAN_PREVIEW_AVATAR_DEFINITION = Object.freeze({
  ...DEFAULT_AVATAR_DEFINITION,
  bodyBase: 'male',
  // These are the closest authored counterparts to the protected male review
  // look: the swept bob reads like its side-part, and the closed black shoe
  // asset is a better starter than MPFB shoes03 (an open sandal despite the
  // historical `work-boots` catalog label).
  // Keep the lean male review visibly sex-consistent; the body morph and the
  // fitted wardrobe remain unchanged.
  hairStyle: 'textured-crop',
  top: 'ribbed-tank',
  jacket: 'utility-vest',
  bottoms: 'cargo-pants',
  shoes: 'skate-sneakers',
}) satisfies AvatarDefinition;

declare global {
  interface Window {
    __OMNIRAVE_RUNTIME__?: {
      canvas: HTMLCanvasElement;
      debugPanel?: HTMLElement;
      dispose: () => void;
      engine: RuntimeEngine;
      host: HTMLElement;
      hud?: HTMLElement;
      perfOverlay?: HTMLElement;
      scene: Awaited<ReturnType<typeof createMainStageScene>>;
    };
  }
}

// FALLBACK ONLY: applySessionUpgrade (below, inside createRuntime) hot-swaps
// login/signup/logout in place via worldSocket.reconnect - this reload path
// now only fires when there is no worldSocket to reconnect at all, i.e. the
// no-world dev/review scaffold (see the module banner comment). It reuses the
// exact same `?world=&wtoken=` boot path perfFlags.worldUrl/worldToken
// already take precedence for (see the comment above resolvedWorldUrl below),
// so that dev-only path still boots through tested code rather than a
// bespoke one. `acct=1` survives the reload only when the session is an
// account, which is what puts the top-right controls back into 'account' vs
// 'guest' mode on the other side.
function navigateToSession(session: RuntimeAuthSession): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  url.searchParams.delete('handoff');
  url.searchParams.set('world', session.worldSocketUrl);
  url.searchParams.set('wtoken', session.worldSessionToken);
  if (session.mode === 'account') {
    url.searchParams.set('acct', '1');
  } else {
    url.searchParams.delete('acct');
  }
  window.location.href = url.toString();
}

function createWebGlEngine(canvas: HTMLCanvasElement) {
  return new Engine(canvas, true, {
    stencil: true,
    // Render at the display's true pixel density. Without this, Babylon
    // defaults to CSS-pixel resolution and the browser upscales the buffer,
    // so the whole scene renders soft/pixelated on high-DPI (retina)
    // screens.
    adaptToDeviceRatio: true,
  });
}

function preloadModule<T>(pending: Promise<T>): Promise<T> {
  // Downloads run during session exchange and scene construction. Attach an
  // early handler so a failed download waits for its owning startup await,
  // where the normal error overlay and resource cleanup can handle it.
  void pending.catch(() => {});
  return pending;
}

async function createBabylonEngine(canvas: HTMLCanvasElement, forceWebGl: boolean,
  replaceCanvas: () => HTMLCanvasElement,
  { profileGpu, backbufferAntialias }: { profileGpu: boolean; backbufferAntialias: boolean }): Promise<RuntimeEngine> {
  if (!forceWebGl) {
    let webgpu: WebGPUEngine | undefined;
    let abandoned = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const releaseWebgpu = () => {
      try { webgpu?.dispose(); } catch { /* A partially initialized device may not support full teardown yet. */ }
    };
    try {
      const attempt = (async () => {
        if (!(await WebGPUEngine.IsSupportedAsync) || abandoned) return undefined;
        webgpu = new WebGPUEngine(canvas, { adaptToDeviceRatio: true, antialias: backbufferAntialias,
          // Babylon filters unavailable features before requesting the device.
          ...(profileGpu ? { deviceDescriptor: { requiredFeatures: ['timestamp-query'] } } : {}),
        });
        try {
          await webgpu.initAsync();
          // Render targets allocate their pass counters at creation, before
          // the benchmark panel exists. Opt in only for local GPU diagnosis.
          if (!abandoned && profileGpu && webgpu.getCaps().timerQuery) webgpu.enableGPUTimingMeasurements = true;
          return abandoned ? undefined : webgpu;
        } finally {
          // A request that resolves after the deadline must release its late
          // device instead of taking ownership back from the WebGL engine.
          if (abandoned) releaseWebgpu();
        }
      })();
      const supported = await Promise.race([
        attempt,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('WebGPU initialization timed out')), 10_000);
        }),
      ]);
      if (supported) return supported;
    } catch {
      abandoned = true;
      releaseWebgpu();
      // A canvas that has acquired a WebGPU context cannot acquire WebGL.
      canvas = replaceCanvas();
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  return createWebGlEngine(canvas);
}

// The longest the loading card waits for the venue's GPU programs after the
// first frame (see the render loop).
const VENUE_READY_CAP_MS = 20_000;

export async function createRuntime(host: HTMLElement) {
  markBootPhase('runtime');
  let canvas = document.createElement('canvas');
  canvas.id = RUNTIME_CONFIG.defaultCanvasId;
  canvas.dataset.testid = RUNTIME_CONFIG.defaultCanvasId;
  canvas.className = 'babylon-render-canvas';
  host.appendChild(canvas);

  // WebGPU is the default engine where supported: the venue is
  // draw-submission-bound and WebGPU removes that floor (validated
  // in-session: 53fps shared-GPU where WebGL managed 45 solo). WebGL
  // remains the automatic fallback, and ?perf=webgl forces it for
  // debugging comparisons.
  const perfFlags = parsePerfFlags(window.location.search);
  const localDebugParams = perfFlags.debug && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? new URLSearchParams(window.location.search) : null;
  const showDebugChrome = perfFlags.debug && localDebugParams?.get('benchmarkUi') !== 'player';
  host.classList.toggle('babylon-runtime-host--capture', perfFlags.capture);
  // Start all shipped startup dependencies together. Waiting to request each
  // module at its construction site turns network latency into a long serial
  // tail after the venue is ready, especially on a player's first visit.
  // Queue the clock first because session exchange needs it before anything
  // can be constructed (including on HTTP/1 connections with few slots).
  const clockModules = Promise.all([
    import('../network/serverClock'),
    import('../media/trackSpectrum'),
    import('../media/trackBeats'),
  ]);
  const sceneModule = preloadModule(import('../scene/createMainStageScene'));
  const [{ createServerClock }, { createTrackSpectrum }, { createTrackBeats, createStageBeat }] = await clockModules;
  const mediaModule = preloadModule(import('../media/stageMediaPlayer'));
  const uiModules = preloadModule(Promise.all([
    import('../ui/createPlayerHud'),
    import('../ui/createStaminaBar'),
  ]));
  const worldModules = preloadModule(Promise.all([
    import('../network/worldSocket'),
    import('../player/createRemotePlayerRigs'),
    import('../ui/createChatPanel'),
    import('../player/createChatBubbleStack'),
    import('../network/worldSessionRenewal'),
  ]));
  const showModules = preloadModule(Promise.all([
    import('../scene/createStageVisualizer'),
    import('../scene/createImmersiveAudioShow'),
    import('../scene/createCrownEffects'),
    import('../scene/createCascadeCourtLightFloor'),
    import('../scene/createHologramGrid'),
    import('../scene/createStageAtmospherics'),
    import('../showControl/createShowControlRuntime'),
  ]));
  // The real launch flow (backend's SessionService.BuildLaunchURL) redirects
  // here with `?mode=<account|guest>&handoff=<one-time token>`, NOT a world
  // socket URL/token directly - those only exist after exchanging the
  // handoff via POST /omnigame/session/exchange (see sessionExchange.ts).
  // Direct `?world=&wtoken=` (perfFlags) takes precedence when present -
  // that remains the local dev/review shortcut the module comment there
  // describes. exchangeLaunchSession resolves to null on any failure (no
  // handoff param, expired/consumed token, network error), which correctly
  // falls through to no world connection rather than throwing during boot.
  // Started from the handoff before the scene builds; the world socket path
  // takes this same player over.
  let earlyStageMediaPlayer: import('../media/stageMediaPlayer').StageMediaPlayer | undefined;
  // One server clock and one spectrum reader for the stage player, whichever
  // path creates it. The world socket feeds the clock.
  const stageMediaOptions = {
    serverClock: createServerClock(),
    spectrum: createTrackSpectrum(),
    beats: createTrackBeats(),
  };
  let resolvedWorldUrl = perfFlags.worldUrl;
  let resolvedWorldToken = perfFlags.worldToken;
  // Covers three ways the top-right controls can end up in 'account' mode:
  // the perfFlags.worldUrl/worldToken dev shortcut carries no identity of its
  // own, so ?acct=1 (set by navigateToSession after an in-game login/signup/
  // logout) is the only signal there; a real omninudge.com handoff carries
  // its own mode below and overrides this default once exchanged.
  let resolvedSessionMode: import('../ui/createTopRightControls').SessionMode = perfFlags.accountMode
    ? 'account'
    : 'guest';
  // An SSO'd account's saved appearance, when the handoff carried one - see
  // its use below at launchLoadout, before the scene loads its local body.
  let resolvedAccountLoadout: Record<string, string> | undefined;
  let resolvedProfileToken: string | undefined;
  let resolvedProfilePlayerId: string | undefined;
  if (!resolvedWorldUrl || !resolvedWorldToken) {
    const exchangeParams = parseSessionExchangeParams(window.location.search);
    let exchanged = exchangeParams ? await exchangeLaunchSession(exchangeParams) : null;
    // A refresh reuses a spent one-time token (or the address has none). The
    // live game then asks for a fresh launch itself, as the Play button does;
    // only local development keeps the no-world review path.
    if (!exchanged && import.meta.env.PROD) {
      const fresh = await requestFreshLaunch();
      exchanged = fresh ? await exchangeLaunchSession(fresh) : null;
    }
    markBootPhase('exchanged');
    if (exchanged) {
      // The token is spent: drop it from the address so a refresh starts clean.
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('handoff');
      cleanUrl.searchParams.delete('mode');
      window.history.replaceState(window.history.state, '', cleanUrl.toString());
      resolvedWorldUrl = exchanged.worldSocketUrl;
      resolvedWorldToken = exchanged.worldSessionToken;
      // An SSO'd omninudge.com account player must never see a Log In /
      // Sign Up prompt for an identity they already have.
      resolvedSessionMode = exchanged.mode === 'account' ? 'account' : 'guest';
      resolvedAccountLoadout = exchanged.loadout;
      resolvedProfileToken = exchanged.mode === 'account' ? exchanged.sessionToken : undefined;
      resolvedProfilePlayerId = exchanged.mode === 'account' ? exchanged.playerId : undefined;
      // Start the stage track from the handoff's playhead now, so sound
      // does not wait for the scene and the world socket's first snapshot.
      const handoffMedia = exchanged.zoneMedia.find((zone) => zone.zoneId === exchanged.activeZone);
      if (handoffMedia) {
        const { createStageMediaPlayer } = await mediaModule;
        earlyStageMediaPlayer = createStageMediaPlayer(stageMediaOptions);
        earlyStageMediaPlayer.applyMedia({ ...handoffMedia, artist: '', title: '', durationSeconds: 0 });
        earlyStageMediaPlayer.unlock();
        // Boot timing: note the moment sound starts, even mid-scene-build.
        const player = earlyStageMediaPlayer;
        const startedWatching = performance.now();
        const watchAudible = window.setInterval(() => {
          if (player.isAudible()) markBootPhase('audible');
          if (player.isAudible() || performance.now() - startedWatching > 60_000) window.clearInterval(watchAudible);
        }, 250);
      }
    } else {
      console.warn('[world] session exchange failed; continuing without a world connection');
    }
  }
  // The local player's current serialized appearance starts with the launch
  // character (see launchLoadout below) and is
  // reassigned in place by applySessionUpgrade on login/signup/logout, so the
  // first authoritative snapshot publishes the rendered look after restoration,
  // including across an in-place reconnect.
  let localAvatarLoadout: Record<string, string> = {};
  let unsubscribeCompleteWardrobe: (() => void) | undefined;
  let unsubscribeAvatarChanged: (() => void) | undefined;
  let worldAppearance: ReturnType<typeof createInitialWorldAppearance> | undefined;
  let avatarProfileSaver: ReturnType<typeof createAvatarProfileSaver> | undefined;
  let engine: RuntimeEngine | undefined;
  let hud: HTMLElement | undefined;
  let perfOverlay: HTMLElement | undefined;
  let venuePerformance: ReturnType<typeof import('./createVenuePerformancePanel').createVenuePerformancePanel> | undefined;
  let debugPanel: HTMLElement | undefined;
  let loadingOverlay: HTMLElement | undefined;
  // Assigned after the show modules exist. The review HUD is debug-only, and
  // this indirection keeps its early DOM construction from racing scene boot.
  let applyFireworksPreview: ((act: FireworksPreviewAct) => void) | undefined;
  let fireworksPreviewTimer: number | undefined;
  let fireworksAudioUnlocked = false;
  let soundHint: import('../ui/createSoundHint').SoundHint | undefined;
  // Set by the first click, tap or key press; after it the hint never returns.
  let audioGestureSeen = false;
  let silentHudTicks = 0;
  let stopAudioGestureListeners: (() => void) | undefined;
  // Player-facing "Now Playing" / venue block. Never gated behind ?debug=1, and
  // owned DOM like the overlays above, so it is torn down in cleanup too.
  let playerHud: import('../ui/createPlayerHud').PlayerHud | undefined;
  let playerHudTimer: number | undefined;
  // Sec 9.4 bottom-center HUD: the sprint stamina bar. Not gated behind
  // ?debug=1 - it's player-facing chrome like the rest of this block, just
  // built here since it shares this block's DOM host. (The emote bar that
  // shares this corner is not mounted yet - see the note further down.)
  let staminaBar: import('../ui/createStaminaBar').StaminaBar | undefined;
  // Player-facing chat panel (design sec 9.8 / 10.2 / 10.3 / 10.4). Chat is
  // venue-local and server-broadcast, so it REQUIRES the world connection:
  // without a socket there is nothing to send to and no one to hear it, and
  // the panel would be a dead control. It is therefore constructed only when
  // the world connection is present.
  let chatPanel: import('../ui/createChatPanel').ChatPanel | undefined;
  // Player-facing HUD shell (design sec 9.2 / 9.3 / 9.6). Also never gated
  // behind ?debug=1, also owned DOM torn down in cleanup.
  let topLeftControls: import('../ui/createTopLeftControls').TopLeftControls | undefined;
  let topRightControls: import('../ui/createTopRightControls').TopRightControls | undefined;
  let authPopup: import('../ui/createAuthPopup').AuthPopup | undefined;
  // A guest pressed Join on a show queue and got the sign-up window: the
  // queue to join once the account's own world session is connected (its
  // player id is set when the sign-up or log-in succeeds). Every other way of
  // opening the window clears it, so closing it needs nothing here.
  let joinAfterSignIn: { panel: import('../showControl/showTypes').PanelName; playerId?: string } | undefined;
  let settingsPopup: import('../ui/createSettingsPopup').SettingsPopup | undefined;
  let hudNotice: import('../ui/createHudNotice').HudNotice | undefined;
  let handleCanvasPick: ((event: MouseEvent) => void) | undefined;
  let handleResize: (() => void) | undefined;
  let displayRefresh: DisplayRefreshMonitor | undefined;
  let disposed = false;
  let worldSocket: import('../network/worldSocket').WorldSocket | undefined;
  // Stops the world token renewal. Owned here, not by the world block, so a
  // boot that fails after the socket opened stops renewing too: a leftover
  // socket then ends at its token's expiry instead of living on.
  let stopWorldSessionRenewal: (() => void) | undefined;
  // Releases the world socket, the stage player and the show modules. Owned
  // here for the same reason: a boot that fails after the world connected
  // must not leave a ghost player in the world or music behind the error.
  let releaseWorldResources: (() => void) | undefined;

  const cleanupOwnedResources = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    displayRefresh?.dispose();
    stopWorldSessionRenewal?.();
    stopWorldSessionRenewal = undefined;
    worldSocket?.dispose();
    worldSocket = undefined;
    releaseWorldResources?.();
    releaseWorldResources = undefined;
    worldAppearance?.dispose();
    avatarProfileSaver?.dispose();
    resolvedProfileToken = undefined;
    unsubscribeCompleteWardrobe?.();
    unsubscribeCompleteWardrobe = undefined;
    unsubscribeAvatarChanged?.(); unsubscribeAvatarChanged = undefined;

    if (engine && window.__OMNIRAVE_RUNTIME__?.engine === engine) {
      delete window.__OMNIRAVE_RUNTIME__;
    }
    if (handleCanvasPick) {
      canvas.removeEventListener('click', handleCanvasPick);
    }
    if (handleResize) {
      window.removeEventListener('resize', handleResize);
    }
    debugPanel?.remove();
    venuePerformance?.dispose();
    perfOverlay?.remove();
    hud?.remove();
    loadingOverlay?.remove();
    stopAudioGestureListeners?.();
    soundHint?.dispose();
    earlyStageMediaPlayer?.dispose();
    if (playerHudTimer !== undefined) {
      window.clearInterval(playerHudTimer);
      playerHudTimer = undefined;
    }
    playerHud?.dispose();
    staminaBar?.dispose();
    chatPanel?.dispose();
    // Settings popup first: it lives inside the top-left block's slot and owns
    // a document keydown listener.
    settingsPopup?.dispose();
    topLeftControls?.dispose();
    topRightControls?.dispose();
    authPopup?.dispose();
    hudNotice?.dispose();
    if (fireworksPreviewTimer !== undefined) {
      window.clearInterval(fireworksPreviewTimer);
      fireworksPreviewTimer = undefined;
    }
    applyFireworksPreview = undefined;
    host.classList.remove('babylon-runtime-host--capture');
    canvas.remove();
  };

  try {
    displayRefresh = createDisplayRefreshMonitor();
    loadingOverlay = createRuntimeLoadingOverlay(host);
    markBootPhase('loading_panel');
    const worldConnection = preloadModule((async () => {
      if (!resolvedWorldUrl || !resolvedWorldToken) return;
      const [{ createWorldSocket }, , , , { keepWorldSessionAlive }] = await worldModules;
      if (disposed) return;
      worldSocket = createWorldSocket({
        url: resolvedWorldUrl,
        token: resolvedWorldToken,
        serverClock: stageMediaOptions.serverClock,
        deferSnapshots: true,
      });
      worldSocket.onStatusChange(status => {
        if (disposed) return;
        console.info(`[world] socket ${status}`);
        if (status === 'open') markBootPhase('socket_open');
        worldAppearance?.status(status);
      });
      worldSocket.connect();
      stopWorldSessionRenewal = keepWorldSessionAlive(worldSocket, { freshLaunch: import.meta.env.PROD });
      return worldSocket;
    })());
    // Firefox's WebGPU grows its GPU process without limit on this venue
    // (measured 2.1 GB to 8.8 GB in ten minutes, all of it browser-side
    // allocations); its WebGL stays flat at about 2 GB.
    const firefox = /Firefox\//.test(navigator.userAgent);
    engine = await createBabylonEngine(canvas, perfFlags.webgl || firefox, () => {
      const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
      canvas.replaceWith(replacement);
      canvas = replacement;
      return replacement;
    }, {
      profileGpu: localDebugParams?.get('gpuProfile') === '1',
      // The normal pipeline renders geometry into its own target and finishes
      // with FXAA. Multisampling that final full-screen image adds a separate
      // color/depth allocation and resolve without smoothing any geometry.
      backbufferAntialias: perfFlags.noPost || localDebugParams?.get('backbufferMsaa') === '1',
    });
    const activeEngine = engine;
    // Render on every browser animation frame, including 120/144/240 Hz.
    activeEngine.maxFPS = undefined;
    markBootPhase('engine', activeEngine.isWebGPU ? 'webgpu' : 'webgl');

    // Cap the effective render density: full retina (2x) quadruples the pixel
    // cost of this heavy scene, but 1.5x is still visibly crisp at roughly half
    // that cost — the sweet spot between "pixelated" and "unplayable".
    const MAX_RENDER_RATIO = 1.5;
    const deviceRatio = window.devicePixelRatio || 1;
    if (deviceRatio > MAX_RENDER_RATIO) {
      // The adaptive controller's sharpest bound mirrors this same cap.
      activeEngine.setHardwareScalingLevel(ADAPTIVE_RESOLUTION_DEFAULTS.sharpestLevel);
    }

    handleResize = () => {
      if (venuePerformance?.isRunning()) return;
      activeEngine.resize();
    };
    const { createMainStageScene: createScene } = await sceneModule;
    const launchLoadout = normalizeLaunchAvatarLoadout(
      resolvedSessionMode === 'account' || parseCompleteAvatarLoadout(resolvedAccountLoadout)
        ? resolvedAccountLoadout : {}, readGuestCharacter());
    const scene = await createScene(activeEngine, launchLoadout.cp as 'male' | 'female');
    markBootPhase('scene');
    const reviewRuntime = scene.metadata?.reviewRuntime;
    // Sec 8.2: ghosting starts on "first entry" - a fresh boot is exactly that.
    reviewRuntime?.playerController?.beginSpawnGhost?.();

    // VIP gating (owner decision, 2026-08-04): EVERY signed-in player is VIP,
    // so account mode is the whole entitlement check - there is no separate
    // VIP flag to consult. The gate boots locked (see createVipGate.ts), which
    // is already right for a guest; this opens it for a player who arrived
    // signed in (an omninudge.com SSO handoff, or the ?acct=1 reload an
    // in-game login falls back to when there is no socket to hot-swap).
    reviewRuntime?.vipGate?.setUnlocked?.(resolvedSessionMode === 'account');

    // Normal gameplay uses the complete launch pair. Accounts restore their
    // saved look; guests retain only their independent local character choice.
    const avatarPreviewParams = new URLSearchParams(window.location.search);
    const localAvatarPreview = window.location.hostname === 'localhost'
      || window.location.hostname === '127.0.0.1';
    const fashionPreviewMode = localAvatarPreview
      && avatarPreviewParams.get('avatarFashion') === '1';
    const editorialPreviewMode = localAvatarPreview
      && !fashionPreviewMode
      && avatarPreviewParams.get('avatarEditorial') === '1';
    const leanPreviewMode = localAvatarPreview
      && !fashionPreviewMode
      && !editorialPreviewMode
      && avatarPreviewParams.get('avatarLean') === '1';
    const classicPreviewMode = localAvatarPreview
      && !fashionPreviewMode
      && !editorialPreviewMode
      && !leanPreviewMode
      && avatarPreviewParams.get('avatarClassic') === '1';
    const avatarPreviewMode = localAvatarPreview
      && (avatarPreviewParams.get('avatarPreview') === '1'
        || ['male', 'female'].includes(avatarPreviewParams.get('avatarComplete') ?? '')
        || avatarPreviewParams.get('avatarMaleV2') === '1'
        || avatarPreviewParams.get('avatarFemaleV2') === '1'
        || leanPreviewMode
        || editorialPreviewMode
        || fashionPreviewMode
        || classicPreviewMode);
    const maleV2PreviewMode = localAvatarPreview
      && (avatarPreviewParams.get('avatarMaleV2') === '1' || avatarPreviewParams.get('avatarComplete') === 'male');
    const femaleV2PreviewMode = localAvatarPreview
      && !maleV2PreviewMode
      && (avatarPreviewParams.get('avatarFemaleV2') === '1' || avatarPreviewParams.get('avatarComplete') === 'female');
    const localAvatarDefinition = maleV2PreviewMode
      ? MALE_V2_PREVIEW_DEFINITION
      : femaleV2PreviewMode
        ? FEMALE_V2_PREVIEW_DEFINITION
        : leanPreviewMode || fashionPreviewMode || editorialPreviewMode
          ? LEAN_PREVIEW_AVATAR_DEFINITION
          : avatarPreviewMode
            ? DEFAULT_AVATAR_DEFINITION
            : parseAvatarLoadout(launchLoadout);
    reviewRuntime?.setAvatarDefinition?.(localAvatarDefinition);
    if (avatarPreviewMode) {
      // Local review framing for the first authored avatar. This is deliberately
      // query-gated and localhost-only; normal guest generation and gameplay camera
      // behavior remain unchanged.
      reviewRuntime?.cameraRig?.applyCheckpointView?.({
        // The authored GLB faces +Z.  The previous -PI/2 framing looked at
        // the avatar's back in the review route, which made body comparisons
        // misleading even though the asset itself was correct.
        alpha: Math.PI / 2,
        beta: 1.5,
        // The authored full-body preview needs the same breathing room as the
        // reference sheet; 2.15 cropped the legs and made the generic fallback
        // read like a floating bust.
        // The lean hierarchy is lifted into the stage by the authored import
        // offset; give the review camera enough breathing room for both crown
        // and footwear instead of cropping the head at the top edge.
        radius: 2.80,
        focusOffset: {
          x: 0,
          y: ['male', 'female'].includes(avatarPreviewParams.get('avatarComplete') ?? '') ? -0.80 : -0.25,
          z: 0,
        },
      });
    }
    localAvatarLoadout = reviewRuntime?.avatarPreviewLocked
      ? serializeAvatarLoadout(localAvatarDefinition) : launchLoadout;
    if (resolvedAccountLoadout) await reviewRuntime?.restoreAvatarLoadout?.(localAvatarLoadout);
    markBootPhase('appearance_ready');
    scene.metadata = {
      ...scene.metadata,
      localAvatarLoadout,
    };
    const reviewCheckpoints = reviewRuntime?.checkpoints as readonly ReviewCheckpoint[] | undefined;

    // The review HUD, perf overlay, debug panel, and canvas pick handler are
    // dev-only chrome: the shipped player experience is just the render
    // canvas (plus the always-on loading/error overlays). They only exist
    // when explicitly requested via ?debug=1 / ?perf=debug.
    let reviewHud: HTMLElement | undefined;
    let objectiveReadout: HTMLOutputElement | null = null;
    let completeBanner: HTMLElement | null = null;
    let pickReadout: HTMLOutputElement | null = null;
    let playerReadout: HTMLOutputElement | null = null;
    let remoteAvatarReadout: HTMLOutputElement | null = null;

    if (showDebugChrome) {
      reviewHud = createReviewHud(host, {
        avatarColorways: reviewRuntime?.avatarColorways,
        checkpoints: reviewCheckpoints,
        selectedAvatarColorwayId: reviewRuntime?.selectedAvatarColorway?.id,
        onSelectAvatarColorway(colorway) {
          reviewRuntime?.setAvatarColorway?.(colorway.id);
          for (const button of Array.from(reviewHud?.querySelectorAll<HTMLButtonElement>('[data-avatar-colorway]') ?? [])) {
            button.ariaPressed = String(button.dataset.avatarColorway === colorway.id);
          }
        },
        onSelectCheckpoint(checkpoint) {
          reviewRuntime?.playerRig?.root.position.set(checkpoint.x, checkpoint.y, checkpoint.z);
          const checkpointIndex = reviewCheckpoints?.findIndex((routeCheckpoint) => routeCheckpoint.id === checkpoint.id) ?? -1;
          if (checkpointIndex >= 0) {
            reviewRuntime?.routeProgress?.reset(checkpointIndex);
          }
          // Defer one frame: the player's ground-height snap runs in the next
          // onBeforeRender, and applying the camera from the pre-snap player
          // position intermittently lands it inside nearby geometry.
          scene.onAfterRenderObservable.addOnce(() => {
            // This is an approval harness: preserve the authored scenery
            // composition instead of replacing it with the generic 7 m
            // travel camera, which made every checkpoint another slab-facing
            // over-the-shoulder shot.
            reviewRuntime?.cameraRig?.applyCheckpointView(checkpoint.camera);
          });
        },
        onRestartRoute() {
          reviewRuntime?.completionCelebration?.stop();
          reviewRuntime?.routeProgress?.reset(0);
          reviewRuntime?.playerRig?.root.position.set(
            BACK_PLAZA_SPAWN.x,
            BACK_PLAZA_SPAWN.y,
            BACK_PLAZA_SPAWN.z,
          );
          scene.onAfterRenderObservable.addOnce(() => {
            const spawnReveal = reviewCheckpoints?.[0]?.camera;
            if (spawnReveal) {
              reviewRuntime?.cameraRig?.applyCheckpointView(spawnReveal);
            }
          });
        },
        onPreviewFireworks(act) {
          applyFireworksPreview?.(act);
        },
      });
      hud = reviewHud;
      perfOverlay = createPerfOverlay(host);
      debugPanel = createDebugPanel(host);
      objectiveReadout = reviewHud.querySelector<HTMLOutputElement>('[data-review-objective]');
      completeBanner = reviewHud.querySelector<HTMLElement>('[data-review-complete]');
      pickReadout = debugPanel.querySelector<HTMLOutputElement>('[data-debug-readout="mesh-pick"]');
      playerReadout = debugPanel.querySelector<HTMLOutputElement>('[data-debug-readout="player-state"]');
      remoteAvatarReadout = debugPanel.querySelector<HTMLOutputElement>('[data-debug-readout="remote-avatars"]');

      handleCanvasPick = (event: MouseEvent) => {
        if (!pickReadout) {
          return;
        }

        const pick = scene.pick(event.offsetX ?? 0, event.offsetY ?? 0);
        pickReadout.value = pick?.pickedMesh?.name ?? 'none';
        pickReadout.textContent = `Pick: ${pick?.pickedMesh?.name ?? 'none'}`;
      };
      canvas.addEventListener('click', handleCanvasPick);
    }

    const dispose = () => {
      if (disposed) {
        return;
      }
      cleanupOwnedResources();
      activeEngine.dispose();
    };
    // Multiplayer presence (opt-in via ?world=&wtoken=): stream the local
    // player's position to the Go world server and render every other
    // connected player as an embodied ghost. The socket module throttles
    // outbound moves internally; the render loop just offers the freshest
    // position each frame.
    let worldSpawnInitialized = false;
    let restoringAppearance = false;
    let appearanceRevision = 0;
    let appearanceEditRevision = 0;
    avatarProfileSaver = createAvatarProfileSaver();
    avatarProfileSaver.setSession(reviewRuntime?.avatarPreviewLocked ? undefined : resolvedProfileToken);
    resolvedProfileToken = undefined;
    const publishRenderedLoadout = (send = true) => {
      if (restoringAppearance || disposed) return;
      const avatar = reviewRuntime?.reviewAvatar;
      localAvatarLoadout = serializeRenderedAvatarLoadout(avatar, reviewRuntime?.avatarDefinition ?? parseAvatarLoadout(localAvatarLoadout), localAvatarLoadout);
      scene.metadata = { ...scene.metadata, localAvatarLoadout };
      if (send && worldAppearance?.ready) worldSocket?.sendLoadout(localAvatarLoadout);
    };
    const subscribeToWardrobe = () => {
      unsubscribeCompleteWardrobe?.();
      unsubscribeCompleteWardrobe = reviewRuntime?.reviewAvatar?.wardrobe?.subscribe(() => {
        if (restoringAppearance || disposed) return;
        appearanceEditRevision++;
        publishRenderedLoadout();
        avatarProfileSaver?.queue(localAvatarLoadout);
      });
    };
    const restoreLocalAppearance = async (loadout: Record<string, string>): Promise<boolean> => {
      const revision = ++appearanceRevision;
      restoringAppearance = true;
      unsubscribeCompleteWardrobe?.();
      unsubscribeCompleteWardrobe = undefined;
      localAvatarLoadout = reviewRuntime?.avatarPreviewLocked ? { ...loadout } : normalizeLaunchAvatarLoadout(loadout, readGuestCharacter());
      let restored = true;
      if (reviewRuntime?.restoreAvatarLoadout) restored = await reviewRuntime.restoreAvatarLoadout(localAvatarLoadout);
      else reviewRuntime?.setAvatarDefinition?.(parseAvatarLoadout(localAvatarLoadout));
      if (disposed || revision !== appearanceRevision) return false;
      restoringAppearance = false;
      topLeftControls?.setAvatarDefinition(reviewRuntime?.avatarDefinition ?? parseAvatarLoadout(localAvatarLoadout));
      topLeftControls?.setCompleteWardrobe(reviewRuntime?.reviewAvatar?.wardrobe);
      subscribeToWardrobe();
      publishRenderedLoadout(false);
      return restored;
    };
    publishRenderedLoadout(false);
    subscribeToWardrobe();
    unsubscribeAvatarChanged = reviewRuntime?.subscribeAvatarChanged?.(() => {
      if (restoringAppearance || disposed) return;
      topLeftControls?.setCompleteWardrobe(reviewRuntime?.reviewAvatar?.wardrobe);
      subscribeToWardrobe();
    });
    let remotePlayerRigs: import('../player/createRemotePlayerRigs').RemotePlayerRigs | undefined;
    // Sec 10.5: the local player gets above-head bubbles too - the doc's
    // "at respawn: player's own bubbles clear" only makes sense if they exist,
    // and the third-person camera keeps your own avatar on screen.
    let localChatBubbles: import('../player/createChatBubbleStack').ChatBubbleStack | undefined;
    let stageMediaPlayer: import('../media/stageMediaPlayer').StageMediaPlayer | undefined;
    let stageAudioDevControls: import('../ui/createStageAudioDevControls').StageAudioDevControls | undefined;
    let stageVisualizer: import('../scene/createStageVisualizer').StageVisualizer | undefined;
    let immersiveAudioShow: import('../scene/createImmersiveAudioShow').ImmersiveAudioShow | undefined;
    let crownEffects: import('../scene/createCrownEffects').CrownEffects | undefined;
    let cascadeCourtLightFloor: import('../scene/createCascadeCourtLightFloor').CascadeCourtLightFloor | undefined;
    let hologramGrid: import('../scene/createHologramGrid').HologramGrid | undefined;
    let stageAtmospherics: import('../scene/createStageAtmospherics').StageAtmospherics | undefined;
    let showControls: ReturnType<typeof import('../showControl/createShowControlRuntime').createShowControlRuntime> | undefined;
    releaseWorldResources = () => {
      remotePlayerRigs?.dispose();
      localChatBubbles?.dispose();
      stageAudioDevControls?.dispose();
      stageMediaPlayer?.dispose();
      stageVisualizer?.dispose();
      immersiveAudioShow?.dispose();
      crownEffects?.dispose();
      cascadeCourtLightFloor?.dispose();
      hologramGrid?.dispose();
      stageAtmospherics?.dispose();
      showControls?.dispose();
    };
    let latestShowSnapshot: import('../network/worldSocket').WorldSnapshot | undefined;
    let latestWorldEventState: StageEventStateInput | null = null;
    // The Main Stage schedule from the server, read on the synced server clock
    // each frame (see eventSchedule.ts); null from an older server.
    let mainStageSchedule: EventSchedule | null = null;
    let appliedEventKey = '';
    // The state the show runs on: a debug preview, else the schedule at the
    // server time now, else the last snapshot's.
    const currentStageEventState = (): StageEventStateInput | null => {
      if (debugEventOverride !== undefined) return debugEventOverride;
      const serverNow = stageMediaOptions.serverClock.now();
      if (latestWorldEventState && mainStageSchedule && serverNow !== undefined) {
        return scheduledEventState(mainStageSchedule, serverNow);
      }
      return latestWorldEventState;
    };
    const syncStageEventState = () => {
      const state = currentStageEventState();
      const key = state ? `${state.phase}:${state.countdownSeconds ?? ''}:${state.activeMinute ?? ''}` : '';
      if (key === appliedEventKey) return;
      appliedEventKey = key;
      applyStageEventState(state);
    };
    // Undefined follows the server. A concrete state is a debug-only local
    // preview override; it never mutates or broadcasts authoritative state.
    let debugEventOverride: StageEventStateInput | null | undefined;

    const applyStageEventState = (eventState: StageEventStateInput | null) => {
      stageVisualizer?.setEventState(eventState);
      immersiveAudioShow?.setEventState(eventState);
      crownEffects?.setEventState(eventState);
      cascadeCourtLightFloor?.setEventState(eventState);
      hologramGrid?.setEventState(eventState);
      stageAtmospherics?.setEventState(eventState);
      showControls?.setEventState(eventState);
    };

    applyFireworksPreview = (act) => {
      if (!perfFlags.debug) {
        return;
      }
      // The preview button click is a trusted player gesture, so it can also
      // satisfy autoplay policy in the no-world local review path.
      fireworksAudioUnlocked = true;
      showControls?.unlockAudio();
      if (fireworksPreviewTimer !== undefined) {
        window.clearInterval(fireworksPreviewTimer);
        fireworksPreviewTimer = undefined;
      }
      if (act === 'stop') {
        debugEventOverride = undefined;
        applyStageEventState(latestWorldEventState);
        return;
      }
      if (act === 'countdown') {
        let seconds = 10;
        debugEventOverride = { phase: 'lead_in', countdownSeconds: seconds };
        applyStageEventState(debugEventOverride);
        fireworksPreviewTimer = window.setInterval(() => {
          seconds = Math.max(1, seconds - 1);
          debugEventOverride = { phase: 'lead_in', countdownSeconds: seconds };
          applyStageEventState(debugEventOverride);
          if (seconds === 1 && fireworksPreviewTimer !== undefined) {
            window.clearInterval(fireworksPreviewTimer);
            fireworksPreviewTimer = undefined;
          }
        }, 1000);
        return;
      }
      const minuteByAct: Record<Exclude<FireworksPreviewAct, 'countdown' | 'stop'>, number> = {
        'minute-1': 1,
        'minute-2': 2,
        'minute-3': 3,
      };
      debugEventOverride = { phase: 'active', activeMinute: minuteByAct[act] };
      applyStageEventState(debugEventOverride);
    };
    // Latest active-zone media from the world snapshot; the HUD reads it on a
    // 1s tick instead of re-rendering on every snapshot.
    let activeZoneId = 'main_stage';
    let activeZoneMedia: import('../network/worldSocket').ZoneMediaState | null = null;
    // Latest snapshot roster, for the venue block's global / venue player
    // counts (sec 9.4). Held by reference - the HUD tick counts it, so there is
    // no per-snapshot allocation here. Null when there is no world connection
    // (dev/review path), where the HUD hides both count lines instead of
    // inventing numbers.
    let activePlayers: readonly import('../network/worldSocket').WorldPlayer[] | null = null;
    if (resolvedWorldUrl && resolvedWorldToken) {
      const [, { createRemotePlayerRigs }, { createChatPanel }, { createChatBubbleStack }] = await worldModules;
      const { createStageMediaPlayer } = await mediaModule;
      worldSocket = await worldConnection;
      if (!worldSocket) throw new Error('World startup was cancelled.');
      remotePlayerRigs = createRemotePlayerRigs(scene);
      // Sec 7.8: playerController was constructed before this rig existed
      // (see createMainStageScene's setRemotePlayerCollisionSource), so this
      // is the one-time hookup for local-vs-remote-player collision.
      reviewRuntime?.setRemotePlayerCollisionSource?.(remotePlayerRigs.collisionTargets);
      stageMediaPlayer = earlyStageMediaPlayer ?? createStageMediaPlayer(stageMediaOptions);
      const activeWorldSocket = worldSocket;

      // ---- Chat panel (sec 9.8 / 10.2 / 10.3 / 10.4). Player-facing, so NOT
      // gated behind perfFlags.debug - only its bottom-left anchor lifts when
      // the dev stage-audio scrubber occupies that corner under ?debug=1.
      {
        const [{ formatVenueName: formatChatVenueName }] = await uiModules;
        chatPanel = createChatPanel(host, {
          // Sec 9.8: default open when no saved preference exists; the stored
          // guest-scoped blob supplies it otherwise.
          open: loadPlayerSettings().chatOpen,
          onOpenChange(open) {
            // Re-read before writing so this never clobbers a settings-popup
            // change made since boot.
            savePlayerSettings({ ...loadPlayerSettings(), chatOpen: open });
          },
          onSend(bodyText) {
            activeWorldSocket.sendChat(bodyText);
          },
          // Sec 10.3: typing suppresses movement keys (right-click camera look
          // is a pointer gesture and is untouched).
          onTextEntryActiveChange(active) {
            reviewRuntime?.input?.setTextEntryActive?.(active);
          },
          // Sec 10.2: guests cannot mute others. resolvedSessionMode is fixed
          // for the lifetime of this boot (login/signup/logout always reload -
          // see navigateToSession), so it is safe to read once here rather
          // than needing the setCanMute(true) upgrade path.
          canMute: resolvedSessionMode === 'account',
          debugChromePresent: showDebugChrome,
        });
        const activeChatPanel = chatPanel;
        // Sec 10.5: the same message stream that fills the log drives the
        // above-head bubbles.
        const localPlayerRoot = reviewRuntime?.playerRig?.root;
        if (localPlayerRoot) {
          localChatBubbles = createChatBubbleStack(scene, 'local', localPlayerRoot,
            reviewRuntime?.playerRig?.eyeHeightMeters ?? 1.65);
        }
        let localPlayerId = '';
        worldSocket.onChat((message) => {
          // appendMessage returns false for a muted sender (sec 10.2) - a
          // muted player must not get a bubble either, or muting would only
          // half-work.
          if (!activeChatPanel.appendMessage(message)) return;
          if (message.playerId && message.playerId === localPlayerId) {
            localChatBubbles?.showMessage(message.body);
          } else {
            remotePlayerRigs?.showChatBubble(message.playerId, message.body);
          }
        });
        // Sec 10.4: the log is per venue session. The first snapshot counts as
        // the venue entry, so the fresh log opens with `Entered [Venue]`.
        let chatZoneId: string | null = null;
        worldSocket.onSnapshot((snapshot) => {
          localPlayerId = snapshot.currentPlayerId;
          activeChatPanel.setCurrentPlayerId(snapshot.currentPlayerId);
          if (snapshot.activeZone && snapshot.activeZone !== chatZoneId) {
            chatZoneId = snapshot.activeZone;
            // Sec 10.5: old-venue bubbles do not survive a venue crossing.
            localChatBubbles?.clear();
            activeChatPanel.clearHistory();
            activeChatPanel.appendSystemMessage(`Entered ${formatChatVenueName(snapshot.activeZone)}`);
          }
        });
      }

      const initializeWorldSpawn = createInitialWorldSpawn(reviewRuntime?.playerRig?.eyeHeightMeters ?? 1.65, position => {
        reviewRuntime?.playerRig?.root.position.set(position.x, position.y, position.z);
        const controller = reviewRuntime?.playerController;
        if (controller) {
          controller.verticalVelocityMetersPerSecond = 0;
          controller.beginSpawnGhost();
        }
      });
      worldAppearance = createInitialWorldAppearance({
        sessionAppearanceRestored: Boolean(resolvedAccountLoadout),
        restore: async loadout => { await restoreLocalAppearance(loadout); },
        publish: () => publishRenderedLoadout(),
      });
      worldSocket.onSnapshot((snapshot) => {
        worldSpawnInitialized = initializeWorldSpawn(snapshot);
        latestShowSnapshot=snapshot;
        showControls?.applySnapshot(snapshot);
        // The first snapshot of the new account session: send the join the
        // player asked for as a guest.
        if (joinAfterSignIn?.playerId && snapshot.currentPlayerId === joinAfterSignIn.playerId
          && showControls?.join(joinAfterSignIn.panel)) {
          joinAfterSignIn = undefined;
        }
        void worldAppearance?.snapshot(snapshot);
        remotePlayerRigs?.applySnapshot(snapshot);
        const activeMedia = snapshot.zoneMedia.find((zone) => zone.zoneId === snapshot.activeZone) ?? null;
        stageMediaPlayer?.applyMedia(activeMedia);
        activeZoneId = snapshot.activeZone;
        activeZoneMedia = activeMedia;
        activePlayers = snapshot.players;
        // Sec 13.3 track-start title card. setTrackInfo diffs trackId
        // internally, so a same-track repeat snapshot is a no-op here.
        if (activeMedia) {
          stageVisualizer?.setTrackInfo(activeMedia.artist, activeMedia.title, activeMedia.trackId);
        }
        // Drive the stage screen's event mode (countdown / fireworks video)
        // from the active zone's scheduled event, if any.
        const activeEvent = snapshot.activeZone === 'main_stage'
          ? snapshot.zoneEvents.find((zone) => zone.zoneId === 'main_stage') ?? null
          : null;
        latestWorldEventState = activeEvent
          ? {
              phase: activeEvent.phase,
              countdownSeconds: activeEvent.countdownSeconds,
              activeMinute: activeEvent.activeMinute,
            }
          : null;
        mainStageSchedule = readEventSchedule(activeEvent);
        syncStageEventState();
      });
      // The handshake ran while the scene loaded. Apply its latest state only
      // after spawn, appearance, chat and remote-avatar handlers all exist.
      worldAppearance.status(worldSocket.status());
      worldSocket.resumeSnapshots();

      // The player arrives in the room as it is: nothing waits for audio.
      // Stage audio starts now if the browser allows it, and otherwise on the
      // player's first click, tap or key press anywhere (walking counts).
      const activeStageMediaPlayer = stageMediaPlayer;
      activeStageMediaPlayer.unlock();
      const gestureEvents = ['pointerdown', 'keydown', 'touchend'] as const;
      const unlockAudioOnGesture = () => {
        audioGestureSeen = true;
        markBootPhase('gesture');
        stopAudioGestureListeners?.();
        activeStageMediaPlayer.unlock();
        fireworksAudioUnlocked = true;
        showControls?.unlockAudio();
        soundHint?.dispose();
        soundHint = undefined;
      };
      stopAudioGestureListeners = () => {
        for (const type of gestureEvents) {
          window.removeEventListener(type, unlockAudioOnGesture, true);
        }
        stopAudioGestureListeners = undefined;
      };
      for (const type of gestureEvents) {
        window.addEventListener(type, unlockAudioOnGesture, true);
      }

      // DEV-ONLY audio scrubber + play/pause. Only in the world/music path and
      // only under ?debug=1 (same gate as the rest of the dev chrome).
      if (showDebugChrome) {
        const { createStageAudioDevControls } = await import('../ui/createStageAudioDevControls');
        stageAudioDevControls = createStageAudioDevControls(host, activeStageMediaPlayer);
      }
    }
    markBootPhase('world_ready');

    // The player HUD ships in BOTH paths: with a world socket it shows the
    // active venue and its synced track; on the dev/review path (no world
    // connection) there is no media, so it shows the venue name and "No track
    // playing".
    // The elapsed time comes from the LOCAL playhead (the media player), so it
    // keeps counting between snapshots, and from the server's playhead until
    // the browser lets the track play; duration comes from the server entry.
    {
      const [{ createPlayerHud, formatVenueName, resolvePlayerCounts }] = await uiModules;
      const hudMediaPlayer = stageMediaPlayer;
      playerHud = createPlayerHud(host, { debugChromePresent: showDebugChrome });
      const refreshPlayerHud = () => {
        if (hudMediaPlayer?.isAudible()) markBootPhase('audible');
        // Ask for a gesture only when the browser actually held the track
        // back: a track is due but has stayed silent for two ticks. Where the
        // Play click carried over (Chrome, Firefox) the note never shows.
        if (!audioGestureSeen && hudMediaPlayer && activeZoneMedia) {
          if (hudMediaPlayer.isAudible()) {
            silentHudTicks = 0;
            soundHint?.dispose();
            soundHint = undefined;
          } else if (++silentHudTicks >= 2 && !soundHint) {
            soundHint = createSoundHint(host);
          }
        }
        const counts = activePlayers ? resolvePlayerCounts(activePlayers, activeZoneId) : null;
        playerHud?.update({
          venueName: formatVenueName(activeZoneId),
          zoneId: activeZoneId,
          artist: activeZoneMedia?.artist ?? '',
          title: activeZoneMedia?.title ?? '',
          elapsedSeconds: hudMediaPlayer?.getCurrentTime() ?? 0,
          durationSeconds: activeZoneMedia?.durationSeconds ?? hudMediaPlayer?.getDuration() ?? 0,
          globalPlayerCount: counts?.globalPlayerCount,
          venuePlayerCount: counts?.venuePlayerCount,
        });
      };
      refreshPlayerHud();
      playerHudTimer = window.setInterval(refreshPlayerHud, 1000);
    }

    // Sec 9.4/7.4 sprint stamina bar. Updated every render frame (not the 1s
    // HUD tick above) since stamina drains/recovers continuously and needs to
    // read as responsive while sprinting.
    {
      const [, { createStaminaBar }] = await uiModules;
      // Flush with the bottom edge unless the chat or now-playing panel
      // reaches under it (a narrow window): then just above them.
      staminaBar = createStaminaBar(host, { avoid: () => [chatPanel?.element, playerHud?.element] });
    }

    // Sec 9.4/9.7 emote bar: DELIBERATELY NOT MOUNTED yet. Owner decision
    // (2026-08-04): the bar stays off screen until the emotes behind it are
    // actually wired, rather than showing ten slots that visibly do nothing -
    // the avatar emote/animation system (sec 6/7.6) is blocked and parked
    // pending sourced art.
    //
    // createEmoteBar.ts, its tests, and its `.hud-emote-bar` bottom-center
    // dock in styles.css all stay as they are, so turning it back on is
    // re-adding the createEmoteBar(host, { onEmoteSelected }) call here and
    // nothing else. Sec 11.1's auth window keeps its position either way: it
    // rises from this area whether or not the bar is currently in it.

    // Render-scale state. Declared here (ahead of the render loop) because the
    // settings popup's Graphics controls write to it from click handlers.
    let perfFrameCounter = 0;
    let adaptiveState = createAdaptiveResolutionState(
      ADAPTIVE_RESOLUTION_DEFAULTS,
      activeEngine.getHardwareScalingLevel(),
    );
    let pendingHardwareScalingLevel: number | undefined;
    // While false the adaptive controller is not stepped at all, so it cannot
    // fight the level the player pinned with the manual 1-10 slider.
    let graphicsAutoEnabled = true;

    // ---- Player HUD shell: top-left controls + settings popup + avatar
    // colorway popup + top-right session controls (design sec 9.2, 9.3, 9.5,
    // 9.6). Player-facing, so NOT gated behind perfFlags.debug - only their
    // anchors shift when the dev chrome is present (the review HUD is top-left
    // and the debug panel top-right, the same collision the player HUD already
    // resolves for the perf pill).
    {
      const settings = loadPlayerSettings();
      // Theme first: every surface created below reads the tokens it sets.
      applyUiTheme(host, settings.uiTheme);

      const applyCameraFollow = (mode: 'follow' | 'free') => {
        reviewRuntime?.cameraRig?.setFollowMode?.(mode);
      };
      const applyCrouchMode = (mode: 'hold' | 'toggle') => {
        reviewRuntime?.input?.setCrouchMode?.(mode);
      };
      const applyDisplayNames = (visible: boolean) => {
        remotePlayerRigs?.setNameplatesVisible(visible);
      };
      const applyGraphicsLevel = (level: number) => {
        pendingHardwareScalingLevel = resolveManualHardwareScalingLevel(
          level,
          ADAPTIVE_RESOLUTION_DEFAULTS,
        );
      };

      // Apply the stored settings before anything renders with them.
      applyCameraFollow(settings.cameraFollow);
      applyCrouchMode(settings.crouchMode);
      applyDisplayNames(settings.displayNames);
      graphicsAutoEnabled = settings.graphicsAuto;
      if (!settings.graphicsAuto) {
        applyGraphicsLevel(settings.graphicsLevel);
      }

      // Manual respawn (sec 8.3): back to the current venue's spawn, no
      // confirmation, sprint/crouch cleared, popups closed. The dev-only route
      // reset the review HUD's "Play Again" does is deliberately NOT part of it.
      const respawnPlayer = () => {
        // Sec 10.5: "at respawn: player's own bubbles clear".
        localChatBubbles?.clear();
        const spawn = reviewRuntime?.spawn ?? BACK_PLAZA_SPAWN;
        reviewRuntime?.playerRig?.root.position.set(spawn.x, spawn.y, spawn.z);
        // Sec 8.2/8.3: manual respawn re-arms the no-collision grace period.
        reviewRuntime?.playerController?.beginSpawnGhost?.();
        const input = reviewRuntime?.input?.state;
        if (input) {
          input.sprint = false;
          input.crouch = false;
        }
        // Sec 8.3 "clears typed chat input text".
        chatPanel?.clearDraft();
        // Sec 8.3 "keeps current camera zoom": read the rig's live radius
        // before repositioning rather than forcing a fixed checkpoint
        // distance - only the orientation resets, not the player's chosen
        // zoom level.
        const currentRadius = reviewRuntime?.cameraRig?.camera.radius ?? TRAVEL_CAMERA_DISTANCE;
        const travelView = resolveTravelCameraOffsets(undefined);
        scene.onAfterRenderObservable.addOnce(() => {
          reviewRuntime?.cameraRig?.applyCheckpointView({
            alpha: 0,
            beta: 1.12,
            radius: currentRadius,
            ...travelView,
          });
        });
        topLeftControls?.openPanel(null);
        // Sec 8.3: the world server is the authority on this player's
        // position - without this, other clients never see the respawn and a
        // reconnect would restore the pre-respawn position.
        worldSocket?.sendRespawn();
      };

      settingsPopup = createSettingsPopup({
        settings,
        onRequestClose() {
          topLeftControls?.openPanel(null);
        },
        onCameraFollowChange: applyCameraFollow,
        onCrouchModeChange: applyCrouchMode,
        onDisplayNamesChange: applyDisplayNames,
        onGraphicsAutoChange(auto) {
          graphicsAutoEnabled = auto;
          if (auto) {
            // Resume adaptive control from wherever the manual pin left the
            // render scale, so Auto does not jump the image on re-enable.
            adaptiveState = createAdaptiveResolutionState(
              ADAPTIVE_RESOLUTION_DEFAULTS,
              activeEngine.getHardwareScalingLevel(),
            );
          }
        },
        onGraphicsLevelChange: applyGraphicsLevel,
        onUiThemeChange(theme) {
          applyUiTheme(host, theme);
        },
        onRespawn: respawnPlayer,
        onChange(next) {
          savePlayerSettings(next);
        },
      });

      // True while the auth window on screen is the one the VIP gate raised,
      // so only that one auto-closes when the player walks away (sec 12).
      let vipGateOpenedAuthPopup = false;

      topLeftControls = createTopLeftControls(host, {
        settingsPanel: settingsPopup.element,
        avatarEditorEnabled: true,
        characterSelection: reviewRuntime?.avatarPreviewLocked ? undefined : {
          getSelected: () => reviewRuntime?.reviewAvatar?.root.metadata?.avatarCompleteCharacter,
          async select(character) {
            if (disposed || restoringAppearance) return false;
            // Commit and publish only after the requested model finishes loading.
            // Session restoration supersedes this request through appearanceRevision.
            const applied = await restoreLocalAppearance({
              ...localAvatarLoadout,
              ...serializeAvatarLoadout(character === 'male' ? MALE_V2_PREVIEW_DEFINITION : FEMALE_V2_PREVIEW_DEFINITION),
              cv: '1', cp: character, cw: '111111',
            });
            if (!applied || disposed) return false;
            if (resolvedSessionMode === 'guest') saveGuestCharacter(character);
            appearanceEditRevision++;
            publishRenderedLoadout();
            avatarProfileSaver?.queue(localAvatarLoadout);
            return true;
          },
        },
        completeWardrobe: reviewRuntime?.reviewAvatar?.wardrobe,
        avatarColorways: reviewRuntime?.avatarColorways,
        selectedAvatarColorwayId: reviewRuntime?.selectedAvatarColorway?.id,
        avatarDefinition: parseAvatarLoadout(localAvatarLoadout),
        avatarOptionAvailability: reviewRuntime?.reviewAvatar?.slotOptions
          ? Object.fromEntries(
            [...reviewRuntime.reviewAvatar.slotOptions].map(([slot, slotOptions]) => [
              slot,
              [...slotOptions.keys()],
            ]),
          )
          : undefined,
        onSelectAvatarColorway(colorway) {
          reviewRuntime?.setAvatarColorway?.(colorway.id);
        },
        onAvatarDefinitionChange(definition) {
          appearanceEditRevision++;
          const applied = reviewRuntime?.setAvatarDefinition?.(definition) ?? definition;
          localAvatarLoadout = serializeRenderedAvatarLoadout(reviewRuntime?.reviewAvatar, applied, localAvatarLoadout);
          scene.metadata = { ...scene.metadata, localAvatarLoadout };
          if (worldAppearance?.ready) worldSocket?.sendLoadout(localAvatarLoadout);
          avatarProfileSaver?.queue(localAvatarLoadout);
        },
        onPanelChange(panel) {
          if (panel === null) {
            return;
          }
          // Historical prototype avatars retain their signup entry point.
          if (panel === 'avatar' && resolvedSessionMode === 'guest' && !reviewRuntime?.reviewAvatar?.wardrobe) {
            topLeftControls?.openPanel(null);
            vipGateOpenedAuthPopup = false;
            authPopup?.open('signup');
          }
        },
        debugChromePresent: showDebugChrome,
      });

      hudNotice = createHudNotice(host, { debugChromePresent: showDebugChrome });

      // backend/internal/omnigame/api/handlers/runtime_auth_handler.go's
      // login/signup/logout endpoints all return the same session-exchange
      // response shape a fresh launch gets. Player-flagged (2026-08-02): a
      // full-page reload into it went black and re-booted the whole scene -
      // applySessionUpgrade instead hot-swaps in place: worldSocket.reconnect
      // keeps every chat/media/remote-player listener already registered
      // (see that method's own comment), and the local avatar mesh updates
      // live via reviewRuntime.restoreAvatarLoadout before reconnecting.
      // currentVenue is the world server's own
      // idea of "where you are right now" (activeZoneId, updated by every
      // snapshot below) so an account upgrade mid-session keeps the player in
      // the same venue rather than bouncing them back to main_stage.
      let sessionUpgradeRevision = 0;
      let authActionRevision = 0;
      const applySessionUpgrade = async (session: import('../network/runtimeAuth').RuntimeAuthSession) => {
        const upgrade = ++sessionUpgradeRevision;
        // No queued edit from the prior session may use this new credential.
        avatarProfileSaver?.setSession(undefined);
        const nextMode: import('../ui/createTopRightControls').SessionMode =
          session.mode === 'account' ? 'account' : 'guest';

        // VIP gating follows the session: logging in opens the cascade court /
        // VIP terrace boundary immediately, logging out re-locks it. Set
        // before the no-socket early return below so the dev/review reload
        // path is covered too.
        reviewRuntime?.vipGate?.setUnlocked?.(nextMode === 'account');

        // Sec 11.4 "logout in VIP": VIP access is lost the instant the player
        // becomes a guest, so a logout taken up in the cascade court, on a VIP
        // terrace or on a skydeck forces a respawn to the venue's spawn rather
        // than leaving a guest standing in VIP space. (Sec 11.4's "logout
        // outside VIP" is the plain in-place conversion, which is everything
        // else this function already does.)
        if (nextMode === 'guest' && reviewRuntime?.vipGate?.playerInsideVipArea) {
          respawnPlayer();
        }

        if (nextMode === 'account' && hasAvatarLoadout(session.loadout)) {
          // An existing account's saved appearance (or one just seeded from
          // this guest's own currentLoadout below, on a brand-new account).
          localAvatarLoadout = session.loadout;
        } else if (nextMode === 'guest') {
          // Keep the guest's own choice independent from the account just left.
          localAvatarLoadout = normalizeLaunchAvatarLoadout({}, readGuestCharacter());
        }
        await restoreLocalAppearance(localAvatarLoadout);
        if (disposed || upgrade !== sessionUpgradeRevision) return false;
        avatarProfileSaver?.setSession(nextMode === 'account' && !reviewRuntime?.avatarPreviewLocked ? session.sessionToken : undefined);
        resolvedProfilePlayerId = nextMode === 'account' ? session.playerId : undefined;

        if (!worldSocket) {
          // No world connection to hot-swap (dev/review scaffold - see the
          // module banner comment): nothing here to reconnect in place, so
          // fall back to the reload every other boot path already handles.
          navigateToSession(session);
          return false;
        }
        worldSocket.reconnect(session.worldSocketUrl, session.worldSessionToken);
        // Sec 11.2: "top-right auth controls update immediately to `Logout`".
        topRightControls?.setMode(nextMode);
        resolvedSessionMode = nextMode;
        chatPanel?.setCanMute(nextMode === 'account');
        // No reload to carry the window away this time - close it ourselves.
        // A no-op when already closed (e.g. the logout call site below).
        vipGateOpenedAuthPopup = false;
        authPopup?.close();
        return true;
      };

      authPopup = createAuthPopup({
        onRequestClose() {
          // Closed by hand: the window is no longer the gate's to take back,
          // so reopening it from the top-right controls at the same spot
          // survives walking away. Sec 12's "stays closed until they leave
          // the radius and return" is the GATE's own re-arm, not this flag.
          vipGateOpenedAuthPopup = false;
        },
        async onSubmit(mode, fields) {
          const action = ++authActionRevision;
          try {
            await avatarProfileSaver?.flush();
            if (disposed || action !== authActionRevision) return { ok: false, message: 'This session has changed.' };
            const previousAccount = resolvedProfilePlayerId;
            const pendingAtRequest = avatarProfileSaver?.getPendingLoadout();
            const editsAtRequest = appearanceEditRevision;
            const session =
              mode === 'login'
                ? await runtimeLogin({
                    username: fields.username,
                    password: fields.password,
                    currentVenue: activeZoneId,
                    currentLoadout: localAvatarLoadout,
                  })
                : await runtimeSignup({
                    username: fields.username,
                    password: fields.password,
                    email: fields.email,
                    acceptTerms: fields.acceptTerms,
                    acceptPrivacyPolicy: fields.acceptPrivacyPolicy,
                    currentVenue: activeZoneId,
                    currentLoadout: localAvatarLoadout,
                  });
            if (disposed || action !== authActionRevision) return { ok: false, message: 'This session has changed.' };
            // Include edits made while the authentication request was pending.
            await avatarProfileSaver?.flush();
            if (disposed || action !== authActionRevision) return { ok: false, message: 'This session has changed.' };
            const pendingAppearance = pendingAtRequest || editsAtRequest !== appearanceEditRevision || avatarProfileSaver?.getPendingLoadout()
              ? { ...localAvatarLoadout } : undefined;
            // Reauthenticating the same account keeps unsaved visible edits;
            // a different account always receives its own stored appearance.
            const resumePending = pendingAppearance && session.mode === 'account' && session.playerId === previousAccount;
            if (joinAfterSignIn && session.mode === 'account') joinAfterSignIn.playerId = session.playerId;
            const applied = await applySessionUpgrade(resumePending ? { ...session, loadout: pendingAppearance } : session);
            if (applied && resumePending && !disposed) avatarProfileSaver?.queue(localAvatarLoadout);
            return { ok: true };
          } catch (err) {
            const message = err instanceof RuntimeAuthError ? err.message : 'Something went wrong. Try again.';
            return { ok: false, message };
          }
        },
        onTextEntryActiveChange(active) {
          // Sec 11.1: "focused auth typing suppresses movement keys" - the
          // same InputMap switch the chat panel throws (sec 10.3).
          reviewRuntime?.input?.setTextEntryActive?.(active);
        },
      });
      host.append(authPopup.element);

      // Sec 12 guest upgrade prompts: "VIP block opens venue-styled signup
      // window immediately", it auto-closes once the player walks 15 feet off
      // the boundary (VIP_GATE_PROMPT_CLEAR_DISTANCE - the gate measures it
      // and calls back), and a window the player closed by hand stays closed
      // until they leave that radius and return (the gate's own re-arm).
      //
      // The auto-close only ever takes back a window the GATE opened: one the
      // player opened themselves from the top-right controls is theirs to
      // close, wherever they happen to be standing.
      reviewRuntime?.vipGate?.setOnBlockedApproach?.(() => {
        vipGateOpenedAuthPopup = true;
        joinAfterSignIn = undefined;
        authPopup?.open('signup');
      });
      reviewRuntime?.vipGate?.setOnApproachCleared?.(() => {
        if (!vipGateOpenedAuthPopup) {
          return;
        }
        vipGateOpenedAuthPopup = false;
        authPopup?.close();
      });

      topRightControls = createTopRightControls(host, {
        mode: resolvedSessionMode,
        onLogIn() {
          joinAfterSignIn = undefined;
          authPopup?.open('login');
        },
        onSignUp() {
          joinAfterSignIn = undefined;
          authPopup?.open('signup');
        },
        async onLogout() {
          const action = ++authActionRevision;
          try {
            const saved = await avatarProfileSaver?.flush();
            if (disposed || action !== authActionRevision) return;
            if (saved === false) hudNotice?.show('Your latest outfit changes could not be saved before logout.');
            const session = await runtimeLogout(activeZoneId);
            if (disposed || action !== authActionRevision) return;
            await avatarProfileSaver?.flush();
            if (disposed || action !== authActionRevision) return;
            await applySessionUpgrade(session);
          } catch {
            hudNotice?.show('Could not log out. Try again.');
          }
        },
        debugChromePresent: showDebugChrome,
      });
    }

    // The Main Stage screen visualizer. It runs in BOTH paths: with the stage
    // media player (world/music path) it reacts to the live synced audio; on
    // the dev/review path (no world connection) there is no player, so it
    // reads a zero spectrum and shows an idle shimmer instead of crashing. Frequency data
    // is pulled lazily each frame, so it picks up the media player as soon as
    // that path has constructed one.
    // ONE shared spectrum source for the screen visualizer and the immersive
    // venue show, so both react to the exact same audio (or the same silence).
    const getStageFrequencyData = (target: Uint8Array) => {
      if (stageMediaPlayer) {
        stageMediaPlayer.getFrequencyData(target);
      } else {
        target.fill(0);
      }
    };
    // ONE beat reading per frame for every light effect: the hits of the
    // track's beat list that this player heard since the previous frame. The
    // player's reader moves its window on each call, so the effects share the
    // frame's reading instead of each taking a part of it. Null when the
    // track has no beat list; the effects then detect hits themselves.
    const stageBeat = createStageBeat();
    let stageBeatFrame: number | undefined = -1;
    let stageBeatKnown = false;
    // The scheduled events placed in the current track, rebuilt only when the
    // schedule or the track's start on the server clock changes.
    let showEvents: ShowEventWindows | null = null;
    let showEventsKey = '';
    const currentShowEvents = (): ShowEventWindows | null => {
      const trackStartMs = stageMediaPlayer?.getTrackStartServerMs();
      if (debugEventOverride !== undefined || !latestWorldEventState || !mainStageSchedule || trackStartMs === undefined) return null;
      const period = mainStageSchedule.periodSeconds * 1000;
      const key = [((mainStageSchedule.activeStartMs % period) + period) % period, period, mainStageSchedule.leadInSeconds,
        mainStageSchedule.activeSeconds, Math.round(trackStartMs)].join(':');
      if (key !== showEventsKey) {
        showEventsKey = key;
        // A set runs a few hours at most.
        showEvents = eventWindows(mainStageSchedule, trackStartMs, trackStartMs, trackStartMs + 6 * 3600_000);
      }
      return showEvents;
    };
    const getStageBeat = () => {
      if (activeEngine.frameId !== stageBeatFrame) {
        stageBeatFrame = activeEngine.frameId;
        stageBeatKnown = stageMediaPlayer ? stageMediaPlayer.readBeat(stageBeat) : false;
        if (stageBeatKnown) stageBeat.events = currentShowEvents();
      }
      return stageBeatKnown ? stageBeat : null;
    };
    // The show's shared clock: every effect reads its time here (and its
    // palette, patterns and phases from the beat's track timeline), so all
    // players see the same lights at the same moment of the music.
    const getShowSeconds = () => stageMediaPlayer?.getShowSeconds();
    markBootPhase('ui_ready');
    const [{ createStageVisualizer }, { createImmersiveAudioShow }, { createCrownEffects },
      { createCascadeCourtLightFloor }, { createHologramGrid }, { createStageAtmospherics },
      { createShowControlRuntime }] = await showModules;
    markBootPhase('show_modules_ready');
    stageVisualizer = createStageVisualizer(scene, {
      getFrequencyData: getStageFrequencyData,
      getShowSeconds,
    });
    const activeStageVisualizer = stageVisualizer;

    // The venue-wide immersive show (beams, laser fans, air particles, floor
    // pulse). Like the visualizer it runs in BOTH paths: audio-reactive with
    // the world/music path, gentle idle sweeps when no audio is present (no
    // world connection).
    immersiveAudioShow = createImmersiveAudioShow(scene, {
      getFrequencyData: getStageFrequencyData,
      getBeat: getStageBeat,
      getShowSeconds,
    });
    const activeImmersiveAudioShow = immersiveAudioShow;

    // The crown figurehead effects (reactive LED tracery climbing the spire,
    // the apex energy crystal, the sky beacon). Shares the exact same spectrum
    // closure so it stays audio- and color-coherent with the venue; idle when
    // no audio is present (no world connection).
    crownEffects = createCrownEffects(scene, {
      getFrequencyData: getStageFrequencyData,
      getBeat: getStageBeat,
      getShowSeconds,
    });
    const activeCrownEffects = crownEffects;

    // The Cascade Court flank light floor: a music-reactive additive glow laid
    // just above the pearl paving tiles (the tiles themselves - the physical,
    // walkable floor - are untouched). Shares the exact same spectrum closure
    // so it stays audio- and colour-coherent with the venue; a slow calm
    // shimmer when no audio is present (no world connection) so the floor
    // still reads as pearl.
    cascadeCourtLightFloor = createCascadeCourtLightFloor(scene, {
      getFrequencyData: getStageFrequencyData,
      getBeat: getStageBeat,
      getShowSeconds,
    });
    const activeCascadeCourtLightFloor = cascadeCourtLightFloor;

    // The floating 3D hologram light grid: a drone-show swarm of ~2,700
    // individually-coloured points hanging above the crowd, in the airspace the
    // V113 crown-shell canopy plates used to fill (this module HIDES those
    // plates on create and restores them on dispose - the owner asked for the
    // space back, not for the plates to be deleted). Shares the exact same
    // spectrum closure so its formations and colours stay coherent with the
    // venue; slow drifting formations when no audio is present (no world
    // connection).
    hologramGrid = createHologramGrid(scene, {
      getFrequencyData: getStageFrequencyData,
      getBeat: getStageBeat,
      getShowSeconds,
    });
    const activeHologramGrid = hologramGrid;

    // The stage atmospherics (haze air body, CO2/cryo jets, flame jets,
    // cold-spark fountains, strobe pods): the PHYSICAL effects show. Shares the
    // same spectrum closure; haze-only idle when no audio is present (no world
    // connection).
    stageAtmospherics = createStageAtmospherics(scene, {
      getFrequencyData: getStageFrequencyData,
      getBeat: getStageBeat,
      getShowSeconds,
    });
    const activeStageAtmospherics = stageAtmospherics;

    // Shared aerial effects and player controls. Stage pyro remains owned by
    // stageAtmospherics; fireworks cannot seize the independent drone rig.
    showControls = createShowControlRuntime({
      host,scene,socket:worldSocket,playerRig:reviewRuntime?.playerRig,
      playerController:reviewRuntime?.playerController,cameraRig:reviewRuntime?.cameraRig,hologram:activeHologramGrid,
      // The fireworks and drone queues are for accounts: a guest who presses
      // Join gets the sign-up window (with its log-in switch) instead.
      askForAccount(panel) {
        if (resolvedSessionMode !== 'guest' || !authPopup) return false;
        // Joined automatically once the sign-up or log-in succeeds.
        joinAfterSignIn = { panel };
        authPopup.open('signup');
        return true;
      },
    });
    if(latestShowSnapshot)showControls.applySnapshot(latestShowSnapshot);
    if (fireworksAudioUnlocked) {
      showControls.unlockAudio();
    }
    const activeShowControls = showControls;

    // A snapshot can arrive while these lazily imported show modules are still
    // building. Re-apply the retained state once every recipient exists.
    // The effects exist now: give them the current state even when it was
    // already applied (to nothing) during the boot.
    appliedEventKey = '';
    syncStageEventState();

    const runtime = {
      canvas,
      debugPanel,
      dispose,
      engine: activeEngine,
      host,
      hud,
      perfOverlay,
      remotePlayerRigs,
      scene,
      worldSocket,
    };
    // Only expose the global to dev tooling when the debug flag is on
    // (?debug=1) - otherwise it hands any page script a live handle to the
    // engine/scene/worldSocket, which is a needless attack surface in
    // production.
    if (perfFlags.debug) {
      window.__OMNIRAVE_RUNTIME__ = runtime;
      if (localAvatarPreview && new URLSearchParams(window.location.search).get('benchmark') === '1') {
        const { createVenuePerformancePanel } = await import('./createVenuePerformancePanel');
        venuePerformance = createVenuePerformancePanel(host, scene, () => remotePlayerRigs?.stats() ?? null, {
          onPreviewFireworks: act => applyFireworksPreview?.(act),
          getEventState: () => debugEventOverride === undefined ? latestWorldEventState : debugEventOverride,
        });
        const replayMode = new URLSearchParams(window.location.search).get('commandReplay');
        if (replayMode) {
          const { createVenueCommandReplayProbe } = await import('./createVenueCommandReplayProbe');
          createVenueCommandReplayProbe(host, scene, replayMode);
        }
      }
    }
    markBootPhase('render_ready');
    let firstFrame = true;
    let firstFrameAt = 0;

    activeEngine.runRenderLoop(() => {
      if (firstFrame) markBootPhase('frame_started');
      // WebGPU submits the command buffers recorded by scene.render() after
      // this callback returns. Resizing here, before recording the next frame,
      // prevents setHardwareScalingLevel() from destroying the swapchain
      // texture still referenced by the current submission.
      if (pendingHardwareScalingLevel !== undefined && !venuePerformance?.isRunning()) {
        activeEngine.setHardwareScalingLevel(pendingHardwareScalingLevel);
        pendingHardwareScalingLevel = undefined;
      }
      const measuringFrame = venuePerformance?.isRunning();
      const renderStart = measuringFrame ? performance.now() : 0;
      activeShowControls.update();
      const showControlEnd = measuringFrame ? performance.now() : 0;
      scene.render();
      if (firstFrame) {
        firstFrame = false;
        firstFrameAt = performance.now();
        markBootPhase('first_frame');
        const copy = loadingOverlay?.querySelector('.runtime-loading-overlay__copy');
        if (copy) copy.textContent = 'Preparing the graphics.';
      }
      // Babylon draws a mesh only once its GPU program is compiled, so the
      // first frames show the interface over an empty sky (Firefox) or a
      // black screen (Safari) while the venue compiles. The loading card
      // stays until the whole scene is ready, or VENUE_READY_CAP_MS after
      // the first frame, so one material that never compiles cannot keep a
      // player out.
      if (loadingOverlay) {
        const ready = scene.isReady(false);
        if (ready || performance.now() - firstFrameAt > VENUE_READY_CAP_MS) {
          loadingOverlay.remove();
          loadingOverlay = undefined;
          markBootPhase('visible', ready ? undefined : 'cap');
        }
      }
      const renderEnd = measuringFrame ? performance.now() : 0;
      const playerRuntime = scene.metadata?.reviewRuntime;
      const playerPosition = playerRuntime?.playerRig?.root.position;
      if (worldSocket && worldSpawnInitialized && playerPosition && !activeShowControls.operating) {
        worldSocket.sendMove({ x: playerPosition.x, y: playerPosition.y, z: playerPosition.z }, playerRuntime.playerRig.crouched === true);
      }
      const deltaSeconds = activeEngine.getDeltaTime() / 1000;
      const crowdStart = measuringFrame ? performance.now() : 0;
      remotePlayerRigs?.update(deltaSeconds);
      const crowdEnd = measuringFrame ? performance.now() : 0;
      if (localChatBubbles && playerPosition) {
        // Same sec 10.1/10.5 distance rules the remote rigs apply, measured
        // from the camera to the local avatar.
        const cameraPosition = scene.activeCamera?.globalPosition;
        localChatBubbles.update(
          deltaSeconds,
          cameraPosition ? Vector3.Distance(cameraPosition, playerPosition) : Number.NaN,
        );
      }
      stageAudioDevControls?.update();
      // Phase changes on the server clock, the same moment for every player.
      syncStageEventState();
      activeStageVisualizer.update(deltaSeconds);
      activeImmersiveAudioShow.update(deltaSeconds);
      activeCrownEffects.update(deltaSeconds);
      activeCascadeCourtLightFloor.update(deltaSeconds);
      activeHologramGrid.update(deltaSeconds);
      activeStageAtmospherics.update(deltaSeconds);

      if (measuringFrame) scene.metadata.venueCpuTimings = {
        render: renderEnd - showControlEnd, crowd: crowdEnd - crowdStart, shows: performance.now() - crowdEnd,
        showControl: showControlEnd - renderStart, fireworkQuads: activeShowControls.fireworkQuads,
      };
      // Feed the stage show's spill-light pulse real bass energy when audio is
      // live; null keeps it on its estimated 126BPM beat clock.
      playerRuntime?.stageShow?.setAudioEnergy?.(activeImmersiveAudioShow.bassLevel);
      const showBeat = getStageBeat();
      playerRuntime?.stageShow?.setShowClock?.(getShowSeconds(),
        showBeat?.timeline ? showBeat.timeline.beatPosition(showBeat.seconds) : undefined);
      const playerController = playerRuntime?.playerController;
      if (playerController) {
        staminaBar?.update({ stamina0to1: playerController.stamina0to1 });
      }
      if (playerReadout && playerPosition && playerController) {
        const state = playerRuntime?.reviewAvatar?.root.metadata?.animationState ?? playerController.animationState;
        const groundedLabel = playerController.grounded ? 'grounded' : 'airborne';
        const coordinates = `${playerPosition.x.toFixed(1)},${playerPosition.y.toFixed(1)},${playerPosition.z.toFixed(1)}`;
        const readout = `Player: ${state}${playerRuntime.playerRig.crouched ? ' crouched' : ''} ${groundedLabel} ${playerController.currentSpeedMetersPerSecond.toFixed(1)}m/s @ ${coordinates}`;
        if (playerReadout.value !== coordinates) playerReadout.value = coordinates;
        if (playerReadout.textContent !== readout) playerReadout.textContent = readout;
      }
      const routeProgress = playerRuntime?.routeProgress;
      if (objectiveReadout && routeProgress) {
        const objectiveText = routeProgress.complete || !routeProgress.activeCheckpoint
          ? `Objective: route complete (${routeProgress.completedCount}/${routeProgress.totalCount})`
          : `Objective: reach ${formatCheckpointLabel(routeProgress.activeCheckpoint.id)} (${routeProgress.completedCount}/${routeProgress.totalCount})`;
        if (objectiveReadout.value !== objectiveText) objectiveReadout.value = objectiveText;
        if (objectiveReadout.textContent !== objectiveText) objectiveReadout.textContent = objectiveText;
        if (completeBanner) {
          if (completeBanner.hidden !== !routeProgress.complete) completeBanner.hidden = !routeProgress.complete;
        }
        for (const button of Array.from(reviewHud?.querySelectorAll<HTMLButtonElement>('[data-review-checkpoint]') ?? [])) {
          const routeIndex = reviewCheckpoints?.findIndex((checkpoint) => checkpoint.id === button.dataset.reviewCheckpoint) ?? -1;
          if (routeIndex < 0 || routeIndex >= routeProgress.totalCount) {
            if (button.dataset.routeState !== undefined) delete button.dataset.routeState;
          } else if (routeIndex < routeProgress.completedCount) {
            if (button.dataset.routeState !== 'complete') button.dataset.routeState = 'complete';
          } else if (routeIndex === routeProgress.activeIndex) {
            if (button.dataset.routeState !== 'active') button.dataset.routeState = 'active';
          } else {
            if (button.dataset.routeState !== undefined) delete button.dataset.routeState;
          }
        }
      }
      if (playerRuntime?.selectedAvatarColorway) {
        for (const button of Array.from(reviewHud?.querySelectorAll<HTMLButtonElement>('[data-avatar-colorway]') ?? [])) {
          const pressed = String(button.dataset.avatarColorway === playerRuntime.selectedAvatarColorway.id);
          if (button.ariaPressed !== pressed) button.ariaPressed = pressed;
        }
      }
      perfFrameCounter += 1;
      if (perfFrameCounter % 30 === 0) {
        const fps = activeEngine.getFps();
        if (remoteAvatarReadout && remotePlayerRigs) {
          const stats = remotePlayerRigs.stats();
          remoteAvatarReadout.textContent = `Remote avatars: ${stats.completePlayers} | Sources: ${stats.cachedAssets} | Detail: ${stats.detailCounts.join('/')} | Model tris: ${Math.round(stats.modelTriangles)} | Animating: ${stats.animatingPlayers} | Loading: ${stats.pending}`;
        }

        // Hold the FPS target by trading render scale, never frame pacing:
        // sharp when the GPU can afford it, gracefully coarser when not. Skipped
        // entirely while the player pinned a manual Graphics level (sec 9.6).
        if (graphicsAutoEnabled && !venuePerformance?.isRunning()) {
          const config = resolveAdaptiveResolutionConfig(displayRefresh?.targetFps ?? 60);
          const nextState = stepAdaptiveResolution(adaptiveState, config, fps, performance.now());
          if (nextState.level !== adaptiveState.level) {
            pendingHardwareScalingLevel = nextState.level;
          }
          adaptiveState = nextState;
        }

        if (perfOverlay) {
          const activeFx = scene.activeCamera?._postProcesses?.filter(Boolean).length ?? 0;
          const shadowCasters =
            scene.metadata?.reviewRuntime?.lightingRig?.shadowGenerator?.getShadowMap()?.renderList?.length ?? 0;
          const readyTextures = scene.textures.filter((texture) => texture.isReady()).length;
          // Report the level actually in force - under a manual Graphics pin
          // the adaptive controller's own level is not the truth.
          updatePerfOverlay(perfOverlay, fps, fps > 0 ? 1000 / fps : 0, activeFx, shadowCasters, readyTextures, activeEngine.getHardwareScalingLevel());
        }
      }
    });

    window.addEventListener('resize', handleResize);
    activeEngine.onDisposeObservable.addOnce(cleanupOwnedResources);

    return { ...runtime, config: RUNTIME_CONFIG };
  } catch (error) {
    cleanupOwnedResources();
    try {
      engine?.dispose();
    } catch {
      // Preserve the startup error after best-effort engine teardown.
    }
    throw error;
  }
}
