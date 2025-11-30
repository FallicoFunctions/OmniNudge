import { describe, expect, it } from 'vitest';
import { themeInfoSchema, cssVariablesSchema } from '../../src/validation/themeSchemas';

describe('themeInfoSchema', () => {
  it('accepts valid data', () => {
    const parsed = themeInfoSchema.parse({
      theme_name: 'My Theme',
      theme_description: 'Looks great',
    });
    expect(parsed.theme_name).toBe('My Theme');
  });

  it('rejects empty names', () => {
    expect(() => {
      themeInfoSchema.parse({ theme_name: '   ', theme_description: '' });
    }).toThrow(/Theme name is required/);
  });
});

describe('cssVariablesSchema', () => {
  it('enforces limits and non-empty values', () => {
    const parsed = cssVariablesSchema.parse({
      '--color-primary': '#ffffff',
      '--color-background': '#000000',
    });
    expect(Object.keys(parsed)).toHaveLength(2);

    const tooMany: Record<string, string> = {};
    for (let i = 0; i < 201; i += 1) {
      tooMany[`--var-${i}`] = '#000';
    }
    expect(() => cssVariablesSchema.parse(tooMany)).toThrow(/200 CSS variables/);
    expect(() => cssVariablesSchema.parse({ '--color-primary': '' })).toThrow(/Value is required/);
  });
});
