import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const sourcePath = path.join(repoRoot, 'shared/providers/platform-external-media.json');
const targetPaths = [
  path.join(repoRoot, 'frontend/src/generated/platformExternalProviders.json'),
  path.join(repoRoot, 'backend/internal/services/externalproviders/platform_external_media.generated.json'),
];

const statuses = new Set(['supported_embed', 'supported_preview_only', 'recognized_but_disabled']);
const fallbackBehaviors = new Set(['none', 'treat_as_plain_link', 'render_no_media', 'provider_preview_only']);
const renderKinds = new Set(['iframe', 'direct_video', 'direct_image', 'link_preview_only']);
const pathMatchTypes = new Set(['exact', 'prefix', 'segment_template']);

const requiredSupported = [
  'youtube',
  'vimeo',
  'tiktok',
  'twitch',
  'dailymotion',
  'streamable',
  'redgifs',
  'gfycat',
  'giphy',
  'tenor',
  'imgur_gifv',
];

const requiredDisabled = [
  'instagram_post',
  'instagram_reel',
  'facebook_video',
  'x_twitter_status',
  'loom',
  'wistia',
  'spotify',
  'soundcloud',
  'apple_music',
  'mixcloud',
  'bandcamp',
  'pornhub',
];

function fail(message) {
  throw new Error(message);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function assertOptionalStringOrNull(value, label) {
  if (value === null || value === undefined) {
    return;
  }
  assertString(value, label);
}

function assertStringArray(value, label) {
  assertArray(value, label);
  for (const item of value) {
    assertString(item, `${label}[]`);
  }
}

function normalizeHost(hostname) {
  let normalized = hostname.toLowerCase().trim().replace(/\.$/, '');
  if (normalized.startsWith('www.')) {
    normalized = normalized.slice(4);
  }
  return normalized;
}

function normalizePathname(pathname) {
  const decoded = (() => {
    try {
      return decodeURI(pathname);
    } catch {
      return pathname;
    }
  })();

  const collapsed = decoded.replace(/\/{2,}/g, '/');
  if (collapsed === '' || collapsed === '/') {
    return '/';
  }
  return collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
}

function validateSegmentTemplate(pattern, label) {
  if (!pattern.startsWith('/')) {
    fail(`${label} must start with /`);
  }
  const segments = normalizePathname(pattern).split('/').filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    if (segment === '**' && index !== segments.length - 1) {
      fail(`${label} may only use ** as the final segment`);
    }
    if (segment === '*' || segment === '**') {
      continue;
    }
    if (segment.includes('*')) {
      fail(`${label} may only use * or ** as whole segments`);
    }
  }
}

function validateQueryRequirements(queryRequirements, label) {
  if (queryRequirements === undefined) {
    return;
  }
  if (!queryRequirements || typeof queryRequirements !== 'object' || Array.isArray(queryRequirements)) {
    fail(`${label} must be an object`);
  }
  for (const [key, requirement] of Object.entries(queryRequirements)) {
    assertString(key, `${label} key`);
    assertString(requirement, `${label}.${key}`);
    if (requirement !== 'present' && !requirement.startsWith('exact:')) {
      fail(`${label}.${key} must be present or exact:<value>`);
    }
  }
}

function validateRule(rule, label) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    fail(`${label} must be an object`);
  }

  const allowedKeys = new Set([
    'hosts',
    'allow_subdomains',
    'path_match_type',
    'path_patterns',
    'query_requirements',
    'aliases',
  ]);

  for (const key of Object.keys(rule)) {
    if (!allowedKeys.has(key)) {
      fail(`${label}.${key} is not allowed`);
    }
  }

  assertStringArray(rule.hosts, `${label}.hosts`);
  if (rule.hosts.length === 0) {
    fail(`${label}.hosts must not be empty`);
  }
  if (typeof rule.allow_subdomains !== 'boolean') {
    fail(`${label}.allow_subdomains must be a boolean`);
  }
  if (!pathMatchTypes.has(rule.path_match_type)) {
    fail(`${label}.path_match_type is invalid`);
  }
  assertStringArray(rule.path_patterns, `${label}.path_patterns`);
  if (rule.path_patterns.length === 0) {
    fail(`${label}.path_patterns must not be empty`);
  }
  if (rule.aliases !== undefined) {
    assertStringArray(rule.aliases, `${label}.aliases`);
  }
  validateQueryRequirements(rule.query_requirements, `${label}.query_requirements`);

  for (const host of rule.hosts) {
    const normalized = host.toLowerCase().trim().replace(/\.$/, '');
    if (normalized !== host) {
      fail(`${label}.hosts must be lowercase without trailing dots`);
    }
  }

  for (const alias of rule.aliases ?? []) {
    const normalized = alias.toLowerCase().trim().replace(/\.$/, '');
    if (normalized !== alias) {
      fail(`${label}.aliases must be lowercase without trailing dots`);
    }
  }

  for (const [index, pattern] of rule.path_patterns.entries()) {
    const patternLabel = `${label}.path_patterns[${index}]`;
    assertString(pattern, patternLabel);
    if (!pattern.startsWith('/')) {
      fail(`${patternLabel} must start with /`);
    }
    if (rule.path_match_type === 'segment_template') {
      validateSegmentTemplate(pattern, patternLabel);
      continue;
    }
    if (pattern.includes('*')) {
      fail(`${patternLabel} cannot use wildcard segments for ${rule.path_match_type}`);
    }
    if (normalizePathname(pattern) !== pattern && pattern !== '/') {
      fail(`${patternLabel} must use normalized slash form`);
    }
  }
}

function validateProvider(provider, index) {
  const label = `providers[${index}]`;
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    fail(`${label} must be an object`);
  }

  assertString(provider.id, `${label}.id`);
  assertString(provider.family, `${label}.family`);
  if (!statuses.has(provider.status)) {
    fail(`${label}.status is invalid`);
  }
  if (!fallbackBehaviors.has(provider.fallback_behavior)) {
    fail(`${label}.fallback_behavior is invalid`);
  }
  if (!Number.isInteger(provider.priority)) {
    fail(`${label}.priority must be an integer`);
  }
  if (!renderKinds.has(provider.render_kind)) {
    fail(`${label}.render_kind is invalid`);
  }
  if (typeof provider.allow_title_outbound_link !== 'boolean') {
    fail(`${label}.allow_title_outbound_link must be a boolean`);
  }
  assertOptionalStringOrNull(provider.embed_builder_key, `${label}.embed_builder_key`);
  assertArray(provider.match_rules, `${label}.match_rules`);
  if (provider.match_rules.length === 0) {
    fail(`${label}.match_rules must not be empty`);
  }
  provider.match_rules.forEach((rule, ruleIndex) => validateRule(rule, `${label}.match_rules[${ruleIndex}]`));

  if (provider.status === 'supported_embed') {
    if (provider.fallback_behavior !== 'none') {
      fail(`${label} must use fallback_behavior none`);
    }
    if (!['iframe', 'direct_video', 'direct_image'].includes(provider.render_kind)) {
      fail(`${label} has invalid render_kind for supported_embed`);
    }
    if (!provider.embed_builder_key) {
      fail(`${label} must provide embed_builder_key`);
    }
  }

  if (provider.status === 'supported_preview_only') {
    if (provider.fallback_behavior !== 'none') {
      fail(`${label} must use fallback_behavior none`);
    }
    if (provider.render_kind !== 'link_preview_only') {
      fail(`${label} must use render_kind link_preview_only`);
    }
    if (provider.embed_builder_key !== null && provider.embed_builder_key !== undefined) {
      fail(`${label} must not provide embed_builder_key`);
    }
  }

  if (provider.status === 'recognized_but_disabled') {
    if (provider.fallback_behavior === 'none') {
      fail(`${label} must declare a non-none fallback`);
    }
  }

  if (provider.render_kind === 'link_preview_only' && provider.status === 'supported_embed') {
    fail(`${label} cannot pair link_preview_only with supported_embed`);
  }

  if (provider.fallback_behavior === 'provider_preview_only') {
    fail(`${label} cannot use provider_preview_only in the day-one rollout`);
  }
}

function validateCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    fail('catalog must be an object');
  }
  if (catalog.schema_version !== 1) {
    fail('schema_version must be 1');
  }

  assertArray(catalog.providers, 'providers');
  const seenIds = new Set();
  for (const [index, provider] of catalog.providers.entries()) {
    validateProvider(provider, index);
    if (seenIds.has(provider.id)) {
      fail(`duplicate provider id: ${provider.id}`);
    }
    seenIds.add(provider.id);
  }

  for (const id of requiredSupported) {
    const provider = catalog.providers.find((entry) => entry.id === id);
    if (!provider) {
      fail(`missing required supported provider: ${id}`);
    }
    if (provider.status !== 'supported_embed') {
      fail(`provider ${id} must be supported_embed`);
    }
  }

  for (const id of requiredDisabled) {
    const provider = catalog.providers.find((entry) => entry.id === id);
    if (!provider) {
      fail(`missing required recognized-but-disabled provider: ${id}`);
    }
    if (provider.status !== 'recognized_but_disabled') {
      fail(`provider ${id} must be recognized_but_disabled`);
    }
  }
}

async function main() {
  const raw = await readFile(sourcePath, 'utf8');
  const catalog = JSON.parse(raw);
  validateCatalog(catalog);

  const output = `${JSON.stringify(catalog, null, 2)}\n`;
  for (const targetPath of targetPaths) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, output, 'utf8');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
