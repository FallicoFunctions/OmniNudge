#!/bin/bash
# Consolidate 48 migrations into one production-ready schema file

set -e

echo "================================"
echo "Migration Consolidation Script"
echo "================================"
echo ""

# Check if connected to development database
read -p "Enter your development database name (default: omninudge): " DEV_DB
DEV_DB=${DEV_DB:-omninudge}

read -p "Enter database user (default: your username): " DB_USER
DB_USER=${DB_USER:-$USER}

echo ""
echo "This will:"
echo "1. Dump current schema from '$DEV_DB' database"
echo "2. Create new production_schema.sql"
echo "3. Archive old migrations to migrations_archive/"
echo "4. Keep old files for reference"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

cd "$(dirname "$0")/../backend/internal/database"

# Create backup directory
echo ""
echo "Step 1: Creating archive directory..."
mkdir -p migrations_archive
timestamp=$(date +%Y%m%d_%H%M%S)

# Archive old migrations
echo "Step 2: Archiving old migrations..."
cp -r migrations/ "migrations_archive/migrations_${timestamp}/"
echo "✓ Old migrations backed up to: migrations_archive/migrations_${timestamp}/"

# Dump current schema (schema only, no data)
echo ""
echo "Step 3: Dumping current database schema..."
pg_dump -U "$DB_USER" -d "$DEV_DB" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --no-tablespaces \
  --no-comments \
  -f production_schema.sql

echo "✓ Schema dumped to: production_schema.sql"

# Create new migrations directory
echo ""
echo "Step 4: Creating new consolidated migration..."
rm -rf migrations
mkdir -p migrations

# Create the UP migration (apply schema)
cat > migrations/001_production_schema.up.sql <<EOF
-- OmniNudge Production Schema
-- Consolidated from 48 development migrations
-- Generated: $(date +%Y-%m-%d)
-- This represents the final state of all features in Phase 1

EOF

cat production_schema.sql >> migrations/001_production_schema.up.sql

# Create the DOWN migration (drop everything)
cat > migrations/001_production_schema.down.sql <<'EOF'
-- Drop all tables in reverse dependency order

-- Drop junction/mapping tables first
DROP TABLE IF EXISTS post_votes CASCADE;
DROP TABLE IF EXISTS comment_votes CASCADE;
DROP TABLE IF EXISTS user_blocked_users CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS notification_settings CASCADE;
DROP TABLE IF EXISTS hub_subscriptions CASCADE;
DROP TABLE IF EXISTS hub_moderators CASCADE;
DROP TABLE IF EXISTS saved_posts CASCADE;
DROP TABLE IF EXISTS saved_reddit_posts CASCADE;
DROP TABLE IF EXISTS saved_post_comments CASCADE;
DROP TABLE IF EXISTS saved_reddit_comments CASCADE;
DROP TABLE IF EXISTS hidden_posts CASCADE;
DROP TABLE IF EXISTS hidden_reddit_posts CASCADE;
DROP TABLE IF EXISTS slideshow_media_items CASCADE;
DROP TABLE IF EXISTS user_keys CASCADE;
DROP TABLE IF EXISTS reports CASCADE;

-- Drop main data tables
DROP TABLE IF EXISTS slideshow_sessions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS media_files CASCADE;
DROP TABLE IF EXISTS post_comments CASCADE;
DROP TABLE IF EXISTS platform_posts CASCADE;
DROP TABLE IF EXISTS hubs CASCADE;
DROP TABLE IF EXISTS hub_settings CASCADE;
DROP TABLE IF EXISTS hub_themes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop extensions
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS pg_trgm;

-- Drop types
DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS conversation_type CASCADE;
DROP TYPE IF EXISTS message_type CASCADE;
DROP TYPE IF EXISTS privacy_type CASCADE;
DROP TYPE IF EXISTS spam_filter_strength CASCADE;
DROP TYPE IF EXISTS moderator_role CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
EOF

echo "✓ Created: migrations/001_production_schema.up.sql"
echo "✓ Created: migrations/001_production_schema.down.sql"

# Clean up temp file
rm production_schema.sql

echo ""
echo "================================"
echo "✓ Migration consolidation complete!"
echo "================================"
echo ""
echo "Summary:"
echo "  - Old migrations: migrations_archive/migrations_${timestamp}/"
echo "  - New migration:  migrations/001_production_schema.up.sql"
echo "  - Rollback:       migrations/001_production_schema.down.sql"
echo ""
echo "Next steps:"
echo "1. Review the new migration file"
echo "2. Test on a fresh database:"
echo "   createdb test_omninudge"
echo "   psql -d test_omninudge -f migrations/001_production_schema.up.sql"
echo "3. Use this for production deployment"
echo ""
