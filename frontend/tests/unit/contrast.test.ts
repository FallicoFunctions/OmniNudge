import { describe, expect, it } from 'vitest';
import { getContrastRatio } from '../../src/utils/contrast';

describe('getContrastRatio', () => {
  it('returns correct ratio for black/white', () => {
    const ratio = getContrastRatio('#000000', '#ffffff');
    expect(ratio && Number(ratio.toFixed(2))).toBe(21);
  });

  it('handles identical colors', () => {
    expect(getContrastRatio('#ffffff', '#ffffff')).toBe(1);
  });
});
