import { describe, expect, it } from 'vitest';
import { getSafeInternalPath } from '../navigation';

describe('getSafeInternalPath', () => {
  it('preserves an app-relative path and its query/hash', () => {
    expect(getSafeInternalPath('/posts/create?hub=music#media')).toBe(
      '/posts/create?hub=music#media'
    );
  });

  it.each(['https://attacker.example', '//attacker.example', '/\\attacker.example', 'settings'])(
    'rejects a non-local redirect target: %s',
    (target) => {
      expect(getSafeInternalPath(target)).toBe('/');
    }
  );
});
