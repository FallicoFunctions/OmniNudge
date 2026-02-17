# Feature Rollout Runbook: [Feature Name]

**Feature Key:** `[feature_key]`
**Owner:** @[owner]
**Date Started:** [Date]

## Success Metrics
- [ ] Metric 1: (e.g., Message send events increase by 5%)
- [ ] Metric 2: (e.g., Page load time remains < 200ms)
- [ ] Metric 3 (A/B delta): Treatment cohort statistically better or neutral vs control

## Health Thresholds (Manual Intervention)
- **Error Rate Increase**: > 1% above baseline
- **Crash Rate**: > 0.1%
- **User Complaints**: > 10 in window
- **Latency**: > 300ms p95

## Rollout Schedule

| Target | Date | Approved By | Notes |
|--------|------|-------------|-------|
| 1% | | | |
| 5% | | | |
| 10% | | | |
| 25% | | | |
| 50% | | | |
| 100% | | | |

## A/B Comparison Checklist
- [ ] Control cohort defined (flag disabled users)
- [ ] Treatment cohort defined (flag enabled users)
- [ ] Activation metric reviewed
- [ ] Reliability metrics reviewed (error/crash)
- [ ] Retention/sentiment reviewed
- [ ] Decision logged with owner approval

## Rollback Procedure
1. Navigate to Feature Flag Admin.
2. Search for `[feature_key]`.
3. Toggle "Enabled" to OFF.
4. Verify via logs that traffic has ceased.
5. Notify team in #ops-alerts.
