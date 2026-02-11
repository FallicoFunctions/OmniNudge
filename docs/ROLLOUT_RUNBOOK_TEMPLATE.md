# Feature Rollout Runbook: [Feature Name]

**Feature Key:** `[feature_key]`
**Owner:** @[owner]
**Date Started:** [Date]

## Success Metrics
- [ ] Metric 1: (e.g., Message send events increase by 5%)
- [ ] Metric 2: (e.g., Page load time remains < 200ms)

## Health Thresholds (Manual Intervention)
- **Error Rate**: > 2%
- **Latency**: > 300ms p95
- **Support Tickets**: > 5/day relating to this feature

## Rollout Schedule

| Target | Date | Approved By | Notes |
|--------|------|-------------|-------|
| 1% | | | |
| 5% | | | |
| 10% | | | |
| 25% | | | |
| 50% | | | |
| 100% | | | |

## Rollback Procedure
1. Navigate to Feature Flag Admin.
2. Search for `[feature_key]`.
3. Toggle "Enabled" to OFF.
4. Verify via logs that traffic has ceased.
5. Notify team in #ops-alerts.
