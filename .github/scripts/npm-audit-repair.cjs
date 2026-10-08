'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync, appendFileSync, mkdtempSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { isDeepStrictEqual } = require('node:util');
const { compatibleManifest, trustedMaintenancePullRequest, trustedMaintenanceChanges } = require('./dependabot-policy.cjs');

const DIRECTORIES = ['frontend', 'omnirave-babylon'];
const WORKFLOWS = ['ci.yml', 'security.yml', 'performance.yml', 'i18n-verify.yml'];
const BRANCH_PREFIX = 'dependency-maintenance/npm-audit-';
const VERIFICATION_BRANCH_PREFIX = 'dependency-maintenance/npm-verify-';
function gitEnvironment() {
  // Hooks export GIT_DIR/GIT_INDEX_FILE for their parent checkout. Changing
  // cwd alone does not isolate a temporary repository from those variables.
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
}
function shell(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    ...(command === 'git' ? { env: gitEnvironment() } : {}), ...options });
}
function gh(args) { return JSON.parse(shell('gh', args)); }
function api(path, ...args) { return gh(['api', path, ...args]); }
function pages(path) { return gh(['api', '--paginate', '--slurp', path]).flat(); }
function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}
function auditReport(result, directory) {
  let audit;
  try { audit = JSON.parse(result.stdout); } catch { throw new Error(`${directory}: npm did not return a valid audit report`); }
  const total = audit.metadata?.vulnerabilities?.total;
  if (result.error || result.signal || ![0, 1].includes(result.status) || audit.error
    || !Number.isSafeInteger(total) || total < 0 || !audit.vulnerabilities
    || typeof audit.vulnerabilities !== 'object' || Array.isArray(audit.vulnerabilities)
    || (Object.keys(audit.vulnerabilities).length === 0) !== (total === 0)
    || (result.status === 0) !== (total === 0)) {
    throw new Error(`${directory}: npm audit failed or returned an inconsistent report`);
  }
  return audit;
}
function assertCleanAudit(result, directory) {
  const audit = auditReport(result, directory);
  if (audit.metadata.vulnerabilities.total !== 0) {
    const names = Object.keys(audit.vulnerabilities || {});
    throw new Error(`${directory}: audit remains blocked${names.length ? ` by ${names.join(', ')}` : ''}; no compatible automatic repair was found`);
  }
}
function validateFiles(root, before) {
  const changed = shell('git', ['diff', 'HEAD', '--name-only'], { cwd: root }).trim().split('\n').filter(Boolean);
  if (changed.some(path => !DIRECTORIES.some(dir => path === `${dir}/package-lock.json`))) {
    throw new Error('Audit repair changed a file outside the lockfile allowlist');
  }
  for (const directory of DIRECTORIES) {
    for (const file of ['package.json', 'package-lock.json']) {
      const path = `${directory}/${file}`;
      const after = readFileSync(join(root, path), 'utf8');
      if (file === 'package.json' && after !== before[path]) throw new Error(`Audit repair changed ${path}`);
      if (!compatibleManifest(path, before[path], after)) throw new Error(`Audit repair requires review: incompatible change in ${path}`);
    }
  }
  return changed;
}
function prepare(root, run = spawnSync, verifyPublication = process.env.AUDIT_REPAIR_VERIFY === 'true') {
  const before = {};
  for (const directory of DIRECTORIES) {
    for (const file of ['package.json', 'package-lock.json']) {
      const path = `${directory}/${file}`;
      before[path] = readFileSync(join(root, path), 'utf8');
    }
  }
  for (const directory of DIRECTORIES) {
    const options = { cwd: join(root, directory), encoding: 'utf8', timeout: 5 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 };
    const auditArgs = ['audit', '--all', '--package-lock-only', '--ignore-scripts', '--audit-level=low', '--json'];
    const initial = auditReport(run('npm', auditArgs, options), directory);
    // A clean graph must stay byte-for-byte unchanged. Even audit fix can
    // rewrite platform metadata when npm versions differ from the lock writer.
    if (initial.metadata.vulnerabilities.total === 0) continue;
    // Never execute dependency lifecycle scripts in the maintenance job.
    const fixed = run('npm', ['audit', 'fix', '--package-lock-only', '--ignore-scripts', '--no-fund', '--audit-level=low'], options);
    if (fixed.error || fixed.signal || ![0, 1].includes(fixed.status)) throw new Error(`${directory}: npm audit fix could not run`);
    const audit = run('npm', auditArgs, options);
    assertCleanAudit(audit, directory);
  }
  // npm may normalize whitespace even when the dependency graph is identical.
  // Avoid opening recurring cosmetic repair PRs.
  for (const directory of DIRECTORIES) {
    const path = `${directory}/package-lock.json`;
    if (isDeepStrictEqual(JSON.parse(before[path]), JSON.parse(readFileSync(join(root, path), 'utf8')))) {
      writeFileSync(join(root, path), before[path]);
    }
  }
  let files = validateFiles(root, before);
  if (verifyPublication && files.length === 0) {
    const path = 'frontend/package-lock.json';
    writeFileSync(join(root, path), before[path].trimEnd() + (before[path].endsWith('\n\n') ? '\n' : '\n\n'));
    files = validateFiles(root, before);
    summary('Publication verification prepared: only trailing whitespace changes; every dependency is identical.');
    return files;
  }
  summary(files.length ? `Compatible audit repair prepared for ${files.join(', ')}.` : 'Both npm dependency graphs pass audit; no repair is needed.');
  return files;
}
function contents(repository, path, sha) {
  const file = api(`repos/${repository}/contents/${path}?ref=${sha}`);
  if (file.type !== 'file' || file.encoding !== 'base64') throw new Error(`Cannot read ${path}`);
  return Buffer.from(file.content, 'base64').toString('utf8');
}
function authenticatedMaintenance(repository, candidate) {
  const pr = api(`repos/${repository}/pulls/${candidate.number}`);
  const files = pages(`repos/${repository}/pulls/${pr.number}/files?per_page=100`);
  const commits = pages(`repos/${repository}/pulls/${pr.number}/commits?per_page=100`);
  if (!trustedMaintenancePullRequest(pr, repository) || !trustedMaintenanceChanges(pr, files, commits)) return null;
  return pr;
}
function retireSuperseded(repository, candidates, currentBranch, prefix = BRANCH_PREFIX) {
  for (const candidate of candidates) {
    if (!trustedMaintenancePullRequest(candidate, repository) || !candidate.head.ref.startsWith(prefix)
      || candidate.head.ref === currentBranch) continue;
    const pr = authenticatedMaintenance(repository, candidate);
    if (!pr || pr.head.sha !== candidate.head.sha) continue;
    api(`repos/${repository}/pulls/${pr.number}`, '--method', 'PATCH', '-f', 'state=closed');
    summary(`Retired superseded npm audit repair #${pr.number}.`);
  }
}
function publish(root, repository) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Invalid repository');
  const base = shell('git', ['rev-parse', 'HEAD'], { cwd: root }).trim();
  if (api(`repos/${repository}/git/ref/heads/main`).object.sha !== base) {
    throw new Error('Main advanced while preparing the repair; the next run will retry');
  }
  const before = {};
  for (const directory of DIRECTORIES) for (const file of ['package.json', 'package-lock.json']) {
    const path = `${directory}/${file}`;
    before[path] = shell('git', ['show', `${base}:${path}`], { cwd: root });
  }
  const changed = validateFiles(root, before);
  const open = pages(`repos/${repository}/pulls?state=open&base=main&per_page=100`);
  if (changed.length === 0) {
    // The prepare step has just audited current main. Old lockfile-only
    // repairs are unnecessary when those graphs are already clean.
    retireSuperseded(repository, open, null);
    return;
  }
  const verification = changed.every(path => isDeepStrictEqual(JSON.parse(before[path]), JSON.parse(readFileSync(join(root, path), 'utf8'))));
  const branch = `${verification ? VERIFICATION_BRANCH_PREFIX : BRANCH_PREFIX}${base.slice(0, 12)}`;
  let pr = open.find(candidate => candidate.head.ref === branch);
  let expectedHead = base;
  if (pr) {
    pr = authenticatedMaintenance(repository, pr);
    if (!pr) {
      throw new Error('Existing maintenance branch has untrusted changes; refusing to overwrite it');
    }
    expectedHead = pr.head.sha;
  } else {
    const closed = pages(`repos/${repository}/pulls?state=closed&head=${encodeURIComponent(`${repository.split('/')[0]}:${branch}`)}&per_page=100`);
    if (closed.length) {
      summary('The repair for this baseline was already closed; leaving that decision in place.'); return;
    }
    const existing = api(`repos/${repository}/git/matching-refs/heads/${branch}`)
      .find(ref => ref.ref === `refs/heads/${branch}`);
    if (existing) {
      expectedHead = existing.object.sha;
      if (expectedHead !== base) {
        // Recover interruption after commit creation but before PR creation.
        // Only signed Actions commits changing the allowed locks are reusable.
        const comparison = api(`repos/${repository}/compare/${base}...${expectedHead}`);
        const recovered = { head: { sha: expectedHead }, changed_files: comparison.files?.length,
          commits: comparison.total_commits };
        if (comparison.behind_by !== 0 || !trustedMaintenanceChanges(recovered, comparison.files || [], comparison.commits || [])) {
          throw new Error('Orphaned maintenance branch has untrusted changes; refusing to overwrite it');
        }
      }
    } else {
      api(`repos/${repository}/git/refs`, '--method', 'POST', '-f', `ref=refs/heads/${branch}`, '-f', `sha=${base}`);
    }
  }
  const additions = changed.filter(path => contents(repository, path, expectedHead) !== readFileSync(join(root, path), 'utf8'))
    .map(path => ({ path, contents: Buffer.from(readFileSync(join(root, path), 'utf8')).toString('base64') }));
  if (additions.length) {
    const query = 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }';
    const input = { branch: { repositoryNameWithOwner: repository, branchName: branch }, expectedHeadOid: expectedHead,
      message: { headline: verification ? 'test(deps): verify unattended dependency publishing' : 'fix(deps): repair vulnerable npm lockfile dependencies' }, fileChanges: { additions } };
    // GitHub signs this commit; the merger independently verifies every author,
    // signature, changed path, version transition and required status check.
    const result = JSON.parse(shell('gh', ['api', 'graphql', '--input', '-'], { input: JSON.stringify({ query, variables: { input } }) }));
    if (result.errors?.length || !result.data?.createCommitOnBranch?.commit?.oid) throw new Error('GitHub did not create the signed repair commit');
    expectedHead = result.data.createCommitOnBranch.commit.oid;
  }
  if (!pr) {
    const directory = mkdtempSync(join(tmpdir(), 'npm-audit-pr-'));
    try {
      const body = join(directory, 'body.md');
      const description = verification
        ? 'This explicitly requested pipeline verification changes only trailing whitespace in a lockfile. All parsed dependency data is identical. It exercises GitHub-signed publishing, explicit CI dispatch, and protected automatic merging using the actual Actions token.'
        : 'An npm audit found vulnerable packages in the committed dependency graphs. This automated repair updates only lockfiles, keeps direct dependencies within their existing major versions, and passes both complete npm audits.';
      writeFileSync(body, `${description}\n\nAll normal CI, security, worker, and performance checks must pass before the protected auto-merge workflow can merge it.\n`);
      shell('gh', ['pr', 'create', '--repo', repository, '--base', 'main', '--head', branch,
        '--title', verification ? 'test(deps): verify unattended dependency publishing' : 'fix(deps): repair vulnerable npm lockfile dependencies', '--body-file', body]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
  // GITHUB_TOKEN pushes cannot be relied on to start ordinary PR workflows.
  // Explicit dispatch is supported and runs the same mandatory jobs on this
  // branch. Repeated maintenance runs never rerun an already-tested head.
  for (const workflow of WORKFLOWS) {
    const runs = api(`repos/${repository}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=100`).workflow_runs;
    if (!runs.some(run => run.head_sha === expectedHead)) {
      shell('gh', ['workflow', 'run', workflow, '--repo', repository, '--ref', branch]);
    }
  }
  retireSuperseded(repository, open, branch, verification ? VERIFICATION_BRANCH_PREFIX : BRANCH_PREFIX);
  summary(`Repair submitted from ${branch} at ${expectedHead}; required workflows dispatched.`);
}

if (require.main === module) {
  const root = resolve(__dirname, '../..');
  if (process.argv[2] === 'prepare') prepare(root);
  else if (process.argv[2] === 'publish') publish(root, process.env.GITHUB_REPOSITORY);
  else throw new Error('Expected prepare or publish');
}
module.exports = { DIRECTORIES, WORKFLOWS, BRANCH_PREFIX, gitEnvironment, assertCleanAudit, validateFiles, prepare, publish };
