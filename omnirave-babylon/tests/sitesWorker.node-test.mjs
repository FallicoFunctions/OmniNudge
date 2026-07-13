import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('generated Sites worker serves assets and falls back to index routes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'omnirave-sites-worker-'));
  const script = new URL('../scripts/write-sites-worker.mjs', import.meta.url);

  try {
    await execFileAsync(process.execPath, [script.pathname], { cwd });
    const workerPath = join(cwd, 'dist/server/index.js');
    const workerSource = await readFile(workerPath, 'utf8');

    assert.match(workerSource, /ASSETS\.fetch/);

    const { default: worker } = await import(`${pathToFileURL(workerPath).href}?test=${Date.now()}`);
    const requests = [];
    const env = {
      ASSETS: {
        async fetch(request) {
          requests.push(new URL(request.url).pathname);
          if (new URL(request.url).pathname === '/index.html') {
            return new Response('<main>OmniRave</main>', {
              headers: { 'content-type': 'text/html' },
            });
          }

          return new Response('missing', { status: 404 });
        },
      },
    };

    const routeResponse = await worker.fetch(new Request('https://example.com/crowd-pit'), env);
    assert.equal(routeResponse.status, 200);
    assert.equal(await routeResponse.text(), '<main>OmniRave</main>');
    assert.deepEqual(requests, ['/crowd-pit', '/index.html']);

    const assetResponse = await worker.fetch(new Request('https://example.com/assets/missing.js'), env);
    assert.equal(assetResponse.status, 404);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
