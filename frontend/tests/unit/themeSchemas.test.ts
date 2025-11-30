import test from 'node:test';
import assert from 'node:assert/strict';
import { themeInfoSchema, cssVariablesSchema } from '../../src/validation/themeSchemas';

test('themeInfoSchema accepts valid payloads', () => {
  const parsed = themeInfoSchema.parse({
    theme_name: 'My Theme',
    theme_description: 'Looks great',
  });
  assert.equal(parsed.theme_name, 'My Theme');
});

test('themeInfoSchema rejects empty name', () => {
  assert.throws(() => {
    themeInfoSchema.parse({ theme_name: '  ', theme_description: '' });
  }, /Theme name is required/);
});

test('cssVariablesSchema enforces max variables and values', () => {
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
