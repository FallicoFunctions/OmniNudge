# Migration Consolidation Guide

## Why Consolidate?

You currently have **48 migration files** from development. This creates problems:

### Problems with 48 Migrations:

1. **Conflicts** - Early migrations might create/modify things that later migrations change
   - Migration 5 adds a column → Migration 23 drops it
   - Migration 10 creates constraint → Migration 31 removes it
   - Running all 48 wastes time on intermediate states

2. **Slow** - Running 48 SQL files sequentially takes time

3. **Error-Prone** - Some migrations might fail on fresh databases because they assume intermediate state

4. **Hard to Debug** - Which of 48 files caused the error?

### Solution: One Production Schema

Since you're deploying to production for the **first time** (no existing users/data), you can:

✅ **Create ONE migration** with the final, current database schema
✅ **Archive old migrations** for historical reference
✅ **Start fresh** for future changes

## How to Consolidate

### Option 1: Automated Script (Recommended)

```bash
# On your Mac:
cd /Users/Nick_1/Documents/Personal_Projects/OmniNudge

# Make script executable
chmod +x scripts/consolidate-migrations.sh

# Run consolidation
bash scripts/consolidate-migrations.sh

# Follow prompts:
# - Database name: omninudge (or your dev db name)
# - Database user: (your username)
# - Confirm: y
```

**What this does:**

1. Dumps your current development database schema (structure only, no data)
2. Archives old 48 migrations to `migrations_archive/`
3. Creates new `001_production_schema.up.sql` with final schema
4. Creates `001_production_schema.down.sql` for rollback

### Option 2: Manual Consolidation

If you prefer manual control:

```bash
cd backend/internal/database

# 1. Archive old migrations
mkdir -p migrations_archive
cp -r migrations/ migrations_archive/migrations_$(date +%Y%m%d)/

# 2. Dump current schema from your dev database
pg_dump -U your_username -d omninudge \
  --schema-only \
  --no-owner \
  --no-privileges \
  -f production_schema.sql

# 3. Create new migrations directory
rm -rf migrations
mkdir migrations

# 4. Use the dump as your production schema
mv production_schema.sql migrations/001_production_schema.up.sql

# 5. Create rollback migration
cat > migrations/001_production_schema.down.sql <<'EOF'
DROP TABLE IF EXISTS post_votes CASCADE;
DROP TABLE IF EXISTS comment_votes CASCADE;
-- ... (add all your tables)
DROP EXTENSION IF EXISTS "uuid-ossp";
EOF
```

## Testing the Consolidated Schema

**Critical:** Test before deploying to production!

```bash
# Create fresh test database
createdb test_omninudge

# Apply consolidated schema
psql -d test_omninudge -f backend/internal/database/migrations/001_production_schema.up.sql

# Check tables were created
psql -d test_omninudge -c "\dt"

# Should show all your tables!

# Test rollback
psql -d test_omninudge -f backend/internal/database/migrations/001_production_schema.down.sql

# Check tables are gone
psql -d test_omninudge -c "\dt"

# Clean up test database
dropdb test_omninudge
```

## What Gets Consolidated

### Before (48 migrations):
```
migrations/
  001_initial_schema.up.sql
  002_votes.up.sql
  003_subreddits.up.sql
  004_reports.up.sql
  ...
  048_latest_feature.up.sql
```

### After (1 migration):
```
migrations/
  001_production_schema.up.sql      <- Final state of everything
  001_production_schema.down.sql    <- Drops everything

migrations_archive/
  migrations_20260109/              <- All old migrations (backup)
    001_initial_schema.up.sql
    002_votes.up.sql
    ...
```

## Deployment Changes

### Old Way (48 migrations):
```bash
# On production server - DON'T DO THIS
for file in migrations/*.up.sql; do
  psql -d omninudge -f "$file"
done
# Takes minutes, can fail partway through
```

### New Way (1 migration):
```bash
# On production server - DO THIS
psql -d omninudge -f migrations/001_production_schema.up.sql
# Takes seconds, clean
```

## Going Forward

### After Consolidation + Production Deploy

Once you consolidate and deploy to production, future changes work like this:

**Example: Add a new feature (e.g., user badges)**

```bash
# 1. Create new migration files
cat > backend/internal/database/migrations/002_user_badges.up.sql <<'EOF'
CREATE TABLE user_badges (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  badge_name VARCHAR(50),
  awarded_at TIMESTAMP DEFAULT NOW()
);
EOF

cat > backend/internal/database/migrations/002_user_badges.down.sql <<'EOF'
DROP TABLE IF EXISTS user_badges CASCADE;
EOF

# 2. Apply to dev database
psql -d omninudge -f migrations/002_user_badges.up.sql

# 3. Test the feature locally

# 4. Deploy to production (run just the new migration)
# On server:
psql -d omninudge -f migrations/002_user_badges.up.sql
```

**Key point:** Future migrations are incremental changes to production schema.

## Benefits for Your Production Deploy

### Before Consolidation:
- ⏱️ Run 48 migrations sequentially (~5-10 minutes)
- ❌ Risk of conflicts or failures
- 🤔 Hard to debug issues
- 📊 Applying intermediate states that get overwritten

### After Consolidation:
- ⚡ Run 1 migration (~10 seconds)
- ✅ Clean, final schema only
- 🔍 Easy to review entire schema
- 🎯 No wasted intermediate states

## Important Notes

### ✅ Safe to Consolidate If:
- First production deployment (no live users)
- No production data exists yet
- You have dev database with all 48 migrations applied

### ❌ Don't Consolidate If:
- Already have production users/data
- Running in production and need to preserve migration history
- Other team members are mid-migration on their dev databases

**For you:** You're doing first-ever production deployment, so **definitely consolidate!**

## Checklist

Before running consolidation:

- [ ] Development database has all 48 migrations applied
- [ ] Development database schema is final/correct
- [ ] You have a backup of your dev database (just in case)
- [ ] You've committed current code to git

Run consolidation:

- [ ] Run `consolidate-migrations.sh` script
- [ ] Review generated `001_production_schema.up.sql`
- [ ] Test on fresh database (see "Testing" section above)
- [ ] Verify all tables/indexes/constraints present

Update deployment docs/bootstrap scripts:

- [ ] Update bootstrap/deployment references so they match the current migration path and the canonical `RUNBOOK.md`
- [ ] Remove references to old migration runner (if any)
- [ ] Test full deployment on test server

## FAQ

### Q: Will I lose my migration history?

**A:** No! Old migrations are archived to `migrations_archive/`. You can always reference them.

### Q: What if I need to see how a feature evolved?

**A:** Check `migrations_archive/` to see the progression. Git history also shows this.

### Q: Can I go back to 48 migrations later?

**A:** Not recommended. Once production uses consolidated schema, stick with it. Add new migrations incrementally.

### Q: What about down migrations (rollbacks)?

**A:** The consolidated down migration drops everything (fresh start). Future incremental migrations have their own specific rollbacks.

### Q: Will this affect my local development?

**A:** Only if you drop and recreate your dev database. Otherwise, your dev db already has the final schema.

## Summary

**For first production deployment:**

1. ✅ **Consolidate 48 migrations → 1 migration**
2. ✅ **Archive old migrations** (keep for reference)
3. ✅ **Deploy clean schema** to production
4. ✅ **Future changes** = new incremental migrations

**This is standard practice and the right way to launch!**

Run the consolidation script now, test it, and you'll have a clean production deployment. 🚀
