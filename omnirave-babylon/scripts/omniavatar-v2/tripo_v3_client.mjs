// Minimal Tripo v3 client for gated OmniAvatar post-processing.
// Reads TRIPO_API_KEY from backend/.env (never prints it, never writes it).
// Usage:
//   node tripo_v3_client.mjs balance
//   node tripo_v3_client.mjs submit-segment --input <task_id|file_token> [--v1]
//   node tripo_v3_client.mjs poll <task_id> [--max-minutes N]
//   node tripo_v3_client.mjs download <task_id> --out-model <path> --out-image <path>
//   node tripo_v3_client.mjs ledger --file <ledger.json>   (prints ledger, no key)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const BASE = 'https://openapi.tripo3d.ai/v3';

function loadKey() {
  if (process.env.TRIPO_API_KEY && process.env.TRIPO_API_KEY.trim()) {
    return process.env.TRIPO_API_KEY.trim();
  }
  for (const candidate of [resolve(repoRoot, 'backend', '.env'), resolve(repoRoot, '.env')]) {
    if (!existsSync(candidate)) continue;
    for (const line of readFileSync(candidate, 'utf8').split('\n')) {
      const match = line.match(/^\s*TRIPO_API_KEY\s*=\s*(.+?)\s*$/);
      if (match) return match[1].replace(/^["']|["']$/g, '');
    }
  }
  throw new Error('TRIPO_API_KEY is not configured (env or backend/.env)');
}

async function api(method, path, body) {
  const key = loadKey();
  const started = Date.now();
  const response = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await response.json().catch(() => ({}));
  return { http: response.status, ms: Date.now() - started, json };
}

function fail(message) {
  console.error(`TRIPO-ERROR: ${message}`);
  process.exit(1);
}

const [, , command, ...rest] = process.argv;
const flag = (name) => {
  const index = rest.indexOf(name);
  return index === -1 ? null : (rest[index + 1] ?? null);
};

if (command === 'balance') {
  const { http, json } = await api('GET', '/account/balance');
  if (http !== 200 || json.code !== 0) fail(`balance query failed (http ${http}): ${JSON.stringify(json).slice(0, 300)}`);
  console.log(JSON.stringify({ balance: json.data.balance, frozen: json.data.frozen }));
} else if (command === 'submit-segment') {
  const input = flag('--input');
  if (!input) fail('--input <task_id|file_token> is required');
  const useV1 = rest.includes('--v1');
  const body = useV1
    ? { input }
    : { model: 'v2.0-20260430', input, segmentation_granularity: 'balanced', split_by_connectivity: true };
  const started = Date.now();
  const { http, json } = await api('POST', '/mesh/segment', body);
  if (http !== 200 || json.code !== 0) {
    fail(`segment submit failed (http ${http}): ${JSON.stringify(json).slice(0, 500)}`);
  }
  console.log(JSON.stringify({
    task_id: json.data.task_id,
    model: useV1 ? 'v1.0-20250506' : 'v2.0-20260430',
    submit_ms: Date.now() - started,
  }));
} else if (command === 'poll') {
  const taskId = rest[0];
  if (!taskId) fail('poll <task_id> is required');
  const maxMinutes = Number(flag('--max-minutes') ?? 9);
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  let last = null;
  while (Date.now() < deadline) {
    const { http, json } = await api('GET', `/tasks/${encodeURIComponent(taskId)}`);
    if (http !== 200 || json.code !== 0) fail(`task query failed (http ${http}): ${JSON.stringify(json).slice(0, 300)}`);
    last = json.data;
    console.log(JSON.stringify({ status: last.status, progress: last.progress }));
    if (['success', 'failed', 'cancelled'].includes(last.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  if (last) {
    console.log('FINAL:' + JSON.stringify({
      task_id: last.task_id,
      type: last.type,
      status: last.status,
      progress: last.progress,
      output: last.output ?? null,
      credits_consumed: last.credits_consumed ?? null,
      created_at: last.created_at ?? null,
      completed_at: last.completed_at ?? null,
      error_code: last.error_code ?? null,
      error_message: (last.error_message ?? '').slice(0, 300),
    }));
  }
} else if (command === 'download') {
  const taskId = rest[0];
  const outModel = flag('--out-model');
  const outImage = flag('--out-image');
  if (!taskId || !outModel) fail('download <task_id> --out-model <path> [--out-image <path>] is required');
  const { http, json } = await api('GET', `/tasks/${encodeURIComponent(taskId)}`);
  if (http !== 200 || json.code !== 0 || json.data.status !== 'success') {
    fail(`task is not successful: ${JSON.stringify(json).slice(0, 300)}`);
  }
  const key = loadKey();
  const fetchToFile = async (url, path) => {
    mkdirSync(dirname(path), { recursive: true });
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) fail(`download failed (http ${response.status}) for ${path}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(path, buffer);
    return buffer.length;
  };
  const modelUrl = json.data.output?.model_url;
  if (!modelUrl) fail('successful task has no model_url');
  const modelBytes = await fetchToFile(modelUrl, resolve(repoRoot, outModel));
  let imageBytes = null;
  if (outImage && json.data.output?.rendered_image_url) {
    imageBytes = await fetchToFile(json.data.output.rendered_image_url, resolve(repoRoot, outImage));
  }
  console.log(JSON.stringify({ model_bytes: modelBytes, image_bytes: imageBytes }));
} else if (command === 'ledger') {
  const file = flag('--file');
  if (!file || !existsSync(resolve(repoRoot, file))) fail('ledger --file <existing ledger.json> is required');
  console.log(readFileSync(resolve(repoRoot, file), 'utf8'));
} else {
  fail(`unknown command: ${command}`);
}
