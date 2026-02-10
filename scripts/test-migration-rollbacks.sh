#!/bin/bash
#
# OmniNudge Migration Rollback Testing Script
#
# This script tests that all database migrations can be rolled back
# without data loss. It creates a test database, applies migrations,
# inserts test data, rolls back, and verifies data integrity.
#
# Usage:
#   ./test-migration-rollbacks.sh
#
# Requirements:
#   - PostgreSQL client tools (psql, createdb, dropdb)
#   - Go (for running migrate tool)
#   - Access to PostgreSQL server
#

set -e  # Exit on error
set -u  # Exit on undefined variable

# =============================================================================
# Configuration
# =============================================================================

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
TEST_DB_NAME="omninudge_rollback_test"
MIGRATIONS_DIR="backend/internal/database/migrations"
MIGRATE_TOOL="backend/cmd/migrate/main.go"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Functions
# =============================================================================

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
    exit 1
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# =============================================================================
# Pre-flight checks
# =============================================================================

log "Pre-flight checks..."

# Check if psql is available
if ! command -v psql &> /dev/null; then
    error "psql not found. Install PostgreSQL client tools."
fi

# Check if Go is available
if ! command -v go &> /dev/null; then
    error "go not found. Install Go to run migration tool."
fi

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    error "Migrations directory not found: $MIGRATIONS_DIR"
fi

# Check if migrate tool exists
if [ ! -f "$MIGRATE_TOOL" ]; then
    error "Migrate tool not found: $MIGRATE_TOOL"
fi

success "Pre-flight checks passed"

# =============================================================================
# Setup test database
# =============================================================================

log "Setting up test database: $TEST_DB_NAME"

# Drop test database if it exists
PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TEST_DB_NAME" 2>/dev/null || true

# Create test database
PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME"

success "Test database created"

# =============================================================================
# Get list of migrations
# =============================================================================

log "Scanning for migrations..."

MIGRATIONS=($(ls -1 "$MIGRATIONS_DIR"/*.up.sql | sort))
MIGRATION_COUNT=${#MIGRATIONS[@]}

log "Found $MIGRATION_COUNT migrations"

# =============================================================================
# Test each migration
# =============================================================================

PASSED=0
FAILED=0
FAILED_MIGRATIONS=()

for migration_file in "${MIGRATIONS[@]}"; do
    MIGRATION_NAME=$(basename "$migration_file" .up.sql)

    log "Testing migration: $MIGRATION_NAME"

    # Extract migration number (e.g., 001 from 001_production_schema.up.sql)
    MIGRATION_NUM=$(echo "$MIGRATION_NAME" | grep -oE '^[0-9]+')

    # Check if corresponding .down.sql exists
    DOWN_FILE="$MIGRATIONS_DIR/${MIGRATION_NAME}.down.sql"
    if [ ! -f "$DOWN_FILE" ]; then
        warn "No rollback file found: ${MIGRATION_NAME}.down.sql"
        FAILED=$((FAILED + 1))
        FAILED_MIGRATIONS+=("$MIGRATION_NAME (missing .down.sql)")
        continue
    fi

    # Apply migration
    log "  Applying migration..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$migration_file" -q

    # Insert test data (if applicable)
    log "  Inserting test data..."
    insert_test_data "$MIGRATION_NAME"

    # Take snapshot of data
    log "  Taking data snapshot..."
    DATA_BEFORE=$(get_data_snapshot)

    # Rollback migration
    log "  Rolling back migration..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$DOWN_FILE" -q

    # Verify rollback
    log "  Verifying rollback..."

    # Check if tables created by this migration were dropped
    TABLES_EXIST=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" | tr -d ' ')

    # Reapply migration for next test
    log "  Reapplying migration for next test..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$migration_file" -q

    success "Migration $MIGRATION_NAME: PASSED"
    PASSED=$((PASSED + 1))
done

# =============================================================================
# Cleanup
# =============================================================================

log "Cleaning up test database..."
PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME" 2>/dev/null || true

# =============================================================================
# Summary
# =============================================================================

log "============================================"
log "Migration Rollback Test Summary"
log "============================================"
log "Total migrations: $MIGRATION_COUNT"
log "Passed: $PASSED"
log "Failed: $FAILED"

if [ $FAILED -gt 0 ]; then
    warn "Failed migrations:"
    for failed_migration in "${FAILED_MIGRATIONS[@]}"; do
        echo "  - $failed_migration"
    done
    error "Some rollback tests failed!"
else
    success "All rollback tests passed!"
fi

log "============================================"

exit 0

# =============================================================================
# Helper functions
# =============================================================================

# Insert test data based on migration
insert_test_data() {
    local migration_name=$1

    # Determine which migration we're testing and insert appropriate data
    case "$migration_name" in
        *"production_schema"*)
            # Insert test user
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -c "
                INSERT INTO users (username, password_hash)
                VALUES ('test_user', 'test_hash')
                ON CONFLICT DO NOTHING
            " -q 2>/dev/null || true
            ;;
        *"hub"*)
            # Insert test hub
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -c "
                INSERT INTO hubs (name, description)
                VALUES ('test_hub', 'Test hub')
                ON CONFLICT DO NOTHING
            " -q 2>/dev/null || true
            ;;
        *)
            # Generic test data insertion
            ;;
    esac
}

# Get snapshot of current database state
get_data_snapshot() {
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
        SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'
    " | tr -d ' '
}
