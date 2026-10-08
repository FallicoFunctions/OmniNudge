# Dependency updates and recovery

Dependabot checks the configured projects daily. Compatible version changes can
merge through `.github/workflows/dependabot-automerge.yml` only after all required
CI, audit, worker, and performance checks succeed on a branch based on current
`main`. The merger verifies the bot account ID, repository, commit signatures,
changed files, version transitions, and head SHA. Major or configuration changes
remain review work. Failed checks remain merge blockers.

## npm audit repairs

`Dependency maintenance` runs hourly and after a failed CI or Security Scan. It
checks out **main**, repairs both npm lockfiles with `npm audit fix
--package-lock-only --ignore-scripts`, and requires both complete audits to pass.
It rejects manifest/source edits and direct major changes. It never uses `--force`
or executes package lifecycle scripts while holding a write token.

When a compatible fix exists, the publishing step creates a GitHub-signed Actions
commit and a lockfile-only PR under `dependency-maintenance/npm-audit-*`. It
explicitly dispatches the normal CI workflows because a token-authored push/PR
cannot be relied on to start them unattended. The same protected merger validates
the repair. Publishing is resumable and avoids duplicate checks for an unchanged
head. Obsolete repair PRs are retired only after authenticating their bot authors
and lockfile-only changes.

This covers registry audit findings that have not appeared in GitHub's Dependabot
alerts. A zero alert count is not a substitute for successful npm audits. GitHub's
[`allow` reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#allow)
does not promise ordinary indirect npm version updates from `dependency-type: all`.

If a vulnerability has no compatible fix, maintenance fails visibly instead of
dismissing the advisory or weakening checks. A breaking upgrade still needs a
code change and review. The auto-merge run summary lists failed checks separately
from checks that are still running.

To verify the publisher after changing its permissions or code, manually dispatch
`Dependency maintenance` with `verify_publication=true` after the update queue
settles. This creates a clearly labeled test PR that changes only trailing
whitespace in a lockfile, while exercising real GitHub signing, CI dispatch, and
automatic merging. The normal schedule never requests this test. Ordinary audit
runs preserve cosmetic formatting, so the verification does not create a loop of
format-only PRs.

## Python workers

Each worker's `requirements.txt` is a complete, exact dependency lock. CI and
Docker install it with `--no-deps`, then run `pip check`. Worker smoke tests also
traverse installed package metadata, including required extras, and reject
missing pins or a version that differs from the lock. Thus a new Transformers
release cannot silently enter an unrelated PR's avatar environment.

The initial locks retain the versions from successful worker CI, including
Transformers 5.18.0 for Kokoro. Only the known-broken 5.19.0 release is excluded;
later releases remain eligible for the real import smoke test. The CPU/GPU
PyTorch variants share public version pins. Their exact CUDA/triton dependencies
remain owned by the container image. Ordinary Torch updates require a coordinated
container change; security update PRs remain enabled.

Dependabot can update all pinned packages. After manually changing a pin that
requires a different transitive graph, regenerate and validate the lock:

```sh
scripts/lock-worker-dependencies.sh avatar  # or image / video; requires uv
python -m pip install --no-deps -r infra/avatar-worker/requirements.txt
python -m pip check
PYTHONPATH=. python scripts/worker-dependency-smoke.py avatar
```

The regeneration script resolves for Python 3.11/Linux using CPU PyTorch metadata
without installing into the caller's environment. Existing exact pins act as
constraints: incompatible pins must be deliberately updated together.

## Fast guard checks

```sh
node --test .github/scripts/*.test.cjs
python3 -m unittest discover -s scripts -p 'test_worker_dependency_lock.py' -v
```

The Node tests use the locked frontend `yaml` package (or `POLICY_NODE_MODULES`).
The Python tests need `packaging`, which is in every worker lock. Both sets run in
CI and contain mutation controls: deleting the protected denial must cause a
specific assertion failure. No live repository state is modified by these tests.
