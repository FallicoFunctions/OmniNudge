'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { assertCleanAudit, prepare, validateFiles, gitEnvironment, repairBranch } = require('./npm-audit-repair.cjs');
const { trustedMaintenancePullRequest, trustedMaintenanceChanges, compatibleManifest } = require('./dependabot-policy.cjs');

const repository = 'FallicoFunctions/OmniNudge';
const actions = { login: 'github-actions[bot]', id: 41898282, type: 'Bot' };
const publisher = { login: 'dependency-ci[bot]', id: 123456789, type: 'Bot' };
const clean = () => ({ status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} }) });
const vulnerable = () => ({ status: 1, stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: { 'source-map-js': {} } }) });
const lock = version => ({ name: 'test', lockfileVersion: 3, packages: {
  '': { name: 'test', dependencies: { postcss: '^8.5.6' } },
  'node_modules/postcss': { version: '8.5.6', dependencies: { 'source-map-js': '^1.2.1' } },
  'node_modules/source-map-js': { version },
  'node_modules/@rollup/rollup-linux-x64-gnu': { version: '4.48.0', libc: ['glibc'], cpu: ['x64'], os: ['linux'], optional: true },
} });
function fixture(body) {
  const root = mkdtempSync(join(tmpdir(), 'audit-repair-test-'));
  const git = (...args) => childProcess.execFileSync('git', args, { cwd: root, env: gitEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const before = {};
  try {
    git('init', '-q');
    for (const directory of ['frontend', 'omnirave-babylon']) {
      mkdirSync(join(root, directory));
      before[`${directory}/package.json`] = JSON.stringify({ name: 'test', dependencies: { postcss: '^8.5.6' } });
      before[`${directory}/package-lock.json`] = JSON.stringify(lock('1.2.1'));
    }
    before['application.js'] = 'original';
    for (const [path, contents] of Object.entries(before)) writeFileSync(join(root, path), contents);
    git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture');
    body({ root, before, git, base: git('rev-parse', 'HEAD').trim() });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('actual lockfile graph permits an indirect security patch without changing direct dependencies', () => {
  assert.equal(compatibleManifest('frontend/package-lock.json', JSON.stringify(lock('1.2.1')), JSON.stringify(lock('1.2.2'))), true);
  const major = lock('1.2.2'); major.packages['node_modules/postcss'].version = '9.0.0';
  assert.equal(compatibleManifest('frontend/package-lock.json', JSON.stringify(lock('1.2.1')), JSON.stringify(major)), false);
});

test('fixture Git commands and repair validation ignore the enclosing hook environment', () => {
  const names = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'];
  const previous = names.map(name => process.env[name]);
  try {
    for (const name of names) process.env[name] = '/nonexistent-parent-hook-path';
    fixture(({ root, before, git }) => {
      assert.equal(git('rev-parse', '--show-toplevel').trim(), realpathSync(root));
      assert.deepEqual(validateFiles(root, before), []);
    });
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index];
    });
  }
});

test('repair runs both full audits, never lifecycle scripts or forced upgrades, and validates the produced files', () => {
  fixture(({ root }) => {
    const calls = [];
    const changed = prepare(root, (command, args, options) => {
      calls.push({ command, args, options });
      assert.equal(command, 'npm');
      assert.ok(args.includes('--ignore-scripts'));
      assert.ok(args.includes('--package-lock-only'));
      assert.ok(!args.includes('--force'));
      const path = join(options.cwd, 'package-lock.json');
      if (args[1] === 'fix') writeFileSync(path, JSON.stringify(lock('1.2.2')));
      if (JSON.parse(readFileSync(path, 'utf8')).packages['node_modules/source-map-js'].version === '1.2.1') return vulnerable();
      return clean();
    });
    assert.deepEqual(changed.sort(), ['frontend/package-lock.json', 'omnirave-babylon/package-lock.json']);
    assert.equal(calls.filter(call => call.args.includes('--all')).length, 4);
    assert.equal(calls.filter(call => call.args[1] === 'fix').length, 2);
  });
});

test('clean audits never run audit fix or rewrite platform metadata', () => {
  fixture(({ root, before }) => {
    const calls = [];
    assert.deepEqual(prepare(root, (_command, args) => {
      calls.push(args);
      assert.notEqual(args[1], 'fix', 'a clean graph must never be rewritten');
      return clean();
    }), []);
    assert.equal(calls.length, 2);
    for (const directory of ['frontend', 'omnirave-babylon']) {
      const path = `${directory}/package-lock.json`;
      assert.equal(readFileSync(join(root, path), 'utf8'), before[path]);
    }
  });
});

test('prepare CLI requests App credentials only when it actually produces changes', () => {
  fixture(({ root }) => {
    const scripts = join(root, '.github/scripts'), binary = join(root, 'bin');
    mkdirSync(scripts, { recursive: true }); mkdirSync(binary);
    for (const file of ['npm-audit-repair.cjs', 'dependabot-policy.cjs']) {
      writeFileSync(join(scripts, file), readFileSync(join(__dirname, file)));
    }
    writeFileSync(join(binary, 'npm'), `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(clean().stdout)});\n`, { mode: 0o755 });
    const output = join(root, 'step-output');
    for (const verification of ['false', 'true']) {
      writeFileSync(output, '');
      childProcess.execFileSync(process.execPath, [join(scripts, 'npm-audit-repair.cjs'), 'prepare'], {
        env: { ...process.env, PATH: `${binary}:${process.env.PATH}`, GITHUB_OUTPUT: output, AUDIT_REPAIR_VERIFY: verification },
        stdio: 'pipe',
      });
      assert.equal(readFileSync(output, 'utf8'), `changed=${verification}\n`);
    }
  });
});

test('audit service errors, malformed reports and unresolved findings fail closed', () => {
  assertCleanAudit(clean(), 'fixture');
  for (const bad of [{ status: 0, stdout: '{}' }, { status: 0, stdout: 'invalid' },
    { status: 0, stdout: '{"metadata":{"vulnerabilities":{"total":0}}}' },
    { ...clean(), status: 1 }, { ...clean(), signal: 'SIGTERM' },
    { status: 1, stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: { 'source-map-js': {} } }) }]) {
    assert.throws(() => assertCleanAudit(bad, 'fixture'), /fixture:/);
  }
});

test('explicit publication verification changes only whitespace and routine audits preserve it', () => {
  fixture(({ root, before }) => {
    const changed = prepare(root, clean, true);
    assert.deepEqual(changed, ['frontend/package-lock.json']);
    const text = readFileSync(join(root, changed[0]), 'utf8');
    assert.notEqual(text, before[changed[0]]);
    assert.deepEqual(JSON.parse(text), JSON.parse(before[changed[0]]));
    // A subsequent ordinary audit must not normalize it back into another PR.
    const noop = prepare(root, (_command, args, options) => {
      if (args[1] === 'fix') {
        const path = join(options.cwd, 'package-lock.json');
        writeFileSync(path, JSON.stringify(JSON.parse(readFileSync(path, 'utf8')), null, 2) + '\n');
      }
      return clean();
    });
    assert.equal(readFileSync(join(root, changed[0]), 'utf8'), text);
    assert.deepEqual(noop, changed, 'the only difference from fixture HEAD is the original verification edit');
  });
});

test('produced source edits, manifest changes and direct major bumps are rejected', () => {
  fixture(({ root, before }) => {
    writeFileSync(join(root, 'application.js'), 'changed');
    assert.throws(() => validateFiles(root, before), /outside the lockfile allowlist/);
    writeFileSync(join(root, 'application.js'), before['application.js']);
    const major = lock('1.2.2'); major.packages['node_modules/postcss'].version = '9.0.0';
    writeFileSync(join(root, 'frontend/package-lock.json'), JSON.stringify(major));
    assert.throws(() => validateFiles(root, before), /incompatible change/);
    writeFileSync(join(root, 'frontend/package-lock.json'), before['frontend/package-lock.json']);
    writeFileSync(join(root, 'frontend/package.json'), JSON.stringify({ scripts: { install: 'untrusted' } }));
    assert.throws(() => validateFiles(root, before), /outside the lockfile allowlist/);
  });
});

test('maintenance trust requires the configured App author, signed Actions commits and only the two lockfiles', () => {
  const pr = { state: 'open', draft: false, user: publisher, changed_files: 1, commits: 1,
    head: { sha: 'head', ref: 'dependency-maintenance/npm-audit-012345abcdef', repo: { full_name: repository } },
    base: { ref: 'main', repo: { full_name: repository } } };
  const commit = { sha: 'head', author: actions, commit: { verification: { verified: true } } };
  const file = { filename: 'frontend/package-lock.json', status: 'modified' };
  assert.equal(trustedMaintenancePullRequest(pr, repository, publisher), true);
  assert.equal(trustedMaintenancePullRequest(pr, repository), false, 'missing App configuration must fail closed');
  assert.equal(trustedMaintenanceChanges(pr, [file], [commit]), true);
  for (const change of [{ user: actions }, { user: { ...publisher, id: 1 } }, { user: { ...publisher, type: 'User' } }, { state: 'closed' },
    { head: { ...pr.head, repo: { full_name: 'attacker/fork' } } }, { head: { ...pr.head, ref: 'other' } }, { draft: true }]) {
    assert.equal(trustedMaintenancePullRequest({ ...pr, ...change }, repository, publisher), false);
  }
  for (const filename of ['frontend/package.json', '.github/workflows/ci.yml', 'infra/avatar-worker/requirements.txt']) {
    assert.equal(trustedMaintenanceChanges(pr, [{ ...file, filename }], [commit]), false);
  }
  assert.equal(trustedMaintenanceChanges(pr, [{ ...file, status: 'renamed' }], [commit]), false);
  assert.equal(trustedMaintenanceChanges(pr, [file], [{ ...commit, author: { ...actions, id: 1 } }]), false);
  assert.equal(trustedMaintenanceChanges(pr, [file], [{ ...commit, commit: { verification: { verified: false } } }]), false);
  assert.equal(trustedMaintenanceChanges({ ...pr, changed_files: 2 }, [file], [commit]), false);
});

test('changed repair contents get distinct immutable branches while retries keep the same branch', () => {
  const files = [['frontend/package-lock.json', JSON.stringify(lock('1.2.2'))]];
  const first = repairBranch('012345abcdef012345abcdef', false, files);
  assert.match(first, /^dependency-maintenance\/npm-audit-012345abcdef-[a-f0-9]{12}$/);
  assert.equal(repairBranch('012345abcdef012345abcdef', false, files), first);
  assert.notEqual(repairBranch('012345abcdef012345abcdef', false,
    [['frontend/package-lock.json', JSON.stringify(lock('1.2.3'))]]), first);
});

test('publisher signs with Actions and uses the App token only to create a PR with native CI', () => {
  fixture(({ root, before, base }) => {
    writeFileSync(join(root, 'frontend/package-lock.json'), JSON.stringify(lock('1.2.2')));
    const original = childProcess.execFileSync;
    const branch = repairBranch(base, false, [['frontend/package-lock.json', readFileSync(join(root, 'frontend/package-lock.json'), 'utf8')]]);
    const values = { DEPENDENCY_PR_APP_SLUG: 'dependency-ci', DEPENDENCY_PR_APP_ACTUAL_SLUG: 'dependency-ci', PR_CREATION_TOKEN: 'fixture-app-token' };
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
    const calls = [];
    Object.assign(process.env, values);
    childProcess.execFileSync = (command, args, options) => {
      if (command !== 'gh') return original(command, args, options);
      calls.push(args);
      assert.equal(args[0], 'api');
      if (args[1] === 'graphql') {
        const input = JSON.parse(options.input).variables.input;
        assert.equal(input.expectedHeadOid, base);
        assert.equal(input.branch.branchName, branch);
        assert.deepEqual(input.fileChanges.additions.map(file => file.path), ['frontend/package-lock.json']);
        return JSON.stringify({ data: { createCommitOnBranch: { commit: { oid: 'signed-head' } } } });
      }
      const path = args.find(arg => arg.startsWith('repos/') || arg.startsWith('users/'));
      if (path.startsWith('users/')) return JSON.stringify(publisher);
      if (path.endsWith('/pulls')) {
        assert.ok(args.includes('POST'));
        assert.equal(options.env.GH_TOKEN, 'fixture-app-token');
        const request = JSON.parse(options.input);
        assert.equal(request.head, branch);
        assert.equal(request.base, 'main');
        assert.ok(request.body.includes('All normal CI'));
        return JSON.stringify({ number: 1, state: 'open', draft: false, user: publisher,
          head: { sha: 'signed-head', ref: branch, repo: { full_name: repository } },
          base: { ref: 'main', repo: { full_name: repository } } });
      }
      assert.equal(options.env, undefined, 'the App must not create branches or write contents');
      if (path.endsWith('/git/ref/heads/main')) return JSON.stringify({ object: { sha: base } });
      if (path.includes('/pulls?')) return '[[]]';
      if (path.includes('/git/matching-refs/')) return '[]';
      if (path.endsWith('/git/refs')) return '{}';
      if (path.includes('/contents/')) {
        const file = path.split('/contents/')[1].split('?')[0];
        return JSON.stringify({ type: 'file', encoding: 'base64', content: Buffer.from(before[file]).toString('base64') });
      }
      throw new Error(`Unexpected API call ${path}`);
    };
    try {
      delete require.cache[require.resolve('./npm-audit-repair.cjs')];
      const { publish } = require('./npm-audit-repair.cjs');
      delete process.env.PR_CREATION_TOKEN;
      assert.throws(() => publish(root, repository), /Configure the dependency PR GitHub App/);
      process.env.PR_CREATION_TOKEN = values.PR_CREATION_TOKEN;
      process.env.DEPENDENCY_PR_APP_ACTUAL_SLUG = 'wrong-app';
      assert.throws(() => publish(root, repository), /Configure the dependency PR GitHub App/);
      assert.ok(!calls.some(args => args.includes('POST')), 'missing or mismatched credentials must not mutate GitHub');
      process.env.DEPENDENCY_PR_APP_ACTUAL_SLUG = values.DEPENDENCY_PR_APP_ACTUAL_SLUG;
      publish(root, repository);
      assert.ok(!calls.some(args => args[0] === 'workflow'), 'PR creation must trigger native CI; dispatch cannot satisfy its approval gate');
      assert.ok(!calls.some(args => args.includes('merge') || args.includes('--force')));
    } finally {
      childProcess.execFileSync = original;
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      delete require.cache[require.resolve('./npm-audit-repair.cjs')];
    }
  });
});

test('mutation control: removing the maintenance path guard is caught by a real denial assertion', () => {
  const directory = mkdtempSync(join(tmpdir(), 'maintenance-mutation-'));
  try {
    const original = readFileSync(join(__dirname, 'dependabot-policy.cjs'), 'utf8');
    const mutated = original.replace('MAINTENANCE_FILES.has(file.filename)', 'true');
    assert.notEqual(original, mutated);
    const policy = join(directory, 'policy.cjs'); writeFileSync(policy, mutated);
    const probe = `const assert = require('node:assert/strict'); const { trustedMaintenanceChanges } = require(${JSON.stringify(policy)});
      assert.equal(trustedMaintenanceChanges({changed_files:1,commits:1,head:{sha:'head'}},
        [{filename:'frontend/src/application.ts',status:'modified'}],
        [{sha:'head',author:{login:'github-actions[bot]',id:41898282},commit:{verification:{verified:true}}}]), false, 'source edits must be denied');`;
    const result = childProcess.spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AssertionError.*source edits must be denied/s);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
