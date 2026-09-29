# OmniAvatar reconstruction quarantine

The names matched by `quarantine.json` identify historical diagnostic experiments. Their reports, captures, source scripts, and provider evidence are retained. Superseded binary workfiles were removed in the authorized 2026-09-05 cleanup; see `../CLEANUP.md`.
They are not production assets, approved fallbacks, or candidates for the
runtime package. Build and release tooling must fail closed if one is selected.

The quarantine remains active after cleanup. It prevents reconstructed or restored experimental files from being mistaken for accepted progress or merged into the production asset set. A file leaves quarantine only after it receives a new
versioned filename and passes the executable `omnirave-avatar/2` contract.

The current approved gameplay avatar remains unchanged while reconstruction is
paused.

Release validation checks both the candidate filename and its
`avatarSourceBlend` scene provenance, so renaming an export does not bypass the
quarantine. Inspect a candidate with:

```sh
npm run avatar:validate -- path/to/avatar.glb --output path/to/report.json
```
