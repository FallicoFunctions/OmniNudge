'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { REQUIRED_CHECKS } = require('./dependabot-policy.cjs');

const repository = 'FallicoFunctions/OmniNudge';
const bot = { login: 'dependabot[bot]', id: 49699333, type: 'Bot' };
const actions = { login: 'github-actions[bot]', id: 41898282, type: 'Bot' };
const label = 'dependabot-refresh-in-progress';
function fixture(options = {}) {
  const original = childProcess.execFileSync;
  const originalClock = Date.now;
  const originalExitCode = process.exitCode;
  const originalDryRun = process.env.DEPENDABOT_DRY_RUN;
  const observed = { calls: [], comments: [], events: [], merges: [], labels: [], messages: [] };
  const author = options.maintenance ? actions : bot;
  const pr = { number: 1, state: 'open', draft: false, user: author, changed_files: 1, commits: 1,
    head: { sha: 'abc', ref: options.maintenance ? 'dependency-maintenance/npm-audit-012345abcdef' : 'dependabot/pip/image/update', repo: { full_name: repository } },
    base: { sha: 'base', ref: 'main', repo: { full_name: repository } } };
  Object.defineProperty(pr, 'labels', { enumerable: true, get: () => observed.labels.map(name => ({ name })) });
  const state = { behind: 0, main: 'base', time: Date.parse('2026-10-01T00:00:00Z'),
    mainReads: 0, prReads: 0, ...options };
  Date.now = () => state.time;
  childProcess.execFileSync = (command, args) => {
    assert.equal(command, 'gh');
    observed.calls.push(args);
    if (args[0] === 'label') return '';
    if (args[0] === 'pr') {
      if (args[1] === 'merge') { observed.merges.push(args); return ''; }
      if (args[1] === 'comment') {
        observed.comments.push({ body: args.at(-1), user: actions, created_at: new Date(state.time).toISOString() });
        return '';
      }
      return JSON.stringify({ statusCheckRollup: REQUIRED_CHECKS.map(name => ({ name,
        status: 'COMPLETED', conclusion: state.failure ? 'FAILURE' : 'SUCCESS' })) });
    }
    const endpoint = args.find(arg => arg.startsWith('repos/'));
    const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET';
    let result;
    if (endpoint.includes('/check-runs?')) {
      assert.ok(endpoint.includes(`/commits/${pr.head.sha}/check-runs?`));
      result = [{ check_runs: REQUIRED_CHECKS.map(name => ({ name,
        head_sha: state.wrongCheckHead ? 'different-head' : pr.head.sha,
        app: { id: state.wrongCheckApp ? 1 : 15368, slug: 'github-actions' },
        status: 'completed', conclusion: state.failure ? 'failure' : 'success' })) }];
    } else if (endpoint.includes('/statuses?')) {
      result = [state.classicFailure ? [{ context: 'external', state: 'failure' }] : []];
    } else if (endpoint.includes('/issues?')) {
      assert.ok(endpoint.includes(`state=closed&labels=${label}`));
      result = [pr.state === 'closed' && observed.labels.includes(label) ? [{ number: 1, pull_request: {} }] : []];
    } else if (endpoint.endsWith('/git/ref/heads/main')) {
      state.mainReads++;
      result = { object: { sha: state.advanceMain && state.mainReads % 2 === 0 ? 'new-main' : state.main } };
    } else if (endpoint.includes('/contents/')) {
      const text = options.maintenance ? JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { example: '^1.0.0' } }, 'node_modules/example': { version: '1.0.1' } } }) : 'boto3==1.43.100\n';
      result = { type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64') };
    } else if (endpoint.includes('/compare/')) {
      assert.equal(endpoint, `repos/${repository}/compare/${state.main}...${pr.head.sha}`);
      result = { merge_base_commit: { sha: 'base' }, behind_by: state.behind };
    } else if (endpoint.includes('/files?')) {
      result = [[{ filename: options.maintenance ? 'frontend/package-lock.json' : 'infra/runpod/image-worker/requirements.txt', status: 'modified' }]];
    } else if (endpoint.includes('/commits?')) {
      result = [[{ sha: pr.head.sha, author, commit: { verification: { verified: true } } }]];
    } else if (endpoint.includes('/comments?')) {
      result = [observed.comments];
    } else if (endpoint.includes('/events?')) {
      result = [observed.events];
    } else if (endpoint.includes('/labels')) {
      assert.ok(['POST', 'DELETE'].includes(method));
      if (method === 'POST') observed.labels.push(label);
      else observed.labels = [];
      result = [];
    } else if (endpoint.includes('/pulls?')) {
      result = [pr.state === 'open' ? [pr] : []];
    } else if (method === 'PATCH') {
      const next = args.find(arg => arg.startsWith('state=')).split('=')[1];
      if (next === 'open' && state.failReopen) throw new Error('reopen unavailable');
      pr.state = next;
      observed.events.push({ event: next === 'open' ? 'reopened' : 'closed', actor: actions, created_at: new Date(state.time).toISOString() });
      result = pr;
      if (next === 'open' && state.lostReopenResponse) throw new Error('lost reopen response');
      if (next === 'closed' && state.lostCloseResponse) throw new Error('lost close response');
    } else {
      state.prReads++;
      result = state.changedHead && state.prReads % 2 === 0 ? { ...pr, head: { ...pr.head, sha: 'changed' } } : pr;
    }
    return JSON.stringify(result);
  };
  delete require.cache[require.resolve('./dependabot-automerge.cjs')];
  const { run } = require('./dependabot-automerge.cjs');
  return { pr, state, observed, run: () => run(repository), close: () => {
    childProcess.execFileSync = original;
    Date.now = originalClock;
    process.exitCode = originalExitCode;
    if (originalDryRun === undefined) delete process.env.DEPENDABOT_DRY_RUN;
    else process.env.DEPENDABOT_DRY_RUN = originalDryRun;
    delete require.cache[require.resolve('./dependabot-automerge.cjs')];
  } };
}
function withFixture(options, body) {
  const f = fixture(options);
  try { body(f); } finally { f.close(); }
}

test('exact-head merge requires successful checks and unchanged actual main and head', () => {
  withFixture({}, f => {
    f.run();
    assert.deepEqual(f.observed.merges[0].slice(-4), ['--auto', '--squash', '--match-head-commit', 'abc']);
    f.state.failure = true; f.run();
    assert.equal(f.observed.merges.length, 1, 'failed checks must never merge');
    f.state.failure = false; f.state.advanceMain = true; f.state.mainReads = 0; f.run();
    assert.equal(f.observed.merges.length, 1, 'main advancing during validation must retry');
    f.state.advanceMain = false; f.state.changedHead = true; f.state.prReads = 0; f.run();
    assert.equal(f.observed.merges.length, 1, 'a changed head must be revalidated');
  });
});

test('signed audit repairs use the same merge gates and never request a Dependabot refresh', () => {
  withFixture({ maintenance: true }, f => {
    f.run();
    assert.equal(f.observed.merges.length, 1);
    f.state.failure = true; f.run();
    assert.equal(f.observed.merges.length, 1);
    f.state.failure = false; f.state.behind = 1; f.run();
    assert.equal(f.observed.merges.length, 1);
    assert.equal(f.observed.events.length, 0);
    assert.equal(f.observed.comments.length, 0);
  });
});

test('dispatched repair checks require the exact head and Actions provider and honor other failures', () => {
  for (const option of ['wrongCheckHead', 'wrongCheckApp', 'classicFailure']) {
    withFixture({ maintenance: true, [option]: true }, f => {
      f.run();
      assert.equal(f.observed.merges.length, 0, option);
    });
  }
  withFixture({ maintenance: true }, f => {
    f.run();
    assert.equal(f.observed.merges.length, 1);
    assert.ok(!f.observed.calls.some(args => args[0] === 'pr' && args[1] === 'view'),
      'dispatched checks must not depend on the missing GraphQL PR rollup');
  });
});

test('stale branches use native close/reopen events, not rejected Dependabot commands', () => {
  withFixture({ behind: 1, failure: true, main: 'advanced' }, f => {
    f.run();
    assert.deepEqual(f.observed.events.map(event => event.event), ['closed', 'reopened']);
    assert.equal(f.pr.state, 'open');
    assert.equal(f.observed.merges.length, 0);
    assert.deepEqual(f.observed.labels, []);
    assert.equal(f.observed.comments[0].body, '<!-- dependabot-automerge-refresh:abc -->');
    assert.ok(!f.observed.comments[0].body.includes('@dependabot'));
    assert.ok(f.observed.calls.filter(args => args.includes('PATCH')).every(args => args.includes(`repos/${repository}/pulls/1`)));
    f.run();
    assert.equal(f.observed.events.length, 2, 'wait for a pending refresh');
    f.pr.head.sha = 'rebased'; f.run();
    assert.equal(f.observed.events.length, 4, 'a new stale head can refresh again');
  });
});

test('a stalled native refresh retries after the bounded wait', () => {
  withFixture({ behind: 1 }, f => {
    f.run(); f.state.time += 30 * 60 * 1000 - 1; f.run();
    assert.equal(f.observed.events.length, 2);
    f.state.time++; f.run();
    assert.equal(f.observed.events.length, 4, 'retry instead of waiting indefinitely');
  });
});

test('a lost close response still reopens the PR and reports failure', () => {
  withFixture({ behind: 1, lostCloseResponse: true }, f => {
    f.run();
    assert.equal(f.pr.state, 'open', 'finally must recover a close that reached GitHub');
    assert.equal(process.exitCode, 1);
    assert.deepEqual(f.observed.events.map(event => event.event), ['closed', 'reopened']);
  });
});

test('interrupted refreshes recover next run; intentional human closures remain closed', () => {
  withFixture({ behind: 1, failReopen: true }, f => {
    f.run();
    assert.equal(f.pr.state, 'closed');
    assert.ok(f.observed.labels.includes(label));
    assert.equal(process.exitCode, 1, 'reopen errors must reach workflow exit');
    f.state.failReopen = false; f.run();
    assert.equal(f.pr.state, 'open', 'closed recovery must discover marked PRs');
    assert.deepEqual(f.observed.labels, []);
  });
  withFixture({ behind: 1, failReopen: true }, f => {
    f.run(); f.state.failReopen = false;
    f.observed.events.at(-1).actor = { login: 'owner', id: 123, type: 'User' };
    f.run();
    assert.equal(f.pr.state, 'closed', 'a human closure must never be undone');
  });
});

test('unauthenticated markers and closed recovery dry runs never cause writes', () => {
  withFixture({ behind: 1 }, f => {
    f.observed.comments.push({ body: '<!-- dependabot-automerge-refresh:abc -->', user: { ...actions, id: 1 }, created_at: new Date(f.state.time).toISOString() });
    f.observed.events.push({ event: 'reopened', actor: actions, created_at: new Date(f.state.time).toISOString() });
    f.run();
    assert.equal(f.observed.events.length, 3, 'a forged marker cannot suppress a refresh');
    f.pr.state = 'closed'; f.observed.labels.push(label);
    f.observed.events.push({ event: 'closed', actor: actions, created_at: new Date(f.state.time).toISOString() });
    process.env.DEPENDABOT_DRY_RUN = '1';
    const count = f.observed.calls.length; f.run();
    assert.ok(f.observed.calls.slice(count).every(args => args[0] === 'api' && !args.includes('--method')));
    assert.equal(f.pr.state, 'closed');
  });
  withFixture({ behind: 1 }, f => {
    process.env.DEPENDABOT_DRY_RUN = '1'; f.run();
    assert.equal(f.observed.comments.length, 0);
    assert.equal(f.observed.events.length, 0);
    assert.equal(f.observed.merges.length, 0);
  });
});

test('a head change before refresh prevents closing the new head', () => {
  withFixture({ behind: 1, changedHead: true }, f => {
    f.run();
    assert.equal(f.observed.events.length, 0);
    assert.equal(f.observed.comments.length, 0);
  });
});


test('a lost reopen response leaves the PR open and next run clears orphan bookkeeping', () => {
  withFixture({ behind: 1, lostReopenResponse: true }, f => {
    f.run();
    assert.equal(f.pr.state, 'open');
    assert.deepEqual(f.observed.labels, [label]);
    assert.equal(process.exitCode, 1);
    f.state.lostReopenResponse = false; f.run();
    assert.deepEqual(f.observed.labels, [], 'open recovery labels cannot linger indefinitely');
    assert.equal(f.observed.events.length, 2, 'do not close a branch whose refresh is already pending');
  });
});
