import '@testing-library/jest-dom/vitest';

class TestResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: TestResizeObserver,
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: () =>
    ({
      clearRect() {},
      setTransform() {},
      fillRect() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {},
      save() {},
      restore() {},
      arc() {},
      ellipse() {},
      strokeRect() {},
      fillText() {},
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
      strokeStyle: '',
      fillStyle: '',
      globalAlpha: 1,
      lineWidth: 1,
      font: '',
      textAlign: 'left',
    }) satisfies Partial<CanvasRenderingContext2D>,
});
