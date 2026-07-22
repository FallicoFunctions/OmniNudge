import { describe, expect, it, vi } from 'vitest';

vi.mock('hls.js', () => {
  class MockHls {
    static isSupported() {
      return true;
    }
  }

  return { default: MockHls };
});

describe('loadHls', () => {
  it('loads the bundled module once without injecting a remote script', async () => {
    const createElement = vi.spyOn(document, 'createElement');
    const { loadHls } = await import('../hlsLoader');

    const first = await loadHls();
    const second = await loadHls();

    expect(first).toBe(second);
    expect(first?.isSupported()).toBe(true);
    expect(createElement).not.toHaveBeenCalledWith('script');
  });
});
