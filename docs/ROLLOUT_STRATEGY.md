# Feature Rollout Strategy

This document outlines the standard procedure for rolling out new features in OmniNudge.

## Rollout Stages

To ensure platform stability, all major features should follow these progressive rollout stages:

| Stage | Target (%) | Audience | Duration | Rollback Threshold |
|-------|------------|----------|----------|--------------------|
| **Canary** | 1% | Random Users | 24h | > 1% Error Rate |
| **Beta** | 5% | Early Adopters / Random | 48h | > 1% Error Rate |
| **Growth** | 10% - 25% | Wider Base | 3-5 days | > 1% Error Rate |
| **Scale** | 50% | Half the Base | 2 days | > 1% Error Rate |
| **GA** | 100% | Everyone | Permanent | N/A |

## Automated Rollback

OmniNudge uses a `RolloutMonitor` that automatically disables feature flags if technical health metrics degrade.

### Triggers
1. **Error Rate**: If the percentage of errors associated with a feature exceeds the threshold (Internal baseline + 1%).
2. **Performance**: If API p95 latency for feature-specific endpoints exceeds 500ms.
3. **Min Sample Size**: Rollbacks will not trigger until at least **100 events** have been recorded for the feature in the current window.

## Developer Process
1. Create a Feature Flag in the Admin UI.
2. Initialize at 0% or 1%.
3. Fill out a [Rollout Runbook](./ROLLOUT_RUNBOOK_TEMPLATE.md).
4. Monitor logs and analytics after each stage increment.
