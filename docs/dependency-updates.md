# Dependency updates and recovery

Dependabot checks the configured projects daily. Compatible version changes can
merge through `.github/workflows/dependabot-automerge.yml` only after all required
CI, audit, worker, and performance checks succeed on a branch based on current
`main`. The merger verifies the bot account ID, repository, commit signatures,
changed files, version transitions, and head SHA. Direct major or configuration changes
remain review work. Failed checks remain merge blockers.

## npm audit repairs

`Dependency maintenance` runs hourly and after a failed CI or Security Scan. It
checks out **main**, repairs both npm lockfiles with `npm audit fix
--package-lock-only --ignore-scripts`, and requires both complete audits to pass.
It audits first and runs the repair only for a graph with a reported vulnerability;
clean lockfiles remain byte-for-byte unchanged. The npm writer is pinned to the
validated version so platform metadata is preserved during real repairs.
It rejects manifest/source edits and direct major changes. It never uses `--force`
or executes package lifecycle scripts while holding a write token.

When a compatible fix exists, the publishing step creates a GitHub-signed Actions
commit under `dependency-maintenance/npm-audit-*`. A dedicated GitHub App creates
the lockfile-only PR, which triggers the normal PR workflows. The App has only
**Pull requests: write**, scoped to this repository; Actions still owns branch
writes and signed commits. Registry resolution finishes before the App token is
created, and that token is used only for PR creation.

Repair branches include a fingerprint of their contents and stay immutable after
publication. A different repair receives a new App-created PR rather than a
token-authored update requiring another workflow approval. Publishing is
resumable. Obsolete repair PRs are retired only after authenticating the configured
App author, signed Actions commits, and lockfile-only changes.

The merger requires both the PR's check summary and the exact commit's Checks API
results to pass. Required checks must come from GitHub Actions on that head;
other failing statuses also block merging. Successful `workflow_dispatch` jobs
alone are insufficient: GitHub requires approval for PR workflow events created
with `GITHUB_TOKEN`. Its [documented unattended alternative](https://docs.github.com/en/actions/concepts/security/github_token)
is a GitHub App installation token. The publisher fails before creating a branch
if a repair is needed and the configured App credential is unavailable.

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
whitespace in a lockfile, while exercising real GitHub signing, App-created PRs, native CI, and
automatic merging. The normal schedule never requests this test. Ordinary audit
runs preserve cosmetic formatting, so the verification does not create a loop of
format-only PRs.

### One-time PR App setup

Register a private App under **FallicoFunctions**, with webhooks disabled and only
the repository permission **Pull requests: read and write**. Install it on
**OmniNudge only**. It does not need Contents, Actions, Workflows, or Administration
permissions. [Pre-filled registration form](https://github.com/settings/apps/new?name=OmniNudge%20Dependency%20CI&description=Create%20audited%20OmniNudge%20dependency%20repair%20pull%20requests&url=https%3A%2F%2Fgithub.com%2FFallicoFunctions%2FOmniNudge&public=false&webhook_active=false&pull_requests=write).

Configure these repository Actions values after registration:

- Variable `DEPENDENCY_PR_APP_CLIENT_ID`: the App's client ID.
- Variable `DEPENDENCY_PR_APP_SLUG`: its slug, without `[bot]`.
- Secret `DEPENDENCY_PR_APP_PRIVATE_KEY`: the complete generated PEM private key.

Store the private key directly as an encrypted Actions secret; never commit it or
paste it into logs. The pinned GitHub-owned token action mints a token limited to
this repository and revokes it when the job finishes. The merger resolves the
configured App's bot ID through GitHub and still independently verifies every
Actions commit signature and allowed change. Until configuration is complete,
ordinary clean audits and native Dependabot merging continue; new audit-repair
publication is unavailable.

## Python workers

Each worker's `requirements.in` declares its direct pins, and `requirements.txt`
is the complete compiled lock. Dependabot recognizes the pair and invokes its
pip-compile resolver; `.python-version` selects Python 3.12. This prevents an
isolated pydantic-core or mpmath bump from violating its parent's constraint.
CI checks that every direct input matches the lock, then checks the full installed
graph. Direct major or registry changes still require review; transitive lock
changes must satisfy the resolver and all required checks. CI and
Docker install it with `--no-deps`, then run `pip check`. CI audits every lock
using an isolated, pinned pip-audit tool. Worker smoke tests also
traverse installed package metadata, including required extras, and reject
missing pins or a version that differs from the lock. Thus a new Transformers
release cannot silently enter an unrelated PR's avatar environment.
The lock resolves against official CPU wheels. Container installs retain exactly
the same upstream Torch/torchvision releases from the immutable CUDA image,
using a virtual environment; the guard rejects any upstream-version mismatch.
The audit maps only those CPU build tags to the upstream release advisories.
When worker inputs change, CI also builds the actual image
and runs the smoke tests on CPU inside it; GPU hardware execution remains a
deployment check.

The locks retain validated application packages and update the previously untracked
Torch runtimes to patched PyTorch 2.13.0 / torchvision 0.28.0. The immutable
CUDA 13.0 image includes Python 3.12; CI uses matching CPU wheels. Unused
TorchAudio is omitted, as in the upstream 2.13 installation instructions.
The old Torch 2.6 CPU incompatibility no longer requires ignoring a Transformers
release. The earlier NumPy Python 3.11 cap is also removed.

CUDA packages are owned by the pinned image digest. The installed-graph guard
allows only the named CUDA runtime graph underneath Torch, verifies its version
constraints, and rejects an ordinary application dependency trying to use that
exception. Tests also require the Docker image, CPU CI matrix, and lock pins to
agree. Ordinary Torch updates require a coordinated container change; security
update PRs remain enabled. For deployment, select a CUDA 13.0-capable GPU host;
see the [RunPod runtime requirements](../infra/runpod/README.md).

Dependabot can update direct and transitive packages through the resolver. After
manually changing a direct pin in `requirements.in`, regenerate and validate:

```sh
scripts/lock-worker-dependencies.sh avatar  # or image / video; requires uv
python -m pip install --no-deps -r infra/avatar-worker/requirements.txt  # CPU Linux environment
python -m pip check
PYTHONPATH=. python scripts/worker-dependency-smoke.py avatar
```

The regeneration script resolves for Python 3.12/Linux using CPU PyTorch metadata
without installing into the caller's environment. It prefers existing lock
versions while resolving the direct inputs. Both configured registries are
explicitly trusted, matching pip-compile's cross-index selection.
The generated lock also preserves pip-compile's native unsafe-package footer.
Dependabot otherwise removes a newly introduced footer together with its required
`setuptools` pin; the committed-lock contract and writer regression control protect
against that omission.

## Fast guard checks

```sh
node --test .github/scripts/*.test.cjs
python3 -m unittest discover -s scripts -p 'test_worker_dependency_lock.py' -v
```

The Node tests use the locked frontend `yaml` package (or `POLICY_NODE_MODULES`).
The Python tests need `packaging`, which is in every worker lock. Both sets run in
CI and contain mutation controls: deleting the protected denial must cause a
specific assertion failure. No live repository state is modified by these tests.
