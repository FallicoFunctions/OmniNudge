import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { parsePerfFlags } from './perfFlags';
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
import type { createMainStageScene } from '../scene/createMainStageScene';
import { resolveTravelCameraOffsets, TRAVEL_CAMERA_DISTANCE } from '../player/cameraRigMath';
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
import { loadPlayerSettings, savePlayerSettings } from '../ui/playerSettings';
import { applyUiTheme } from '../ui/uiTheme';
import { RUNTIME_CONFIG } from './runtimeConfig';

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
  // Player-facing chat panel (design sec 9.8 / 10.2 / 10.3 / 10.4). Only in the
  // world path - chat is venue-local and server-broadcast, so with no socket
  // there is nothing to send to and no one to hear it. Rendering it there would
  // be a dead control, so the single-player review path omits it entirely.
  let chatPanel: import('../ui/createChatPanel').ChatPanel | undefined;
  // Player-facing HUD shell (design sec 9.2 / 9.3 / 9.6). Also never gated
  // behind ?debug=1, also owned DOM torn down in cleanup.
  let topLeftControls: import('../ui/createTopLeftControls').TopLeftControls | undefined;
  let topRightControls: import('../ui/createTopRightControls').TopRightControls | undefined;
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
    chatPanel?.dispose();
    // Settings popup first: it lives inside the top-left block's slot and owns
    // a document keydown listener.
    settingsPopup?.dispose();
    topLeftControls?.dispose();
    topRightControls?.dispose();
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
          // Fast travel lands in the standard follow framing - avatar
          // centered, facing the checkpoint's authored look direction. The
          // raw authored views are scenery shots whose look target can sit
          // tens of meters from the avatar; teleporting into one left the
          // player unable to find themselves (flagged on the VIP terrace).
          const travelView = resolveTravelCameraOffsets(checkpoint.camera);
          // Defer one frame: the player's ground-height snap runs in the next
          // onBeforeRender, and applying the camera from the pre-snap player
          // position intermittently lands it inside nearby geometry.
          scene.onAfterRenderObservable.addOnce(() => {
            reviewRuntime?.cameraRig?.applyCheckpointView({
              alpha: 0,
              beta: 1.12,
              radius: TRAVEL_CAMERA_DISTANCE,
              ...travelView,
            });
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
          // Same standard follow framing as a checkpoint fast-travel, facing
          // the default north-facing direction (no authored view to derive from).
          const travelView = resolveTravelCameraOffsets(undefined);
          scene.onAfterRenderObservable.addOnce(() => {
            reviewRuntime?.cameraRig?.applyCheckpointView({
              alpha: 0,
              beta: 1.12,
              radius: TRAVEL_CAMERA_DISTANCE,
              ...travelView,
            });
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
      stageAudioDevControls?.dispose();
      stageMediaPlayer?.dispose();
      stageVisualizer?.dispose();
      immersiveAudioShow?.dispose();
      crownEffects?.dispose();
      cascadeCourtLightFloor?.dispose();
      hologramGrid?.dispose();
      stageAtmospherics?.dispose();
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
    let stageMediaPlayer: import('../media/stageMediaPlayer').StageMediaPlayer | undefined;
    let stageAudioDevControls: import('../ui/createStageAudioDevControls').StageAudioDevControls | undefined;
    let stageVisualizer: import('../scene/createStageVisualizer').StageVisualizer | undefined;
    let immersiveAudioShow: import('../scene/createImmersiveAudioShow').ImmersiveAudioShow | undefined;
    let crownEffects: import('../scene/createCrownEffects').CrownEffects | undefined;
    let cascadeCourtLightFloor: import('../scene/createCascadeCourtLightFloor').CascadeCourtLightFloor | undefined;
    let hologramGrid: import('../scene/createHologramGrid').HologramGrid | undefined;
    let stageAtmospherics: import('../scene/createStageAtmospherics').StageAtmospherics | undefined;
    // Latest active-zone media from the world snapshot; the HUD reads it on a
    // 1s tick instead of re-rendering on every snapshot.
    let activeZoneId = 'main_stage';
    let activeZoneMedia: import('../network/worldSocket').ZoneMediaState | null = null;
    // Latest snapshot roster, for the venue block's global / venue player
    // counts (sec 9.4). Held by reference - the HUD tick counts it, so there is
    // no per-snapshot allocation here. Null in the single-player path, where
    // the HUD hides both count lines instead of inventing numbers.
    let activePlayers: readonly import('../network/worldSocket').WorldPlayer[] | null = null;
    if (perfFlags.worldUrl && perfFlags.worldToken) {
      const [{ createWorldSocket }, { createRemotePlayerRigs }, { createStageMediaPlayer }] = await Promise.all([
        import('../network/worldSocket'),
        import('../player/createRemotePlayerRigs'),
        import('../media/stageMediaPlayer'),
      ]);
      remotePlayerRigs = createRemotePlayerRigs(scene);
      stageMediaPlayer = createStageMediaPlayer();
      worldSocket = createWorldSocket({
        url: perfFlags.worldUrl,
        token: perfFlags.worldToken,
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
          // Sec 10.2: guests cannot mute others, and every player is a guest
          // until the auth block. That block flips this to true (or calls
          // chatPanel.setCanMute(true) on upgrade) - the mute mechanism, the
          // `Muted Users` view, and message filtering are already complete.
          canMute: false,
          debugChromePresent: perfFlags.debug,
        });
        const activeChatPanel = chatPanel;
        worldSocket.onChat((message) => {
          activeChatPanel.appendMessage(message);
        });
        // Sec 10.4: the log is per venue session. The first snapshot counts as
        // the venue entry, so the fresh log opens with `Entered [Venue]`.
        let chatZoneId: string | null = null;
        worldSocket.onSnapshot((snapshot) => {
          activeChatPanel.setCurrentPlayerId(snapshot.currentPlayerId);
          if (snapshot.activeZone && snapshot.activeZone !== chatZoneId) {
            chatZoneId = snapshot.activeZone;
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
        // Drive the stage screen's event mode (countdown / fireworks video)
        // from the active zone's scheduled event, if any.
        const activeEvent = snapshot.zoneEvents.find((zone) => zone.zoneId === snapshot.activeZone) ?? null;
        const eventState = activeEvent
          ? { phase: activeEvent.phase, countdownSeconds: activeEvent.countdownSeconds }
          : null;
        stageVisualizer?.setEventState(eventState);
        immersiveAudioShow?.setEventState(eventState);
        crownEffects?.setEventState(eventState);
        cascadeCourtLightFloor?.setEventState(eventState);
        hologramGrid?.setEventState(eventState);
        stageAtmospherics?.setEventState(eventState);
      });
      worldSocket.onStatusChange((status) => {
        console.info(`[world] socket ${status}`);
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
    // active venue and its synced track; in the single-player review path
    // there is no media, so it shows the venue name and "No track playing".
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
        const spawn = reviewRuntime?.spawn ?? BACK_PLAZA_SPAWN;
        reviewRuntime?.playerRig?.root.position.set(spawn.x, spawn.y, spawn.z);
        const input = reviewRuntime?.input?.state;
        if (input) {
          input.sprint = false;
          input.crouch = false;
        }
        const travelView = resolveTravelCameraOffsets(undefined);
        scene.onAfterRenderObservable.addOnce(() => {
          reviewRuntime?.cameraRig?.applyCheckpointView({
            alpha: 0,
            beta: 1.12,
            radius: TRAVEL_CAMERA_DISTANCE,
            ...travelView,
          });
        });
        topLeftControls?.openPanel(null);
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

      topLeftControls = createTopLeftControls(host, {
        settingsPanel: settingsPopup.element,
        avatarColorways: reviewRuntime?.avatarColorways,
        selectedAvatarColorwayId: reviewRuntime?.selectedAvatarColorway?.id,
        onSelectAvatarColorway(colorway) {
          reviewRuntime?.setAvatarColorway?.(colorway.id);
        },
        debugChromePresent: perfFlags.debug,
      });

      hudNotice = createHudNotice(host, { debugChromePresent: perfFlags.debug });
      // AUTH IS A LATER BLOCK. Nothing here calls an auth endpoint or fakes a
      // session; the buttons answer honestly instead of doing nothing, and
      // swap to the real handlers when that block lands.
      const accountsLaterNotice = () => {
        hudNotice?.show('Accounts arrive in a later update - you are raving as a guest.');
      };
      topRightControls = createTopRightControls(host, {
        mode: 'guest',
        onLogIn: accountsLaterNotice,
        onSignUp: accountsLaterNotice,
        onLogout: accountsLaterNotice,
        debugChromePresent: perfFlags.debug,
      });
    }

    // The Main Stage screen visualizer. It runs in BOTH paths: with the stage
    // media player (world/music path) it reacts to the live synced audio; in
    // the single-player review path there is no player, so it reads a zero
    // spectrum and shows an idle shimmer instead of crashing. Frequency data
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
    // the world/music path, gentle idle sweeps in the single-player path.
    const { createImmersiveAudioShow } = await import('../scene/createImmersiveAudioShow');
    immersiveAudioShow = createImmersiveAudioShow(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeImmersiveAudioShow = immersiveAudioShow;

    // The crown figurehead effects (reactive LED tracery climbing the spire,
    // the apex energy crystal, the sky beacon). Shares the exact same spectrum
    // closure so it stays audio- and color-coherent with the venue; idle in the
    // single-player path.
    const { createCrownEffects } = await import('../scene/createCrownEffects');
    crownEffects = createCrownEffects(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeCrownEffects = crownEffects;

    // The Cascade Court flank light floor: a music-reactive additive glow laid
    // just above the pearl paving tiles (the tiles themselves - the physical,
    // walkable floor - are untouched). Shares the exact same spectrum closure
    // so it stays audio- and colour-coherent with the venue; a slow calm
    // shimmer in the single-player path so the floor still reads as pearl.
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
    // venue; slow drifting formations in the single-player path.
    const { createHologramGrid } = await import('../scene/createHologramGrid');
    hologramGrid = createHologramGrid(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeHologramGrid = hologramGrid;

    // The stage atmospherics (haze air body, CO2/cryo jets, flame jets,
    // cold-spark fountains, strobe pods): the PHYSICAL effects show. Shares the
    // same spectrum closure; haze-only idle in the single-player path.
    const { createStageAtmospherics } = await import('../scene/createStageAtmospherics');
    stageAtmospherics = createStageAtmospherics(scene, {
      getFrequencyData: getStageFrequencyData,
    });
    const activeStageAtmospherics = stageAtmospherics;

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
      stageAudioDevControls?.update();
      activeStageVisualizer.update(deltaSeconds);
      activeImmersiveAudioShow.update(deltaSeconds);
      activeCrownEffects.update(deltaSeconds);
      activeCascadeCourtLightFloor.update(deltaSeconds);
      activeHologramGrid.update(deltaSeconds);
      activeStageAtmospherics.update(deltaSeconds);
      // Feed the stage show's spill-light pulse real bass energy when audio is
      // live; null keeps it on its estimated 126BPM beat clock.
      playerRuntime?.stageShow?.setAudioEnergy?.(activeImmersiveAudioShow.bassLevel);
      const playerController = playerRuntime?.playerController;
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
