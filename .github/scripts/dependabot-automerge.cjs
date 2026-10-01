'use strict';

const { execFileSync } = require('node:child_process');
const { trustedPullRequest, trustedChanges, compatibleManifest, checksPassed } = require('./dependabot-policy.cjs');

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
}
function api(path) { return gh(['api', path]); }
function pages(path) { return gh(['api', '--paginate', '--slurp', path]).flat(); }
function contents(repository, filename, sha) {
  const file = api(`repos/${repository}/contents/${filename}?ref=${sha}`);
  if (file.encoding !== 'base64' || file.type !== 'file') throw new Error(`Cannot read ${filename}`);
  return Buffer.from(file.content, 'base64').toString('utf8');
}

const REBASE_MARKER = '<!-- dependabot-automerge-rebase -->';

function requestRebase(repository, pr) {
  const comments = pages(`repos/${repository}/issues/${pr.number}/comments?per_page=100`);
  if (comments.some(comment => typeof comment.body === 'string' && comment.body.includes(REBASE_MARKER))) {
    console.log(`#${pr.number}: waiting for Dependabot's requested rebase`);
    return;
  }
  execFileSync('gh', ['pr', 'comment', String(pr.number), '--repo', repository,
    '--body', `${REBASE_MARKER}\n@dependabot rebase`], { stdio: 'inherit' });
  console.log(`#${pr.number}: requested Dependabot rebase`);
}

function run(repository) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid repository');
  let failed = false;
  for (const candidate of pages(`repos/${repository}/pulls?state=open&base=main&per_page=100`)) {
    if (!trustedPullRequest(candidate, repository)) continue;
    try {
      const pr = api(`repos/${repository}/pulls/${candidate.number}`);
      const files = pages(`repos/${repository}/pulls/${pr.number}/files?per_page=100`);
      const commits = pages(`repos/${repository}/pulls/${pr.number}/commits?per_page=100`);
      if (!trustedPullRequest(pr, repository) || !trustedChanges(pr, files, commits)) {
        console.log(`#${pr.number}: requires review (identity or changed files)`); continue;
      }
      const comparison = api(`repos/${repository}/compare/${pr.base.sha}...${pr.head.sha}`);
      const base = comparison.merge_base_commit.sha;
      const compatible = files.every(file => compatibleManifest(file.filename,
        contents(repository, file.filename, base), contents(repository, file.filename, pr.head.sha)));
      if (!compatible) {
        console.log(`#${pr.number}: requires review (major or manifest configuration change)`); continue;
      }
      const { statusCheckRollup: checks } = gh(['pr', 'view', String(pr.number), '--repo', repository,
        '--json', 'statusCheckRollup']);
      if (!checksPassed(checks)) { console.log(`#${pr.number}: waiting for all checks`); continue; }
      // Strict protection would leave otherwise green updates perpetually
      // behind main. Ask Dependabot to refresh the branch once, then let the
      // next workflow run validate the new head and checks.
      if (comparison.behind_by > 0) {
        requestRebase(repository, pr); continue;
      }
      const fresh = api(`repos/${repository}/pulls/${pr.number}`);
      if (!trustedPullRequest(fresh, repository) || fresh.head.sha !== pr.head.sha || fresh.base.sha !== pr.base.sha) {
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
