'use strict';

const { execFileSync } = require('node:child_process');
const { trustedPullRequest, trustedChanges, trustedMaintenancePullRequest, trustedMaintenanceChanges,
  compatibleManifest, checksPassed, REQUIRED_CHECKS } = require('./dependabot-policy.cjs');
const { appendFileSync } = require('node:fs');

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
}
function api(path, method) { return gh(['api', ...(method ? ['--method', method] : []), path]); }
function pages(path) { return gh(['api', '--paginate', '--slurp', path]).flat(); }
function contents(repository, filename, sha) {
  const file = api(`repos/${repository}/contents/${filename}?ref=${sha}`);
  if (file.encoding !== 'base64' || file.type !== 'file') throw new Error(`Cannot read ${filename}`);
  return Buffer.from(file.content, 'base64').toString('utf8');
}

function maintenanceChecks(repository, sha) {
  // GitHub may omit workflow_dispatch checks from a token-authored PR's
  // GraphQL rollup. Read the actual check runs bound to the verified head.
  const runs = gh(['api', '--paginate', '--slurp',
    `repos/${repository}/commits/${sha}/check-runs?filter=latest&per_page=100`])
    .flatMap(page => page.check_runs);
  for (const run of runs) {
    if (run.head_sha !== sha || (REQUIRED_CHECKS.includes(run.name)
      && (run.app?.id !== 15368 || run.app?.slug !== 'github-actions'))) {
      throw new Error('Required check has an unexpected commit or provider');
    }
  }
  const checks = runs.map(run => ({ name: run.name, status: run.status.toUpperCase(),
    conclusion: run.conclusion?.toUpperCase() || null }));
  const contexts = new Set();
  for (const status of pages(`repos/${repository}/commits/${sha}/statuses?per_page=100`)) {
    if (contexts.has(status.context)) continue;
    contexts.add(status.context);
    checks.push({ name: `status:${status.context}`,
      status: status.state === 'pending' ? 'IN_PROGRESS' : 'COMPLETED',
      conclusion: status.state === 'success' ? 'SUCCESS' : 'FAILURE' });
  }
  return checks;
}

const ACTIONS_BOT_ID = 41898282;
const REFRESH_LABEL = 'dependabot-refresh-in-progress';
const REFRESH_WAIT_MS = 30 * 60 * 1000;
function actionsBot(user) {
  return user?.login === 'github-actions[bot]' && user.id === ACTIONS_BOT_ID && user.type === 'Bot';
}
function refreshMarker(pr) { return `<!-- dependabot-automerge-refresh:${pr.head.sha} -->`; }
function refreshComments(repository, pr) {
  return pages(`repos/${repository}/issues/${pr.number}/comments?per_page=100`)
    .filter(comment => actionsBot(comment.user) && typeof comment.body === 'string'
      && comment.body.trim() === refreshMarker(pr));
}
function reopen(repository, pr) {
  // A failed reopen must fail the job, rather than report a successful refresh.
  apiPatch(`repos/${repository}/pulls/${pr.number}`, 'open');
  api(`repos/${repository}/issues/${pr.number}/labels/${REFRESH_LABEL}`, 'DELETE');
}
function apiPatch(path, state) { return gh(['api', '--method', 'PATCH', path, '-f', `state=${state}`]); }
function recoverInterruptedRefresh(repository) {
  for (const issue of pages(`repos/${repository}/issues?state=closed&labels=${REFRESH_LABEL}&per_page=100`)) {
    if (!issue.pull_request) continue;
    const pr = api(`repos/${repository}/pulls/${issue.number}`);
    if (pr.merged_at || !trustedPullRequest({ ...pr, state: 'open' }, repository)) continue;
    const comments = refreshComments(repository, pr);
    if (comments.length === 0) continue;
    const events = pages(`repos/${repository}/issues/${pr.number}/events?per_page=100`);
    const closed = events.filter(event => event.event === 'closed').at(-1);
    // Never reopen a PR intentionally closed by a person or another app.
    if (!closed || !actionsBot(closed.actor)
      || !comments.some(comment => Date.parse(comment.created_at) <= Date.parse(closed.created_at))) continue;
    if (process.env.DEPENDABOT_DRY_RUN === '1') {
      console.log(`#${pr.number}: would recover interrupted branch refresh`); continue;
    }
    reopen(repository, pr);
    console.log(`#${pr.number}: recovered interrupted branch refresh`);
  }
}
function requestRefresh(repository, pr) {
  if (process.env.DEPENDABOT_DRY_RUN === '1') {
    console.log(`#${pr.number}: would refresh Dependabot branch`); return;
  }
  const comments = refreshComments(repository, pr);
  const latest = comments.at(-1);
  if (latest) {
    const events = pages(`repos/${repository}/issues/${pr.number}/events?per_page=100`);
    const reopened = events.filter(event => event.event === 'reopened' && actionsBot(event.actor)
      && Date.parse(event.created_at) >= Date.parse(latest.created_at)).at(-1);
    if (reopened && Date.now() - Date.parse(reopened.created_at) < REFRESH_WAIT_MS) {
      console.log(`#${pr.number}: waiting for Dependabot's branch refresh`); return;
    }
  }
  const fresh = api(`repos/${repository}/pulls/${pr.number}`);
  if (!trustedPullRequest(fresh, repository) || fresh.head.sha !== pr.head.sha) {
    console.log(`#${pr.number}: changed before refresh; retry next run`); return;
  }
  // Dependabot rejects @dependabot commands from GITHUB_TOKEN. Its native
  // reopened event schedules a refresh while retaining signed bot authorship.
  execFileSync('gh', ['pr', 'comment', String(pr.number), '--repo', repository,
    '--body', refreshMarker(pr)], { stdio: 'inherit' });
  execFileSync('gh', ['label', 'create', REFRESH_LABEL, '--repo', repository, '--force',
    '--color', 'ededed', '--description', 'Recover an interrupted automated Dependabot refresh'], { stdio: 'inherit' });
  gh(['api', '--method', 'POST', `repos/${repository}/issues/${pr.number}/labels`,
    '-f', `labels[]=${REFRESH_LABEL}`]);
  try {
    apiPatch(`repos/${repository}/pulls/${pr.number}`, 'closed');
  } finally {
    // Also attempt recovery if the close response was lost after GitHub applied it.
    reopen(repository, pr);
  }
  console.log(`#${pr.number}: requested Dependabot branch refresh`);
}

function run(repository) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid repository');
  recoverInterruptedRefresh(repository);
  let failed = false;
  for (const candidate of pages(`repos/${repository}/pulls?state=open&base=main&per_page=100`)) {
    const maintenance = trustedMaintenancePullRequest(candidate, repository);
    const trustedPR = maintenance ? trustedMaintenancePullRequest : trustedPullRequest;
    const trustedFiles = maintenance ? trustedMaintenanceChanges : trustedChanges;
    if (!trustedPR(candidate, repository)) continue;
    try {
      const pr = api(`repos/${repository}/pulls/${candidate.number}`);
      const files = pages(`repos/${repository}/pulls/${pr.number}/files?per_page=100`);
      const commits = pages(`repos/${repository}/pulls/${pr.number}/commits?per_page=100`);
      if (!trustedPR(pr, repository) || !trustedFiles(pr, files, commits)) {
        console.log(`#${pr.number}: requires review (identity or changed files)`); continue;
      }
      // The reopen may have succeeded even if its response was lost. Clear
      // recovery bookkeeping on an already-open, authenticated branch.
      if (process.env.DEPENDABOT_DRY_RUN !== '1'
        && pr.labels?.some(label => label.name === REFRESH_LABEL)) {
        api(`repos/${repository}/issues/${pr.number}/labels/${REFRESH_LABEL}`, 'DELETE');
      }
      const mainSha = api(`repos/${repository}/git/ref/heads/main`).object.sha;
      const comparison = api(`repos/${repository}/compare/${mainSha}...${pr.head.sha}`);
      const base = comparison.merge_base_commit.sha;
      const compatible = files.every(file => compatibleManifest(file.filename,
        contents(repository, file.filename, base), contents(repository, file.filename, pr.head.sha)));
      if (!compatible) {
        console.log(`#${pr.number}: requires review (major or manifest configuration change)`); continue;
      }
      // Rebase against the current default-branch ref, which can advance before
      // GitHub refreshes the pull request's cached base SHA. Stale check failures
      // must not prevent refreshing the branch and validating it again.
      if (comparison.behind_by > 0) {
        if (maintenance) {
          console.log(`#${pr.number}: waiting for maintenance to rebuild against current main`); continue;
        }
        requestRefresh(repository, pr); continue;
      }
      const checks = maintenance ? maintenanceChecks(repository, pr.head.sha)
        : gh(['pr', 'view', String(pr.number), '--repo', repository, '--json', 'statusCheckRollup']).statusCheckRollup;
      if (!checksPassed(checks)) {
        const blockers = checks.filter(check => check.status === 'COMPLETED'
          && (!['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.conclusion)
            || (REQUIRED_CHECKS.includes(check.name) && check.conclusion !== 'SUCCESS')));
        const message = blockers.length
          ? `#${pr.number}: blocked by ${blockers.map(check => `${check.name} (${check.conclusion})`).join(', ')}`
          : `#${pr.number}: waiting for required checks`;
        console.log(message);
        if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
        continue;
      }
      const fresh = api(`repos/${repository}/pulls/${pr.number}`);
      if (!trustedPR(fresh, repository) || fresh.head.sha !== pr.head.sha || api(`repos/${repository}/git/ref/heads/main`).object.sha !== mainSha) {
        console.log(`#${pr.number}: changed during validation; retry next run`); continue;
      }
      if (process.env.DEPENDABOT_DRY_RUN === '1') {
        console.log(`#${pr.number}: validated; would enable auto-merge at ${pr.head.sha}`); continue;
      }
      execFileSync('gh', ['pr', 'merge', String(pr.number), '--repo', repository,
        '--auto', '--squash', '--match-head-commit', pr.head.sha], { stdio: 'inherit' });
    } catch (error) {
      console.error(`#${candidate.number}: ${error.message}`); failed = true;
    }
  }
  if (failed) process.exitCode = 1;
}

if (require.main === module) run(process.env.GITHUB_REPOSITORY);
module.exports = { run };
