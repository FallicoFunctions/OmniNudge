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
1. **Error Rate**: If the percentage of errors associated with a feature exceeds the threshold (internal baseline + configured threshold).
2. **Crash Rate**: If crash events exceed 0.1% for monitored clients.
3. **User Complaints**: If user complaints exceed 10 within the monitoring window.
4. **Min Sample Size**: Rollbacks will not trigger until at least **100 events** have been recorded for the feature in the current window.

Default thresholds:
- Error rate increase: `> 1%`
- Crash rate: `> 0.1%`
- Complaints: `> 10`

## A/B Testing Baseline

For each staged rollout, compare:
- Treatment cohort: users with flag enabled.
- Control cohort: users with flag disabled.

Track at minimum:
- Activation metric (did users use the feature?)
- Reliability metric (error/crash rate)
- Retention proxy (7-day return rate)
- Sentiment proxy (feedback/complaint counts)

Decision rule:
- Promote to next stage only if reliability guardrails hold and treatment cohort does not regress retention/sentiment.

## Developer Process
1. Create a Feature Flag in the Admin UI.
2. Initialize at 0% or 1%.
3. Fill out a [Rollout Runbook](./ROLLOUT_RUNBOOK_TEMPLATE.md).
4. Monitor logs and analytics after each stage increment.
5. Run treatment vs control comparison before each stage increase.
6. Validate against [Feature Success Metrics](./FEATURE_SUCCESS_METRICS.md) targets.
