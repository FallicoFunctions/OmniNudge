'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
// CI installs this small parser independently; local hooks reuse the locked
// frontend dependency, without installing or executing any PR dependencies.
const { parse } = require(require.resolve('yaml', { paths: [process.env.POLICY_NODE_MODULES || resolve(__dirname, '../../frontend/node_modules')] }));
const { REQUIRED_CHECKS, DEPENDENCY_FILES } = require('./dependabot-policy.cjs');
const workflows = resolve(__dirname, '../workflows');
const read = name => parse(readFileSync(resolve(workflows, name), 'utf8'));

test('auto-merge waits for every unconditional CI, performance and security job', () => {
  const checks = ['ci.yml', 'security.yml', 'performance.yml'].flatMap(file => {
    const workflow = read(file);
    return Object.values(workflow.jobs).flatMap(job => {
      assert.equal(job.if, undefined, `${job.name} must run for every PR`);
      if (!job.strategy?.matrix) return [job.name];
      return job.strategy.matrix.include.map(entry => job.name.replace('${{ matrix.kind }}', entry.kind));
    });
  });
  assert.deepEqual([...REQUIRED_CHECKS].sort(), checks.sort());
});

test('privileged merger checks out only main and never installs or runs PR code', () => {
  const workflow = read('dependabot-automerge.yml');
  const steps = workflow.jobs.merge.steps;
  const checkout = steps.filter(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.length, 1);
  assert.equal(checkout[0].with.ref, 'main');
  assert.equal(checkout[0].with['persist-credentials'], false);
  assert.deepEqual(steps.filter(step => step.run).map(step => step.run), ['node .github/scripts/dependabot-automerge.cjs']);
  assert.equal(workflow.permissions.contents, 'write');
  assert.equal(workflow.permissions['pull-requests'], 'write');
  assert.equal(workflow.on.schedule.length, 1);
});


test('every active dependency manifest has Dependabot coverage and a merge policy', () => {
  const root = resolve(__dirname, '../..');
  const active = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(name => /(?:^|\/)(?:package(?:-lock)?\.json|go\.(?:mod|sum)|requirements\.txt)$/.test(name)
      && existsSync(resolve(root, name)));
  const files = { npm: ['package.json', 'package-lock.json'], gomod: ['go.mod', 'go.sum'], pip: ['requirements.txt'] };
  const configured = parse(readFileSync(resolve(root, '.github/dependabot.yml'), 'utf8')).updates
    .flatMap(update => (files[update['package-ecosystem']] || []).map(name =>
      `${update.directory.replace(/^\/|\/$/g, '')}/${name}`.replace(/^\//, '')));
  assert.deepEqual([...new Set(active)].sort(), configured.sort(), 'active manifests must have an update path; archive retired install inputs');
  assert.deepEqual([...DEPENDENCY_FILES].sort(), [...new Set(active)].sort(), 'merge policy must cover every active dependency file');
});

test('backend coverage uses the fail-closed aggregate checker', () => {
  const steps = read('ci.yml').jobs.backend.steps;
  assert.equal(steps.find(step => step.name === 'Check coverage threshold').run,
    'node ../.github/scripts/go-coverage.cjs coverage.out');
  assert.ok(steps.some(step => step.uses?.startsWith('actions/setup-node@')
    && step.with?.['node-version'] === '22'));
});

test('maintenance uses only main, has no token during resolution, and can dispatch every required workflow', () => {
  const workflow = read('dependency-maintenance.yml');
  const steps = workflow.jobs.repair.steps;
  const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with.ref, 'main');
  assert.equal(checkout.with['persist-credentials'], false);
  const commands = steps.filter(step => step.run);
  assert.deepEqual(commands.map(step => step.run), [
    'npm install --global npm@11.12.1 --ignore-scripts --no-audit --no-fund',
    'node .github/scripts/npm-audit-repair.cjs prepare', 'node .github/scripts/npm-audit-repair.cjs publish']);
  assert.equal(commands[0].env, undefined, 'registry commands must not receive the write token');
  assert.equal(commands[1].env, undefined, 'registry commands must not receive the write token');
  assert.deepEqual(commands[2].env, { GH_TOKEN: '${{ github.token }}' });
  assert.equal(workflow.permissions.actions, 'write');
  assert.ok(workflow.on.schedule.length);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['CI', 'Security Scan']);
  for (const name of require('./npm-audit-repair.cjs').WORKFLOWS) {
    assert.ok(Object.hasOwn(read(name).on, 'workflow_dispatch'), `${name} needs an explicit CI trigger for token-authored repairs`);
  }
});

test('workers cannot silently resolve new dependencies in CI or container builds', () => {
  const workers = read('ci.yml').jobs.workers;
  const install = workers.steps.find(step => step.name === 'Install pinned worker requirements');
  assert.ok(install.run.includes('pip install --no-deps -r'));
  assert.ok(workers.steps.some(step => step.run?.includes('test_worker_dependency_lock.py')));
  assert.ok(workers.steps.some(step => step.run?.includes('pip-audit" --strict --no-deps --disable-pip -r "${{ matrix.requirements }}"')));
  assert.equal(workers.steps.find(step => step.uses?.startsWith('actions/setup-python@')).with['python-version'], '3.12');
  for (const { requirements, torch, torchvision } of workers.strategy.matrix.include) {
    const docker = readFileSync(resolve(__dirname, '../..', requirements.replace('requirements.txt', 'Dockerfile')), 'utf8');
    assert.ok(docker.includes('python -m pip install --no-cache-dir --no-deps -r requirements.txt && python -m pip check'));
    assert.ok(docker.includes('python3 -m venv --without-pip --system-site-packages /opt/worker-venv'));
    const base = /^FROM pytorch\/pytorch:([\d.]+)-cuda([\d.]+)-cudnn9-runtime@sha256:[a-f0-9]{64}$/m.exec(docker);
    assert.ok(base, 'the GPU runtime must be an immutable image');
    assert.equal(base[1], torch, 'CPU CI and container Torch versions must match');
    const pins = readFileSync(resolve(__dirname, '../..', requirements), 'utf8').split('\n');
    assert.ok(pins.includes(`torch==${torch}`));
    assert.ok(pins.includes(`torchvision==${torchvision}`));
  }
  const container = workers.steps.find(step => step.name === 'Build and exercise the pinned CUDA container on CPU');
  assert.ok(container.run.includes('docker build'));
  assert.ok(container.run.includes('scripts/worker-dependency-smoke.py "$WORKER_KIND"'));
});
