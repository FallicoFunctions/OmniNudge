import { vi } from 'vitest';

// Runtime-focused tests use a minimal scene fixture. Show rendering has its
// own tests with a real Babylon scene, so keep the fixture at this boundary.
export function mockShowControlRuntime() {
  vi.doMock('../../showControl/createShowControlRuntime', () => ({
    createShowControlRuntime: () => ({
      applySnapshot: vi.fn(),
      update: vi.fn(),
      unlockAudio: vi.fn(),
      setEventState: vi.fn(),
      dispose: vi.fn(),
      operating: false,
      fireworkQuads: 0,
    }),
  }));
}
