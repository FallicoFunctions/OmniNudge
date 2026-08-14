export interface FireworksAudioPoint {
  x: number;
  y: number;
  z: number;
}

export interface FireworksAudio {
  /** Must be called from a player gesture so browser autoplay policy permits sound. */
  unlock: () => void;
  updateListener: (
    position: FireworksAudioPoint,
    forward: FireworksAudioPoint,
    up: FireworksAudioPoint,
  ) => void;
  playLaunch: (position: FireworksAudioPoint, intensity01: number) => void;
  playExplosion: (position: FireworksAudioPoint, intensity01: number) => void;
  dispose: () => void;
}

export interface CreateFireworksAudioOptions {
  contextFactory?: () => AudioContext | null;
}

const NOOP_FIREWORKS_AUDIO: FireworksAudio = {
  unlock() {},
  updateListener() {},
  playLaunch() {},
  playExplosion() {},
  dispose() {},
};

function createBrowserAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const AudioContextCtor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Lightweight procedural fireworks sound design. Every voice is synthesized
 * locally, then fed through an HRTF PannerNode at the launch/apex world
 * position. This avoids remote asset URLs and keeps the sound exactly tied to
 * the visual event that created it.
 */
export function createFireworksAudio(options: CreateFireworksAudioOptions = {}): FireworksAudio {
  const contextFactory = options.contextFactory ?? createBrowserAudioContext;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let disposed = false;
  const activeSources = new Set<AudioScheduledSourceNode>();

  function ensureContext(): AudioContext | null {
    if (disposed) {
      return null;
    }
    if (context) {
      return context;
    }
    try {
      const next = contextFactory();
      if (!next) {
        return null;
      }
      const compressor = next.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 12;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.22;
      const output = next.createGain();
      output.gain.value = 0.42;
      output.connect(compressor);
      compressor.connect(next.destination);

      const noise = next.createBuffer(1, Math.ceil(next.sampleRate * 1.8), next.sampleRate);
      const channel = noise.getChannelData(0);
      for (let i = 0; i < channel.length; i++) {
        channel[i] = Math.random() * 2 - 1;
      }

      context = next;
      master = output;
      noiseBuffer = noise;
      return next;
    } catch {
      // Sound effects must never prevent the 3D venue from starting.
      return null;
    }
  }

  function resumeContext(): void {
    const activeContext = ensureContext();
    if (activeContext?.state === 'suspended') {
      const result = activeContext.resume();
      if (result && typeof result.catch === 'function') {
        void result.catch(() => {});
      }
    }
  }

  function createPanner(activeContext: AudioContext, position: FireworksAudioPoint): PannerNode {
    const panner = activeContext.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 8;
    panner.maxDistance = 180;
    panner.rolloffFactor = 0.72;
    if ('positionX' in panner) {
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
    } else {
      const legacyPanner = panner as unknown as {
        setPosition: (x: number, y: number, z: number) => void;
      };
      legacyPanner.setPosition(position.x, position.y, position.z);
    }
    return panner;
  }

  function trackSource(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    activeSources.add(source);
    source.onended = () => {
      activeSources.delete(source);
      for (const node of nodes) {
        node.disconnect();
      }
    };
  }

  function playLaunch(position: FireworksAudioPoint, intensity01: number): void {
    const activeContext = context;
    const activeMaster = master;
    const activeNoiseBuffer = noiseBuffer;
    if (!activeContext || !activeMaster || !activeNoiseBuffer || activeContext.state !== 'running') {
      return;
    }
    const intensity = clamp01(intensity01);
    const now = activeContext.currentTime;
    const duration = 0.62;
    const panner = createPanner(activeContext, position);
    const voiceGain = activeContext.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(0.11 + intensity * 0.07, now + 0.06);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    voiceGain.connect(panner);
    panner.connect(activeMaster);

    const whistle = activeContext.createOscillator();
    whistle.type = 'sawtooth';
    whistle.frequency.setValueAtTime(170 + intensity * 50, now);
    whistle.frequency.exponentialRampToValueAtTime(760 + intensity * 260, now + duration);
    whistle.connect(voiceGain);
    whistle.start(now);
    whistle.stop(now + duration);
    trackSource(whistle, [whistle, voiceGain, panner]);

    const hiss = activeContext.createBufferSource();
    const hissFilter = activeContext.createBiquadFilter();
    const hissGain = activeContext.createGain();
    hiss.buffer = activeNoiseBuffer;
    hissFilter.type = 'bandpass';
    hissFilter.frequency.setValueAtTime(900, now);
    hissFilter.frequency.exponentialRampToValueAtTime(2800, now + duration);
    hissFilter.Q.value = 0.8;
    hissGain.gain.setValueAtTime(0.06 + intensity * 0.04, now);
    hissGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    hiss.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(panner);
    hiss.start(now);
    hiss.stop(now + duration);
    trackSource(hiss, [hiss, hissFilter, hissGain]);
  }

  function playExplosion(position: FireworksAudioPoint, intensity01: number): void {
    const activeContext = context;
    const activeMaster = master;
    const activeNoiseBuffer = noiseBuffer;
    if (!activeContext || !activeMaster || !activeNoiseBuffer || activeContext.state !== 'running') {
      return;
    }
    const intensity = clamp01(intensity01);
    const now = activeContext.currentTime;
    const duration = 1.25 + intensity * 0.45;
    const panner = createPanner(activeContext, position);
    const boomGain = activeContext.createGain();
    boomGain.gain.setValueAtTime(0.24 + intensity * 0.2, now);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    boomGain.connect(panner);
    panner.connect(activeMaster);

    const boom = activeContext.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(92 + intensity * 22, now);
    boom.frequency.exponentialRampToValueAtTime(34, now + duration);
    boom.connect(boomGain);
    boom.start(now);
    boom.stop(now + duration);
    trackSource(boom, [boom, boomGain, panner]);

    const crack = activeContext.createBufferSource();
    const crackFilter = activeContext.createBiquadFilter();
    const crackGain = activeContext.createGain();
    crack.buffer = activeNoiseBuffer;
    crackFilter.type = 'lowpass';
    crackFilter.frequency.setValueAtTime(5200 + intensity * 1800, now);
    crackFilter.frequency.exponentialRampToValueAtTime(280, now + duration);
    crackGain.gain.setValueAtTime(0.26 + intensity * 0.18, now);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(panner);
    crack.start(now);
    crack.stop(now + duration);
    trackSource(crack, [crack, crackFilter, crackGain]);
  }

  return {
    unlock: resumeContext,
    updateListener(position, forward, up) {
      const listener = context?.listener;
      if (!listener) {
        return;
      }
      const now = context?.currentTime ?? 0;
      if ('positionX' in listener) {
        listener.positionX.setValueAtTime(position.x, now);
        listener.positionY.setValueAtTime(position.y, now);
        listener.positionZ.setValueAtTime(position.z, now);
        listener.forwardX.setValueAtTime(forward.x, now);
        listener.forwardY.setValueAtTime(forward.y, now);
        listener.forwardZ.setValueAtTime(forward.z, now);
        listener.upX.setValueAtTime(up.x, now);
        listener.upY.setValueAtTime(up.y, now);
        listener.upZ.setValueAtTime(up.z, now);
      } else {
        const legacyListener = listener as unknown as {
          setPosition: (x: number, y: number, z: number) => void;
          setOrientation: (
            forwardX: number,
            forwardY: number,
            forwardZ: number,
            upX: number,
            upY: number,
            upZ: number,
          ) => void;
        };
        legacyListener.setPosition(position.x, position.y, position.z);
        legacyListener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      }
    },
    playLaunch,
    playExplosion,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const source of activeSources) {
        try {
          source.stop();
        } catch {
          // A source that already ended may reject a second stop in old WebKit.
        }
      }
      activeSources.clear();
      master?.disconnect();
      master = null;
      noiseBuffer = null;
      const activeContext = context;
      context = null;
      if (activeContext) {
        const result = activeContext.close();
        if (result && typeof result.catch === 'function') {
          void result.catch(() => {});
        }
      }
    },
  };
}

export { NOOP_FIREWORKS_AUDIO };
