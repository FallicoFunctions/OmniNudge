import { vi } from 'vitest';
import type { ShowControlRuntimeOptions } from '../../showControl/createShowControlRuntime';

// Runtime-focused tests use a minimal scene fixture. Show rendering has its
// own tests with a real Babylon scene, so keep the fixture at this boundary.
export function mockShowControlRuntime(onCreate?: (options: ShowControlRuntimeOptions) => void) {
  vi.doMock('../../showControl/createShowControlRuntime', () => ({
    createShowControlRuntime: (options: ShowControlRuntimeOptions) => {
      onCreate?.(options);
      return {
      applySnapshot: vi.fn(),
      update: vi.fn(),
      unlockAudio: vi.fn(),
      setEventState: vi.fn(),
      dispose: vi.fn(),
      operating: false,
      fireworkQuads: 0,
      };
    },
  }));
}
