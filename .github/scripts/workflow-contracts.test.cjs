'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
// CI installs this small parser independently; local hooks reuse the locked
// frontend dependency, without installing or executing any PR dependencies.
const { parse } = require(require.resolve('yaml', { paths: [process.env.POLICY_NODE_MODULES || resolve(__dirname, '../../frontend/node_modules')] }));
const { REQUIRED_CHECKS } = require('./dependabot-policy.cjs');
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
