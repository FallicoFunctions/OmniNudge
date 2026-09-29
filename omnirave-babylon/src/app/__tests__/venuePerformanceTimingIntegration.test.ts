import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { expect, it, vi } from 'vitest';
import { createVenuePerformancePanel } from '../createVenuePerformancePanel';

it('completes a measurement through the real WebGL instrumentation without GPU timer support', () => {
  vi.useFakeTimers({ toFake: ['performance'] });
  const engine = new NullEngine(); const scene = new Scene(engine);
  const host = document.createElement('div'); document.body.append(host);
  const panel = createVenuePerformancePanel(host, scene, () => null);
  try {
    expect(engine.isWebGPU).toBe(false);
    expect(engine.getCaps().timerQuery).toBeFalsy();
    host.querySelector('button')!.click();
    expect(panel.isRunning()).toBe(true);
    expect(host.querySelector('button')!.disabled).toBe(true);
    for (let i = 0; i < 700; i++) {
      vi.advanceTimersByTime(13); engine.beginFrame();
      vi.advanceTimersByTime(3); engine.endFrame();
    }
    expect(panel.isRunning()).toBe(false);
    expect(host.querySelector('button')!.disabled).toBe(false);
    expect(JSON.parse(host.querySelector('pre')!.textContent!)).toMatchObject({ renderer: 'WebGL',
      gpuSamples: 0, medianGpuFrameMs: null, gpuPassTimingEnabled: false, gpuPassTimings: [],
    });
  } finally {
    panel.dispose(); scene.dispose(); engine.dispose(); host.remove(); vi.useRealTimers();
  }
});
