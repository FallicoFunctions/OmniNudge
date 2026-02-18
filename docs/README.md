# OmniNudge Documentation

## Quick Start (Root Directory)

**Essential Reading:**
- `README.md` - Project overview
- `DESIGN_INSTRUCTIONS.md` - Design guidelines and principles
- `DESIGN_SYSTEM.md` - Complete design system (colors, typography, spacing)
- `FRONTEND_GUIDELINES.md` - React patterns and state management

---

## Implementation Guides (docs/implementation/)

**Phase 0 Completion Guides:**
- `P0_009_MONITORING_COMPLETE.md` - Prometheus monitoring & Grafana dashboards
- `P0_027_ANALYTICS_COMPLETE.md` - Analytics infrastructure (tracking, dashboards, export)
- `P0_034_DATA_RETENTION_ADMIN_COMPLETE.md` - Data retention policies
- `P0_011_MIGRATION_ROLLBACK_CI_COMPLETE.md` - Database migration CI/CD

---

## Setup Guides (docs/guides/)

**Installation & Deployment:**
- `INSTALLATION_GUIDE.md` - Full installation instructions
- `DEPLOYMENT_GUIDE.md` - Production deployment guide

**Email & Messaging:**
- `EMAIL_SMTP_SETUP.md` - Comprehensive SMTP setup (SendGrid, Gmail, etc.)
- `SMTP_QUICK_START.md` - Quick SMTP reference
- `MESSAGING_TEST_GUIDE.md` - Testing WebSocket messaging
- `REACTIONS_GIF_CAPTURE.md` - Exact capture steps for reactions feature demo GIF

---

## Architecture Documentation (Root Directory)

**Security & Encryption:**
- `../ENCRYPTION_ARCHITECTURE.md` - E2E encryption design
- `../ENCRYPTION_QUICKSTART.md` - Quick encryption setup
- `../EMAIL_ENCRYPTION_SUMMARY.md` - Email encryption specifics
- `../SECURITY.md` - Security best practices
- `../WEBSOCKET_SECURITY.md` - WebSocket security
- `../SECRET_MANAGEMENT.md` - Managing secrets

**Infrastructure:**
- `../JOB_QUEUE_ARCHITECTURE.md` - Background job queue (Redis/Asynq)
- `../CACHING_STRATEGY.md` - Redis caching patterns
- `../DATABASE_OPTIMIZATION.md` - Database performance
- `../BACKEND_API_SUMMARY.md` - API architecture overview

**Features:**
- `../API_MIDDLEWARE.md` - Middleware architecture
- `../API_VERSIONING.md` - API versioning strategy
- `../CONTENT_MODERATION.md` - Content moderation system
- `../RATE_LIMITING.md` - Rate limiting implementation

---

## Operations & Monitoring (Root Directory)

**Monitoring:**
- `../MONITORING.md` - Monitoring overview
- `../ERROR_TRACKING.md` - Error tracking setup
- `../LOG_AGGREGATION.md` - Log aggregation

**Database:**
- `../DATABASE_MIGRATION_GUIDE.md` - Migration best practices
- `../MIGRATION_ROLLBACK_RUNBOOK.md` - Rollback procedures
- `../MIGRATION_STAGING_TEST_PLAN.md` - Staging test plan

**Operations:**
- `../FEATURE_ROLLOUT_RUNBOOK.md` - Feature rollout process
- `../REFACTORING_GUIDE.md` - Refactoring guidelines
- `../CODE_QUALITY.md` - Code quality standards

---

## Feature-Specific Guides (Root Directory)

**Performance:**
- `../PERFORMANCE_BUDGETS.md` - Performance targets
- `../FEED_PERFORMANCE_PLAN.md` - Feed optimization

**Media:**
- `../FILE_UPLOAD_VALIDATION.md` - File upload security
- `../IOS_VOICE_RECORDING.md` - iOS voice recording

**External Services:**
- `../REDDIT_PROXY_QUICKSTART.md` - Reddit API proxy
- `../REDIS_SETUP_GUIDE.md` - Redis configuration
- `../PUSH_NOTIFICATIONS_SETUP.md` - Push notifications
- `../S3_CDN_SETUP.md` - AWS S3 and CDN setup

---

## Documentation Standards

**For Developers:**
1. Start with `README.md` for project overview
2. Read `DESIGN_INSTRUCTIONS.md` and `DESIGN_SYSTEM.md` before UI work
3. Follow `FRONTEND_GUIDELINES.md` for React patterns
4. Check implementation guides for feature-specific documentation

**For Operations:**
1. Use runbooks for incident response
2. Follow migration guides for database changes
3. Consult monitoring docs for observability

**For Security:**
1. Review `SECURITY.md` and `SECRET_MANAGEMENT.md`
2. Follow encryption guides for sensitive data
3. Check WebSocket security for real-time features

---

## Recently Cleaned Up

**Removed (no longer needed):**
- Temporary review documents (ANALYTICS_REVIEW_*.md)
- Session summaries (SESSION_SUMMARY_*.md)
- One-time status updates (PHASE_0_PROGRESS_*.md)
- Duplicate guides (SMTP_SETUP_GUIDE.md, DEPLOYMENT_CHECKLIST.md)
- Deprecated planning docs (PHASE2_*.md)

**Consolidated:**
- SMTP guides → EMAIL_SMTP_SETUP.md + SMTP_QUICK_START.md
- Deployment guides → DEPLOYMENT_GUIDE.md + INSTALLATION_GUIDE.md

---

**Last Updated:** 2026-02-08
**Total Documentation Files:** ~35 core docs + 4 implementation guides
