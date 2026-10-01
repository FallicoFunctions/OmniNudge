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

function rebaseMarker(pr) { return `<!-- dependabot-automerge-rebase:${pr.head.sha} -->`; }

function requestRebase(repository, pr) {
  const marker = rebaseMarker(pr);
  if (process.env.DEPENDABOT_DRY_RUN === '1') {
    console.log(`#${pr.number}: would request Dependabot rebase`);
    return;
  }
  const comments = pages(`repos/${repository}/issues/${pr.number}/comments?per_page=100`);
  if (comments.some(comment => typeof comment.body === 'string' && comment.body.includes(marker))) {
    console.log(`#${pr.number}: waiting for Dependabot's requested rebase`);
    return;
  }
  execFileSync('gh', ['pr', 'comment', String(pr.number), '--repo', repository,
    '--body', `${marker}\n@dependabot rebase`], { stdio: 'inherit' });
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
        requestRebase(repository, pr); continue;
      }
      const { statusCheckRollup: checks } = gh(['pr', 'view', String(pr.number), '--repo', repository,
        '--json', 'statusCheckRollup']);
      if (!checksPassed(checks)) { console.log(`#${pr.number}: waiting for all checks`); continue; }
      const fresh = api(`repos/${repository}/pulls/${pr.number}`);
      if (!trustedPullRequest(fresh, repository) || fresh.head.sha !== pr.head.sha || api(`repos/${repository}/git/ref/heads/main`).object.sha !== mainSha) {
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
