import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { parsePerfFlags } from './perfFlags';
import { exchangeLaunchSession, parseSessionExchangeParams } from '../network/sessionExchange';
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
import '@babylonjs/core/Shaders/rgbdDecode.fragment';
import {
  ADAPTIVE_RESOLUTION_DEFAULTS,
  createAdaptiveResolutionState,
  resolveManualHardwareScalingLevel,
  stepAdaptiveResolution,
} from './adaptiveResolutionMath';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { createMainStageScene } from '../scene/createMainStageScene';
import { resolveTravelCameraOffsets, TRAVEL_CAMERA_DISTANCE } from '../player/cameraRigMath';
import { generateAvatarDefinition, hasAvatarLoadout, parseAvatarLoadout, serializeAvatarLoadout } from '../player/avatarDefinition';
import { BACK_PLAZA_SPAWN } from '../scene/reviewRouteData';
import type { ReviewCheckpoint } from '../scene/reviewRouteData';
import { createDebugPanel } from '../ui/createDebugPanel';
import { createPerfOverlay, updatePerfOverlay } from '../ui/createPerfOverlay';
import { createReviewHud, formatCheckpointLabel } from '../ui/createReviewHud';
import { createRuntimeLoadingOverlay } from '../ui/createRuntimeLoadingOverlay';
import { createEnterOmniRaveOverlay } from '../ui/createEnterOmniRaveOverlay';
import { createHudNotice } from '../ui/createHudNotice';
import { createSettingsPopup } from '../ui/createSettingsPopup';
import { createTopLeftControls } from '../ui/createTopLeftControls';
import { createTopRightControls } from '../ui/createTopRightControls';
import { createAuthPopup } from '../ui/createAuthPopup';
import { createWelcomeCard } from '../ui/createWelcomeCard';
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

async function createBabylonEngine(canvas: HTMLCanvasElement, forceWebGl: boolean): Promise<RuntimeEngine> {
  if (!forceWebGl) {
    let webgpu: WebGPUEngine | undefined;

    try {
      if (await WebGPUEngine.IsSupportedAsync) {
        webgpu = new WebGPUEngine(canvas, {
          adaptToDeviceRatio: true,
          antialias: true,
        });
        await webgpu.initAsync();
        return webgpu;
      }
    } catch {
      // A rejected adapter/device request must not leave a partial WebGPU
      // engine alive or prevent the supported WebGL fallback from booting.
      try {
        webgpu?.dispose();
      } catch {
        // Continue to WebGL even if the failed engine cannot finish teardown.
      }
    }
  }

  return createWebGlEngine(canvas);
}

export async function createRuntime(host: HTMLElement) {
  const canvas = document.createElement('canvas');
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
  // The real launch flow (backend's SessionService.BuildLaunchURL) redirects
  // here with `?mode=<account|guest>&handoff=<one-time token>`, NOT a world
  // socket URL/token directly - those only exist after exchanging the
  // handoff via POST /omnigame/session/exchange (see sessionExchange.ts).
  // Direct `?world=&wtoken=` (perfFlags) takes precedence when present -
  // that remains the local dev/review shortcut the module comment there
  // describes. exchangeLaunchSession resolves to null on any failure (no
  // handoff param, expired/consumed token, network error), which correctly
  // falls through to no world connection rather than throwing during boot.
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
  // its use below at localAvatarDefinition, which applies this instead of
  // generating a random guest look when present.
  let resolvedAccountLoadout: Record<string, string> | undefined;
  if (!resolvedWorldUrl || !resolvedWorldToken) {
    const exchangeParams = parseSessionExchangeParams(window.location.search);
    if (exchangeParams) {
      const exchanged = await exchangeLaunchSession(exchangeParams);
      if (exchanged) {
        resolvedWorldUrl = exchanged.worldSocketUrl;
        resolvedWorldToken = exchanged.worldSessionToken;
        // An SSO'd omninudge.com account player must never see a Log In /
        // Sign Up prompt for an identity they already have.
        resolvedSessionMode = exchanged.mode === 'account' ? 'account' : 'guest';
        resolvedAccountLoadout = exchanged.loadout;
      } else {
        console.warn('[world] session exchange failed; continuing without a world connection');
      }
    }
  }
  // The local player's current serialized appearance - starts as the guest's
  // randomly generated one (see localAvatarDefinition below) and is
  // reassigned in place by applySessionUpgrade on login/signup/logout, so the
  // world socket's onStatusChange('open') handler always (re)publishes
  // whichever loadout is current, including across an in-place reconnect.
  let localAvatarLoadout: Record<string, string> = {};
  let engine: RuntimeEngine | undefined;
  let hud: HTMLElement | undefined;
  let perfOverlay: HTMLElement | undefined;
  let debugPanel: HTMLElement | undefined;
  let loadingOverlay: HTMLElement | undefined;
  let enterOverlay: import('../ui/createEnterOmniRaveOverlay').EnterOmniRaveOverlay | undefined;
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
  // Sec 11.2: what the auth window turns into after a successful login/signup.
  let welcomeCard: import('../ui/createWelcomeCard').WelcomeCard | undefined;
  let settingsPopup: import('../ui/createSettingsPopup').SettingsPopup | undefined;
  let hudNotice: import('../ui/createHudNotice').HudNotice | undefined;
  let handleCanvasPick: ((event: MouseEvent) => void) | undefined;
  let handleResize: (() => void) | undefined;
  let disposed = false;

  const cleanupOwnedResources = () => {
    if (disposed) {
      return;
    }
    disposed = true;

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
    perfOverlay?.remove();
    hud?.remove();
    loadingOverlay?.remove();
    enterOverlay?.dispose();
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
    welcomeCard?.dispose();
    hudNotice?.dispose();
    canvas.remove();
  };

  try {
    engine = await createBabylonEngine(canvas, perfFlags.webgl);
    const activeEngine = engine;

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
      activeEngine.resize();
    };
    loadingOverlay = createRuntimeLoadingOverlay(host);

    // Keep the engine/bootstrap chunk small; scene construction brings in the
    // full Main Stage graph and can load behind the visible boot overlay.
    const { createMainStageScene: createScene } = await import('../scene/createMainStageScene');
    const scene = await createScene(activeEngine);
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

    // Sec 6.2: guests get a RANDOM GENERATED avatar, cannot edit it, and it is
    // not persisted - so it is generated fresh here at boot and applied to the
    // local body (which also applies sec 6.5's height effects to the rig).
    // An SSO'd account player (arrived via the real omninudge.com handoff -
    // see resolvedAccountLoadout above) gets their own saved appearance
    // instead - they must see themselves as they saved themselves, not a
    // random guest. The serialized form is the loadout other players would
    // dress this ghost from, and is published below (once the world socket
    // connects) via a "loadout" event so other players actually see it too.
    const localAvatarDefinition = hasAvatarLoadout(resolvedAccountLoadout)
      ? parseAvatarLoadout(resolvedAccountLoadout)
      : generateAvatarDefinition();
    reviewRuntime?.setAvatarDefinition?.(localAvatarDefinition);
    localAvatarLoadout = hasAvatarLoadout(resolvedAccountLoadout)
      ? (resolvedAccountLoadout as Record<string, string>)
      : serializeAvatarLoadout(localAvatarDefinition);
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

    if (perfFlags.debug) {
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
      });
      hud = reviewHud;
      perfOverlay = createPerfOverlay(host);
      debugPanel = createDebugPanel(host);
      objectiveReadout = reviewHud.querySelector<HTMLOutputElement>('[data-review-objective]');
      completeBanner = reviewHud.querySelector<HTMLElement>('[data-review-complete]');
      pickReadout = debugPanel.querySelector<HTMLOutputElement>('[data-debug-readout="mesh-pick"]');
      playerReadout = debugPanel.querySelector<HTMLOutputElement>('[data-debug-readout="player-state"]');

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
      worldSocket?.dispose();
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
      fireworksShow?.dispose();
      cleanupOwnedResources();
      activeEngine.dispose();
    };
    // Multiplayer presence (opt-in via ?world=&wtoken=): stream the local
    // player's position to the Go world server and render every other
    // connected player as an embodied ghost. The socket module throttles
    // outbound moves internally; the render loop just offers the freshest
    // position each frame.
    let worldSocket: import('../network/worldSocket').WorldSocket | undefined;
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
    let fireworksShow: import('../scene/createFireworksShow').FireworksShow | undefined;
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
      const [{ createWorldSocket }, { createRemotePlayerRigs }, { createStageMediaPlayer }] = await Promise.all([
        import('../network/worldSocket'),
        import('../player/createRemotePlayerRigs'),
        import('../media/stageMediaPlayer'),
      ]);
      remotePlayerRigs = createRemotePlayerRigs(scene);
      // Sec 7.8: playerController was constructed before this rig existed
      // (see createMainStageScene's setRemotePlayerCollisionSource), so this
      // is the one-time hookup for local-vs-remote-player collision.
      reviewRuntime?.setRemotePlayerCollisionSource?.(remotePlayerRigs.collisionTargets);
      stageMediaPlayer = createStageMediaPlayer();
      worldSocket = createWorldSocket({
        url: resolvedWorldUrl,
        token: resolvedWorldToken,
      });
      const activeWorldSocket = worldSocket;

      // ---- Chat panel (sec 9.8 / 10.2 / 10.3 / 10.4). Player-facing, so NOT
      // gated behind perfFlags.debug - only its bottom-left anchor lifts when
      // the dev stage-audio scrubber occupies that corner under ?debug=1.
      {
        const [{ createChatPanel }, { formatVenueName: formatChatVenueName }] = await Promise.all([
          import('../ui/createChatPanel'),
          import('../ui/createPlayerHud'),
        ]);
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
          debugChromePresent: perfFlags.debug,
        });
        const activeChatPanel = chatPanel;
        // Sec 10.5: the same message stream that fills the log drives the
        // above-head bubbles.
        const localPlayerRoot = reviewRuntime?.playerRig?.root;
        if (localPlayerRoot) {
          const { createChatBubbleStack } = await import('../player/createChatBubbleStack');
          localChatBubbles = createChatBubbleStack(scene, 'local', localPlayerRoot);
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

      worldSocket.onSnapshot((snapshot) => {
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
        const activeEvent = snapshot.zoneEvents.find((zone) => zone.zoneId === snapshot.activeZone) ?? null;
        const eventState = activeEvent
          ? {
              phase: activeEvent.phase,
              countdownSeconds: activeEvent.countdownSeconds,
              activeMinute: activeEvent.activeMinute,
            }
          : null;
        stageVisualizer?.setEventState(eventState);
        immersiveAudioShow?.setEventState(eventState);
        crownEffects?.setEventState(eventState);
        cascadeCourtLightFloor?.setEventState(eventState);
        hologramGrid?.setEventState(eventState);
        stageAtmospherics?.setEventState(eventState);
        fireworksShow?.setEventState(eventState);
      });
      // Sec 6.2/6.5: publish the SAME loadout that was applied to the local
      // render (the outer localAvatarLoadout variable) so other players'
      // ghost of us matches what we see locally. Sent on every "open"
      // transition - the initial connect AND every applySessionUpgrade
      // reconnect - by READING the outer variable at fire time rather than
      // closing over a snapshot of it, so a login/signup that reassigns it
      // just before reconnecting publishes the new appearance, not the stale
      // guest one this closure was created with.
      worldSocket.onStatusChange((status) => {
        console.info(`[world] socket ${status}`);
        if (status === 'open' && localAvatarLoadout) {
          activeWorldSocket.sendLoadout(localAvatarLoadout);
        }
      });
      worldSocket.connect();

      // Mobile (and most desktop) autoplay policy blocks audio until an
      // explicit user gesture. This overlay's tap IS that gesture.
      const activeStageMediaPlayer = stageMediaPlayer;
      enterOverlay = createEnterOmniRaveOverlay(host, () => {
        activeStageMediaPlayer.unlock();
        enterOverlay?.dispose();
        enterOverlay = undefined;
      });

      // DEV-ONLY audio scrubber + play/pause. Only in the world/music path and
      // only under ?debug=1 (same gate as the rest of the dev chrome).
      if (perfFlags.debug) {
        const { createStageAudioDevControls } = await import('../ui/createStageAudioDevControls');
        stageAudioDevControls = createStageAudioDevControls(host, activeStageMediaPlayer);
      }
    }

    // The player HUD ships in BOTH paths: with a world socket it shows the
    // active venue and its synced track; on the dev/review path (no world
    // connection) there is no media, so it shows the venue name and "No track
    // playing".
    // The elapsed time comes from the LOCAL playhead (the media player), so it
    // keeps counting between snapshots; duration comes from the server entry.
    {
      const { createPlayerHud, formatVenueName, resolvePlayerCounts } = await import('../ui/createPlayerHud');
      const hudMediaPlayer = stageMediaPlayer;
      playerHud = createPlayerHud(host, { debugChromePresent: perfFlags.debug });
      const refreshPlayerHud = () => {
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
      const { createStaminaBar } = await import('../ui/createStaminaBar');
      staminaBar = createStaminaBar(host);
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
        avatarColorways: reviewRuntime?.avatarColorways,
        selectedAvatarColorwayId: reviewRuntime?.selectedAvatarColorway?.id,
        onSelectAvatarColorway(colorway) {
          reviewRuntime?.setAvatarColorway?.(colorway.id);
        },
        onPanelChange(panel) {
          if (panel === null) {
            return;
          }
          // Sec 11.2: a direct top-level UI action closes the welcome card and
          // then proceeds - the card never swallows the click.
          welcomeCard?.dismiss();
          // Sec 12: guests keep the normal `Avatar` button, but clicking it
          // "opens signup window immediately" instead of the editor, and
          // "reopens on every click" - closing the panel here is what makes
          // the next click a fresh open rather than a toggle-to-closed.
          if (panel === 'avatar' && resolvedSessionMode === 'guest') {
            topLeftControls?.openPanel(null);
            vipGateOpenedAuthPopup = false;
            authPopup?.open('signup');
          }
        },
        debugChromePresent: perfFlags.debug,
      });

      hudNotice = createHudNotice(host, { debugChromePresent: perfFlags.debug });

      // backend/internal/omnigame/api/handlers/runtime_auth_handler.go's
      // login/signup/logout endpoints all return the same session-exchange
      // response shape a fresh launch gets. Player-flagged (2026-08-02): a
      // full-page reload into it went black and re-booted the whole scene -
      // applySessionUpgrade instead hot-swaps in place: worldSocket.reconnect
      // keeps every chat/media/remote-player listener already registered
      // (see that method's own comment), and the local avatar mesh updates
      // live via reviewRuntime.setAvatarDefinition, exactly like an avatar
      // colorway change already does. currentVenue is the world server's own
      // idea of "where you are right now" (activeZoneId, updated by every
      // snapshot below) so an account upgrade mid-session keeps the player in
      // the same venue rather than bouncing them back to main_stage.
      const applySessionUpgrade = (session: import('../network/runtimeAuth').RuntimeAuthSession) => {
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

        if (hasAvatarLoadout(session.loadout)) {
          // An existing account's saved appearance (or one just seeded from
          // this guest's own currentLoadout below, on a brand-new account).
          localAvatarLoadout = session.loadout;
        } else if (nextMode === 'guest') {
          // Logout: back to an anonymous guest, so a fresh random look - sec
          // 6.2's same "guests get a random generated avatar" rule the boot
          // path above already applies.
          localAvatarLoadout = serializeAvatarLoadout(generateAvatarDefinition());
        }
        reviewRuntime?.setAvatarDefinition?.(parseAvatarLoadout(localAvatarLoadout));
        scene.metadata = { ...scene.metadata, localAvatarLoadout };

        if (!worldSocket) {
          // No world connection to hot-swap (dev/review scaffold - see the
          // module banner comment): nothing here to reconnect in place, so
          // fall back to the reload every other boot path already handles.
          navigateToSession(session);
          return;
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
        if (nextMode === 'account') {
          // Sec 11.2: the auth window "transforms directly into the
          // venue-styled welcome card" - same size, same place, so closing one
          // and showing the other in its slot IS the transform.
          welcomeCard?.show(session.playerName);
        } else {
          // Sec 11.4 logout: "no extra message, no welcome card". The visible
          // confirmation is the top-right controls flipping back to Log In /
          // Sign Up, plus the new guest name and look.
          welcomeCard?.dismiss();
        }
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
          try {
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
            applySessionUpgrade(session);
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
      // Sec 11.1: near bottom-center, rising out of the emote HUD area - so
      // both venue windows mount on the host itself rather than inside a
      // corner control block's slot. Sec 11.2's card takes the same slot on
      // screen, which is what makes the transform read as one window.
      welcomeCard = createWelcomeCard({
        onEditAvatar() {
          topLeftControls?.openPanel('avatar');
        },
      });
      host.append(authPopup.element, welcomeCard.element);

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
          // Sec 11.2: a direct top-level action closes the card and proceeds.
          welcomeCard?.dismiss();
          authPopup?.open('login');
        },
        onSignUp() {
          welcomeCard?.dismiss();
          authPopup?.open('signup');
        },
        async onLogout() {
          try {
            const session = await runtimeLogout(activeZoneId);
            applySessionUpgrade(session);
          } catch {
            hudNotice?.show('Could not log out. Try again.');
          }
        },
        debugChromePresent: perfFlags.debug,
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
    const { createStageVisualizer } = await import('../scene/createStageVisualizer');
    stageVisualizer = createStageVisualizer(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeStageVisualizer = stageVisualizer;

    // The venue-wide immersive show (beams, laser fans, air particles, floor
    // pulse). Like the visualizer it runs in BOTH paths: audio-reactive with
    // the world/music path, gentle idle sweeps when no audio is present (no
    // world connection).
    const { createImmersiveAudioShow } = await import('../scene/createImmersiveAudioShow');
    immersiveAudioShow = createImmersiveAudioShow(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeImmersiveAudioShow = immersiveAudioShow;

    // The crown figurehead effects (reactive LED tracery climbing the spire,
    // the apex energy crystal, the sky beacon). Shares the exact same spectrum
    // closure so it stays audio- and color-coherent with the venue; idle when
    // no audio is present (no world connection).
    const { createCrownEffects } = await import('../scene/createCrownEffects');
    crownEffects = createCrownEffects(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeCrownEffects = crownEffects;

    // The Cascade Court flank light floor: a music-reactive additive glow laid
    // just above the pearl paving tiles (the tiles themselves - the physical,
    // walkable floor - are untouched). Shares the exact same spectrum closure
    // so it stays audio- and colour-coherent with the venue; a slow calm
    // shimmer when no audio is present (no world connection) so the floor
    // still reads as pearl.
    const { createCascadeCourtLightFloor } = await import('../scene/createCascadeCourtLightFloor');
    cascadeCourtLightFloor = createCascadeCourtLightFloor(scene, {
      getFrequencyData: getStageFrequencyData,
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
    const { createHologramGrid } = await import('../scene/createHologramGrid');
    hologramGrid = createHologramGrid(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeHologramGrid = hologramGrid;

    // The stage atmospherics (haze air body, CO2/cryo jets, flame jets,
    // cold-spark fountains, strobe pods): the PHYSICAL effects show. Shares the
    // same spectrum closure; haze-only idle when no audio is present (no world
    // connection).
    const { createStageAtmospherics } = await import('../scene/createStageAtmospherics');
    stageAtmospherics = createStageAtmospherics(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeStageAtmospherics = stageAtmospherics;

    // §5.1.1 Main Stage scheduled event: aerial sky bursts + stage-level pyro,
    // idle (no launches) outside the event's active phase. Shares the same
    // spectrum closure for palette/beat coherence with the rest of the venue.
    const { createFireworksShow } = await import('../scene/createFireworksShow');
    fireworksShow = createFireworksShow(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeFireworksShow = fireworksShow;

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
    }
    loadingOverlay.remove();

    activeEngine.runRenderLoop(() => {
      // WebGPU submits the command buffers recorded by scene.render() after
      // this callback returns. Resizing here, before recording the next frame,
      // prevents setHardwareScalingLevel() from destroying the swapchain
      // texture still referenced by the current submission.
      if (pendingHardwareScalingLevel !== undefined) {
        activeEngine.setHardwareScalingLevel(pendingHardwareScalingLevel);
        pendingHardwareScalingLevel = undefined;
      }
      scene.render();
      const playerRuntime = scene.metadata?.reviewRuntime;
      const playerPosition = playerRuntime?.playerRig?.root.position;
      if (worldSocket && playerPosition) {
        worldSocket.sendMove({ x: playerPosition.x, y: playerPosition.y, z: playerPosition.z });
      }
      const deltaSeconds = activeEngine.getDeltaTime() / 1000;
      remotePlayerRigs?.update(deltaSeconds);
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
      activeStageVisualizer.update(deltaSeconds);
      activeImmersiveAudioShow.update(deltaSeconds);
      activeCrownEffects.update(deltaSeconds);
      activeCascadeCourtLightFloor.update(deltaSeconds);
      activeHologramGrid.update(deltaSeconds);
      activeStageAtmospherics.update(deltaSeconds);
      activeFireworksShow.update(deltaSeconds);
      // Feed the stage show's spill-light pulse real bass energy when audio is
      // live; null keeps it on its estimated 126BPM beat clock.
      playerRuntime?.stageShow?.setAudioEnergy?.(activeImmersiveAudioShow.bassLevel);
      const playerController = playerRuntime?.playerController;
      if (playerController) {
        staminaBar?.update({ stamina0to1: playerController.stamina0to1 });
      }
      if (playerReadout && playerPosition && playerController) {
        const state = playerRuntime?.reviewAvatar?.root.metadata?.animationState ?? playerController.animationState;
        const groundedLabel = playerController.grounded ? 'grounded' : 'airborne';
        playerReadout.value = `${playerPosition.x.toFixed(1)},${playerPosition.y.toFixed(1)},${playerPosition.z.toFixed(1)}`;
        playerReadout.textContent = `Player: ${state} ${groundedLabel} ${playerController.currentSpeedMetersPerSecond.toFixed(1)}m/s @ ${playerReadout.value}`;
      }
      const routeProgress = playerRuntime?.routeProgress;
      if (objectiveReadout && routeProgress) {
        const objectiveText = routeProgress.complete || !routeProgress.activeCheckpoint
          ? `Objective: route complete (${routeProgress.completedCount}/${routeProgress.totalCount})`
          : `Objective: reach ${formatCheckpointLabel(routeProgress.activeCheckpoint.id)} (${routeProgress.completedCount}/${routeProgress.totalCount})`;
        objectiveReadout.value = objectiveText;
        objectiveReadout.textContent = objectiveText;
        if (completeBanner) {
          completeBanner.hidden = !routeProgress.complete;
        }
        for (const button of Array.from(reviewHud?.querySelectorAll<HTMLButtonElement>('[data-review-checkpoint]') ?? [])) {
          const routeIndex = reviewCheckpoints?.findIndex((checkpoint) => checkpoint.id === button.dataset.reviewCheckpoint) ?? -1;
          if (routeIndex < 0 || routeIndex >= routeProgress.totalCount) {
            delete button.dataset.routeState;
          } else if (routeIndex < routeProgress.completedCount) {
            button.dataset.routeState = 'complete';
          } else if (routeIndex === routeProgress.activeIndex) {
            button.dataset.routeState = 'active';
          } else {
            delete button.dataset.routeState;
          }
        }
      }
      if (playerRuntime?.selectedAvatarColorway) {
        for (const button of Array.from(reviewHud?.querySelectorAll<HTMLButtonElement>('[data-avatar-colorway]') ?? [])) {
          button.ariaPressed = String(button.dataset.avatarColorway === playerRuntime.selectedAvatarColorway.id);
        }
      }
      perfFrameCounter += 1;
      if (perfFrameCounter % 30 === 0) {
        const fps = activeEngine.getFps();

        // Hold the FPS target by trading render scale, never frame pacing:
        // sharp when the GPU can afford it, gracefully coarser when not. Skipped
        // entirely while the player pinned a manual Graphics level (sec 9.6).
        if (graphicsAutoEnabled) {
          const nextState = stepAdaptiveResolution(adaptiveState, ADAPTIVE_RESOLUTION_DEFAULTS, fps, performance.now());
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
