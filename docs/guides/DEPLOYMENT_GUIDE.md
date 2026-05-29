# OmniNudge Deployment Guide

This document is archived.

For all current production deployment steps, verification, and rollback instructions, use [RUNBOOK.md](../../RUNBOOK.md).

Canonical commands:

```bash
bash scripts/deploy-on.sh
bash scripts/rollback.sh
```

The live deployment contract is maintained only in the runbook, including:
- server-local backend `/health`
- public site `https://omninudge.com`
- public API ping `https://api.omninudge.com/api/v1/ping`
- public boot asset verification
