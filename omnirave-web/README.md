# Legacy OmniRave Runtime

## Runtime Status

`omnirave-web` is retired from local startup and production deployment. It is
retained only as historical implementation and concept-reference material.

The former npm manifests are retained as `package.reference.json` and
`package-lock.reference.json`. They are historical reference documents, not
install inputs; this directory intentionally has no active npm package. This
prevents an unused dependency graph from generating alerts without an update
path. The CI manifest inventory rejects reintroducing active manifests here
unless the runtime is explicitly restored with Dependabot and CI coverage.

The sole active runtime is `../omnirave-babylon`. Do not build, deploy, or add
runtime features here.

For current local play, build verification, and deployment instructions, use
[`../omnirave-babylon/README.md`](../omnirave-babylon/README.md).
