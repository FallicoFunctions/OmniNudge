import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WaveformVisualizer } from '../WaveformVisualizer';

// jsdom has no canvas. This context behaves as browsers do where it matters:
// roundRect throws on a negative radius, which is what took the message list
// down on a phone.
type Bar = { x: number; w: number; r: number };
let bars: Bar[];
let width: number;

beforeEach(() => {
  bars = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => 32);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        clearRect() {},
        beginPath() {},
        fill() {},
        fillStyle: '',
        roundRect(x: number, _y: number, w: number, _h: number, r: number) {
          if (r < 0) throw new RangeError('Radius can not be negative');
          bars.push({ x, w, r });
        },
      }) as unknown as CanvasRenderingContext2D
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WaveformVisualizer', () => {
  it.each([
    ['a phone voice bubble', 100],
    ['a very narrow one', 20],
    ['a desktop one', 400],
  ])('draws every bar inside %s (%i px)', (_name, canvasWidth) => {
    width = canvasWidth;
    render(<WaveformVisualizer data={[0.2, 0.8, 0.5, 1]} progress={0.5} />);
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar.w).toBeGreaterThanOrEqual(1);
      expect(bar.r).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.w).toBeLessThanOrEqual(canvasWidth + 0.001);
    }
  });

  it('keeps all eighty bars when there is room for them', () => {
    width = 400;
    render(<WaveformVisualizer data={[0.5]} progress={0} />);
    expect(bars).toHaveLength(80);
  });

  it('draws nothing, and does not throw, on a canvas with no width yet', () => {
    width = 0;
    expect(() => render(<WaveformVisualizer data={[0.5]} progress={0} />)).not.toThrow();
  });
});
