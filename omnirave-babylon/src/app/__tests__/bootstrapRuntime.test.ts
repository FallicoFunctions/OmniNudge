import { describe, expect, it } from 'vitest';
import { bootstrapRuntime } from '../bootstrapRuntime';

describe('bootstrapRuntime', () => {
  it('creates the Babylon host element exactly once', () => {
    document.body.innerHTML = '<div id="app"></div>';

    bootstrapRuntime();
    bootstrapRuntime();

    const hosts = document.querySelectorAll('[data-testid="babylon-runtime-host"]');
    expect(hosts).toHaveLength(1);
  });
});
