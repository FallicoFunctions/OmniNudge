import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const scriptPath = path.resolve(process.cwd(), 'scripts/i18n-check.mjs');
const tempDirs: string[] = [];

function setupLocaleWorkspace(files: Record<string, string>) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-check-'));
  tempDirs.push(tmpDir);
  const localesDir = path.join(tmpDir, 'public', 'locales');
  fs.mkdirSync(localesDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(localesDir, name), content, 'utf8');
  }
  return tmpDir;
}

function runCheck(cwd: string) {
  try {
    const output = execFileSync('node', [scriptPath], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output };
  } catch (error) {
    const stdout = error instanceof Error && 'stdout' in error ? String((error as { stdout?: string }).stdout ?? '') : '';
    const stderr = error instanceof Error && 'stderr' in error ? String((error as { stderr?: string }).stderr ?? '') : '';
    return { status: 1, output: `${stdout}${stderr}` };
  }
}

describe('i18n-check script', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('passes valid locale parity', () => {
    const cwd = setupLocaleWorkspace({
      'en.json': JSON.stringify({ messages: { title: 'Hello {{name}}' } }),
      'es.json': JSON.stringify({ messages: { title: 'Hola {{name}}' } }),
      'ar.json': JSON.stringify({ messages: { title: 'مرحبا {{name}}' } }),
    });

    const result = runCheck(cwd);
    expect(result.status).toBe(0);
    expect(result.output).toContain('[i18n-check] OK');
  });

  it('fails when duplicate keys exist in the same object', () => {
    const cwd = setupLocaleWorkspace({
      'en.json': '{ "messages": { "title": "Hello", "title": "Hi" } }',
      'es.json': JSON.stringify({ messages: { title: 'Hola' } }),
      'ar.json': JSON.stringify({ messages: { title: 'مرحبا' } }),
    });

    const result = runCheck(cwd);
    expect(result.status).toBe(1);
    expect(result.output).toContain('duplicate key "title"');
  });

  it('fails when duplicate keys differ only by unicode escape form', () => {
    const cwd = setupLocaleWorkspace({
      'en.json': '{ "m\\u0065ssages": { "title": "Hello" }, "messages": { "title": "Hi" } }',
      'es.json': JSON.stringify({ messages: { title: 'Hola' } }),
      'ar.json': JSON.stringify({ messages: { title: 'مرحبا' } }),
    });

    const result = runCheck(cwd);
    expect(result.status).toBe(1);
    expect(result.output).toContain('duplicate key "messages"');
  });

  it('fails when locale root is not an object', () => {
    const cwd = setupLocaleWorkspace({
      'en.json': JSON.stringify(['not-an-object']),
      'es.json': JSON.stringify({ messages: { title: 'Hola' } }),
      'ar.json': JSON.stringify({ messages: { title: 'مرحبا' } }),
    });

    const result = runCheck(cwd);
    expect(result.status).toBe(1);
    expect(result.output).toContain('Locale root must be an object');
  });

  it('fails when interpolation tokens do not match fallback locale', () => {
    const cwd = setupLocaleWorkspace({
      'en.json': JSON.stringify({ messages: { title: 'Hello {{name}}' } }),
      'es.json': JSON.stringify({ messages: { title: 'Hola {{usuario}}' } }),
      'ar.json': JSON.stringify({ messages: { title: 'مرحبا {{name}}' } }),
    });

    const result = runCheck(cwd);
    expect(result.status).toBe(1);
    expect(result.output).toContain('interpolation mismatch');
  });

  it('fails when non-fallback locales have missing or extra keys', () => {
    const cwd = setupLocaleWorkspace({
      'en.json': JSON.stringify({
        messages: { title: 'Hello' },
        common: { cancel: 'Cancel' },
      }),
      'es.json': JSON.stringify({
        messages: { title: 'Hola' },
        common: { cancel: 'Cancelar' },
        extra: { unused: 'extra-value' },
      }),
      'ar.json': JSON.stringify({
        messages: { title: 'مرحبا' },
      }),
    });

    const result = runCheck(cwd);
    expect(result.status).toBe(1);
    expect(result.output).toContain('extra keys');
    expect(result.output).toContain('missing keys');
  });
});
