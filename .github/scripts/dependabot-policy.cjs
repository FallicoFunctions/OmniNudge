'use strict';

const { isDeepStrictEqual } = require('node:util');

// These jobs run for every PR. Locale Guardrails is conditional and is checked
// when present; frontend CI also verifies locales for every PR.
const REQUIRED_CHECKS = [
  'Prevention guard controls', 'OmniRave Babylon (TypeScript)',
  'Backend (Go)', 'Frontend (TypeScript)', 'E2E Tests (Playwright)',
  'Migration rollback safety', 'Lighthouse CI', 'govulncheck', 'gosec',
  'gitleaks', 'staticcheck and deadcode', 'frontend dependency audit',
  'Worker dependencies (image)', 'Worker dependencies (video)',
  'Worker dependencies (avatar)',
];

const FILES = new Set([
  'frontend/package.json', 'frontend/package-lock.json',
  'omnirave-babylon/package.json', 'omnirave-babylon/package-lock.json',
  'backend/go.mod', 'backend/go.sum',
  'infra/runpod/image-worker/requirements.txt',
  'infra/runpod/video-worker/requirements.txt',
  'infra/avatar-worker/requirements.txt',
  'infra/runpod/image-worker/requirements.in',
  'infra/runpod/video-worker/requirements.in',
  'infra/avatar-worker/requirements.in',
]);

const MAINTENANCE_FILES = new Set(['frontend/package-lock.json', 'omnirave-babylon/package-lock.json']);

function trustedMaintenancePullRequest(pr, repository) {
  return pr.state === 'open' && !pr.draft && pr.user?.login === 'github-actions[bot]'
    && pr.user?.id === 41898282 && pr.user?.type === 'Bot'
    && pr.head?.repo?.full_name === repository && pr.base?.repo?.full_name === repository
    && pr.base?.ref === 'main' && /^dependency-maintenance\/npm-(?:audit|verify)-[a-f0-9]{12}$/.test(pr.head?.ref || '');
}

function trustedMaintenanceChanges(pr, files, commits) {
  return files.length > 0 && files.length === pr.changed_files
    && files.every(file => MAINTENANCE_FILES.has(file.filename) && file.status === 'modified')
    && commits.length > 0 && commits.length === pr.commits && commits.at(-1).sha === pr.head.sha
    && commits.every(commit => commit.author?.login === 'github-actions[bot]'
      && commit.author?.id === 41898282 && commit.commit?.verification?.verified === true);
}

function trustedPullRequest(pr, repository) {
  return pr.state === 'open' && !pr.draft && pr.user?.login === 'dependabot[bot]'
    && pr.user?.id === 49699333 && pr.user?.type === 'Bot'
    && pr.head?.repo?.full_name === repository && pr.base?.repo?.full_name === repository
    && pr.base?.ref === 'main' && pr.head?.ref?.startsWith('dependabot/');
}

function trustedChanges(pr, files, commits) {
  return files.length > 0 && files.length === pr.changed_files
    && files.every(file => FILES.has(file.filename) && file.status === 'modified')
    && commits.length > 0 && commits.length === pr.commits
    && commits.at(-1).sha === pr.head.sha
    && commits.every(commit => commit.author?.login === 'dependabot[bot]'
      && commit.author?.id === 49699333 && commit.commit?.verification?.verified === true);
}

function compatibleVersion(before, after) {
  // Fail closed on ranges we cannot classify, prereleases, downgrades and
  // majors. Go pseudo-versions share the module's major and numeric triplet.
  const parse = value => /^([~^v]?)(\d+(?:\.\d+){2,3})(?:-(\d{14}-[a-f0-9]+))?$/.exec(value);
  const oldVersion = parse(before), newVersion = parse(after);
  if (!oldVersion || !newVersion || oldVersion[1] !== newVersion[1]) return false;
  const oldNumbers = oldVersion[2].split('.').map(Number);
  const newNumbers = newVersion[2].split('.').map(Number);
  if (oldNumbers.length !== newNumbers.length) return false;
  if (oldNumbers[0] !== newNumbers[0]) return false;
  for (let i = 0; i < oldNumbers.length; i++) {
    if (newNumbers[i] !== oldNumbers[i]) return newNumbers[i] > oldNumbers[i];
  }
  return (newVersion[3] || '') >= (oldVersion[3] || '');
}

function compatibleMap(before, after, compare = compatibleVersion) {
  return isDeepStrictEqual(Object.keys(before).sort(), Object.keys(after).sort())
    && Object.keys(before).every(name => before[name] === after[name]
      || compare(before[name], after[name]));
}

function compatiblePythonVersion(before, after) {
  // PEP 440 post releases are stable releases too (e.g. python-dateutil).
  // Continue to reject prereleases, local builds, wildcards and downgrades.
  const parse = value => /^(\d+(?:\.\d+){1,3})(?:\.post(\d+))?$/.exec(value);
  const previous = parse(before), next = parse(after);
  if (!previous || !next) return false;
  const a = previous[1].split('.').map(Number), b = next[1].split('.').map(Number);
  if (a[0] !== b[0]) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) > (a[i] || 0);
  }
  return Number(next[2] ?? -1) >= Number(previous[2] ?? -1);
}

function compatibleManifest(filename, beforeText, afterText) {
  if (filename.endsWith('/package-lock.json')) {
    const before = JSON.parse(beforeText), after = JSON.parse(afterText);
    if (before.lockfileVersion !== after.lockfileVersion || !before.packages?.[''] || !after.packages?.['']) return false;
    if (!compatibleManifest('lock-root/package.json', JSON.stringify(before.packages['']), JSON.stringify(after.packages['']))) return false;
    const root = before.packages[''];
    const direct = new Set(['dependencies', 'devDependencies', 'optionalDependencies']
      .flatMap(group => Object.keys(root[group] || {})));
    return [...direct].every(name => {
      const oldPackage = before.packages[`node_modules/${name}`];
      const newPackage = after.packages[`node_modules/${name}`];
      return oldPackage && newPackage && (oldPackage.version === newPackage.version
        || compatibleVersion(oldPackage.version, newPackage.version));
    });
  }
  if (filename.endsWith('/package.json')) {
    const before = JSON.parse(beforeText), after = JSON.parse(afterText);
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides']) {
      if (!compatibleMap(before[group] || {}, after[group] || {})) return false;
      delete before[group]; delete after[group];
    }
    // In particular, do not auto-merge lifecycle scripts or engine changes.
    return isDeepStrictEqual(before, after);
  }
  if (/\/requirements\.(?:in|txt)$/.test(filename)) {
    const parse = text => {
      const pins = {}, directives = [];
      for (const line of text.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))) {
        if (line === '--extra-index-url https://download.pytorch.org/whl/cpu') {
          directives.push(line); continue;
        }
        const match = /^([A-Za-z0-9_.-]+)==([^\s;]+)$/.exec(line);
        const name = match?.[1].toLowerCase().replace(/[-_.]+/g, '-');
        if (!match || Object.hasOwn(pins, name)) throw new Error('Only unique pinned requirements can auto-merge');
        pins[name] = match[2];
      }
      return { pins, directives };
    };
    const before = parse(beforeText), after = parse(afterText);
    if (!isDeepStrictEqual(before.directives, after.directives) || !Object.keys(after.pins).length) return false;
    if (filename.endsWith('.in')) return compatibleMap(before.pins, after.pins, compatiblePythonVersion);
    // requirements.in protects direct versions. The resolver may change the
    // transitive lock graph; CI verifies every root against it and checks the
    // complete installed dependency graph, audits and both runtime builds.
    return after.directives.length === 0;
  }
  if (filename === 'backend/go.mod') {
    const parse = text => {
      const direct = {}, indirect = {}, directives = [];
      for (const line of text.split('\n')) {
        const clean = line.replace(/\s*\/\/.*$/, '').trim();
        const match = /^(?:require\s+)?([\w./-]+)\s+(v\d+\.\d+\.\d+(?:-\d{14}-[a-f0-9]+)?)$/.exec(clean);
        if (match) {
          if (Object.hasOwn(direct, match[1]) || Object.hasOwn(indirect, match[1])) return null;
          const deps = /\/\/\s*indirect\s*$/.test(line) ? indirect : direct;
          deps[match[1]] = match[2];
        } else if (clean) directives.push(clean);
      }
      return { direct, indirect, directives };
    };
    const before = parse(beforeText), after = parse(afterText);
    // A compatible direct update can add/remove transitive modules (for
    // example OpenTelemetry 1.47 adds otel/log). Like a lockfile, this graph is
    // checked by Go verification, vulnerability scanning and the full CI suite.
    // Retained indirect modules still cannot downgrade or change major version.
    return before !== null && after !== null
      && isDeepStrictEqual(before.directives, after.directives)
      && compatibleMap(before.direct, after.direct)
      && Object.entries(after.indirect).every(([name, version]) =>
        compatibleVersion(before.indirect[name] || version, version));
  }
  // Lockfiles can introduce/remove transitive dependencies. Their resolved
  // graphs are validated by npm ci, audit, Go verification and the test suites.
  return filename === 'backend/go.sum';
}

function checksPassed(checks) {
  return REQUIRED_CHECKS.every(name => checks.some(check => check.name === name
    && check.status === 'COMPLETED' && check.conclusion === 'SUCCESS'))
    && checks.every(check => check.status === 'COMPLETED'
      && ['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.conclusion));
}

module.exports = { DEPENDENCY_FILES: FILES, MAINTENANCE_FILES, REQUIRED_CHECKS, trustedPullRequest, trustedChanges,
  trustedMaintenancePullRequest, trustedMaintenanceChanges, compatibleVersion, compatibleManifest, checksPassed };
