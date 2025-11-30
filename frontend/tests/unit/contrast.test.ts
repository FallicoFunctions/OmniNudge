import test from 'node:test';
import assert from 'node:assert/strict';
import { getContrastRatio } from '../../src/utils/contrast';

test('contrast ratio matches expected values', () => {
  const ratio = getContrastRatio('#000000', '#ffffff');
  assert(ratio);
  assert.equal(Number(ratio?.toFixed(2)), 21);
});

test('contrast ratio handles identical colors', () => {
  const ratio = getContrastRatio('#ffffff', '#ffffff');
  assert.equal(ratio, 1);
});
