import test from 'node:test';
import assert from 'node:assert/strict';
import { themeInfoSchema, cssVariablesSchema } from '../../src/validation/themeSchemas';

test('themeInfoSchema accepts valid data', () => {
  const parsed = themeInfoSchema.parse({
    theme_name: 'My theme',
    theme_description: 'Looks great',
  });
  assert.equal(parsed.theme_name, 'My theme');
});

test('themeInfoSchema rejects blank names', () => {
  assert.throws(() => {
    themeInfoSchema.parse({ theme_name: '   ', theme_description: '' });
  }, /Theme name is required/);
});

test('cssVariablesSchema enforces max count and non-empty values', () => {
  const parsed = cssVariablesSchema.parse({
    '--color-primary': '#fff',
    '--color-background': '#000',
  });
  assert.equal(Object.keys(parsed).length, 2);

  const tooMany: Record<string, string> = {};
  for (let i = 0; i < 201; i += 1) {
    tooMany[`--var-${i}`] = '#000';
  }
  assert.throws(() => {
    cssVariablesSchema.parse(tooMany);
  }, /200 CSS variables/);

  assert.throws(() => {
    cssVariablesSchema.parse({ '--color-primary': '' });
  }, /Value is required/);
});
