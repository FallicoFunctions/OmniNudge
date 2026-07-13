import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const workerSource = `const INDEX_REQUEST = new Request('https://omnirave.local/index.html');

async function fetchAsset(request, env) {
  if (!env?.ASSETS?.fetch) {
    return new Response('Sites asset binding is unavailable', { status: 503 });
  }

  return env.ASSETS.fetch(request);
}

const worker = {
  async fetch(request, env) {
    const response = await fetchAsset(request, env);
    if (response.status !== 404) {
      return response;
    }

    const url = new URL(request.url);
    if (url.pathname.includes('.')) {
      return response;
    }

    return fetchAsset(INDEX_REQUEST, env);
  },
};

export default worker;
`;

const serverDir = join(process.cwd(), 'dist', 'server');
await mkdir(serverDir, { recursive: true });
await writeFile(join(serverDir, 'index.js'), workerSource);
