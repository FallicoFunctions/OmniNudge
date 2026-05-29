# OmniNudge Deployment Guide for Beginners

This document is archived and retained only as historical first-time bootstrap context.

For any current production deploy, verification, or rollback work, use [RUNBOOK.md](../RUNBOOK.md).

Current production entrypoints:

```bash
bash scripts/deploy-on.sh
bash scripts/rollback.sh
```

If you are bringing up infrastructure from scratch, use the server bootstrap scripts only for initial provisioning, then switch to the runbook-managed deploy flow above.
