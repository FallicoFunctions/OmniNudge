'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { REQUIRED_CHECKS } = require('./dependabot-policy.cjs');

test('merger reaches exact-commit merge only with a fully validated current PR', () => {
  const repository = 'FallicoFunctions/OmniNudge';
  const bot = { login: 'dependabot[bot]', id: 49699333, type: 'Bot' };
  const original = childProcess.execFileSync;
  let behind = 0, changedHead = false, failure = false;
  const merges = [];
  let reads = 0;
  const pr = { number: 1, state: 'open', draft: false, user: bot, changed_files: 1, commits: 1,
    head: { sha: 'abc', ref: 'dependabot/pip/image/update', repo: { full_name: repository } },
    base: { sha: 'base', ref: 'main', repo: { full_name: repository } } };
  childProcess.execFileSync = (command, args) => {
    assert.equal(command, 'gh');
    if (args[0] === 'pr') {
      if (args[1] === 'merge') { merges.push(args); return ''; }
      return JSON.stringify({ statusCheckRollup: REQUIRED_CHECKS.map(name => ({ name,
        status: 'COMPLETED', conclusion: failure ? 'FAILURE' : 'SUCCESS' })) });
    }
    const endpoint = args.at(-1);
    let result;
    if (endpoint.includes('/contents/')) {
      result = { type: 'file', encoding: 'base64', content: Buffer.from('boto3==1.43.100\n').toString('base64') };
    } else if (endpoint.includes('/compare/')) {
      result = { merge_base_commit: { sha: 'base' }, behind_by: behind };
    } else if (endpoint.includes('/files?')) {
      result = [[{ filename: 'infra/runpod/image-worker/requirements.txt', status: 'modified' }]];
    } else if (endpoint.includes('/commits?')) {
      result = [[{ sha: 'abc', author: bot, commit: { verification: { verified: true } } }]];
    } else if (endpoint.includes('/pulls?')) {
      result = [[pr]];
    } else {
      reads++;
      result = changedHead && reads % 2 === 0 ? { ...pr, head: { ...pr.head, sha: 'changed' } } : pr;
    }
    return JSON.stringify(result);
  };
  try {
    delete require.cache[require.resolve('./dependabot-automerge.cjs')];
    const { run } = require('./dependabot-automerge.cjs');
    run(repository);
    assert.equal(merges.length, 1);
    assert.deepEqual(merges[0].slice(-4), ['--auto', '--squash', '--match-head-commit', 'abc']);
    behind = 1;
    run(repository);
    assert.equal(merges.length, 1, 'outdated branches must wait for rebase and new checks');
    behind = 0; failure = true;
    run(repository);
    assert.equal(merges.length, 1, 'failed checks must never merge');
    failure = false; changedHead = true; reads = 0;
    run(repository);
    assert.equal(merges.length, 1, 'a changed head must be revalidated');
  } finally {
    childProcess.execFileSync = original;
    delete require.cache[require.resolve('./dependabot-automerge.cjs')];
  }
});
