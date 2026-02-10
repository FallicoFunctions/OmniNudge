#!/bin/bash
#
# OmniNudge PostgreSQL Backup Script
#
# This script creates compressed backups of the PostgreSQL database
# and manages backup retention (default: 30 days)
#
# Usage:
#   ./backup-database.sh
#
# Cron schedule (daily at 2:00 AM):
#   0 2 * * * /path/to/backup-database.sh >> /var/log/postgres-backup.log 2>&1
#

set -e  # Exit on error
set -u  # Exit on undefined variable

# =============================================================================
# Configuration
# =============================================================================

DB_NAME="${POSTGRES_DB:-omninudge}"
DB_USER="${POSTGRES_USER:-omninudge_user}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgresql}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-}"  # Optional: s3://omninudge-backups/postgresql/

# =============================================================================
# Functions
# =============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

error() {
    log "ERROR: $1" >&2
    exit 1
}

# =============================================================================
# Pre-flight checks
# =============================================================================

# Check if pg_dump is available
if ! command -v pg_dump &> /dev/null; then
    error "pg_dump not found. Install PostgreSQL client tools."
fi

# Check if database is accessible
if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &> /dev/null; then
    error "Cannot connect to database $DB_NAME"
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# =============================================================================
# Backup
# =============================================================================

# Generate filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

log "Starting backup of database: $DB_NAME"
log "Backup file: $BACKUP_FILE"

# Perform backup
# --format=custom: PostgreSQL custom format (compressed, fast restore)
# --compress=9: Maximum compression
# --verbose: Show progress
PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    --verbose \
    --file="$BACKUP_FILE" 2>&1 | grep -v "^pg_dump:"

# Verify backup was created
if [ ! -f "$BACKUP_FILE" ]; then
    error "Backup file not created: $BACKUP_FILE"
fi

# Get backup size
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log "Backup successful: $BACKUP_FILE (Size: $SIZE)"

# =============================================================================
# Verify backup integrity
# =============================================================================

log "Verifying backup integrity..."

# Test that the backup can be listed (validates format)
if ! pg_restore --list "$BACKUP_FILE" &> /dev/null; then
    error "Backup verification failed: Cannot list backup contents"
fi

log "Backup verification passed"

# =============================================================================
# Upload to S3 (optional)
# =============================================================================

if [ -n "$S3_BUCKET" ]; then
    log "Uploading to S3: $S3_BUCKET"

    if command -v aws &> /dev/null; then
        aws s3 cp "$BACKUP_FILE" "$S3_BUCKET/" --storage-class STANDARD_IA
        log "S3 upload complete"
    else
        log "WARNING: aws CLI not found, skipping S3 upload"
    fi
fi

# =============================================================================
# Cleanup old backups
# =============================================================================

log "Cleaning up backups older than $RETENTION_DAYS days..."

# Count backups before cleanup
BEFORE=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f | wc -l)

# Delete old backups
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

# Count backups after cleanup
AFTER=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f | wc -l)
DELETED=$((BEFORE - AFTER))

log "Cleanup complete: Deleted $DELETED old backups, $AFTER backups remaining"

# =============================================================================
# Summary
# =============================================================================

log "Backup complete!"
log "============================================"
log "Database: $DB_NAME"
log "Backup file: $BACKUP_FILE"
log "Size: $SIZE"
log "Retention: $RETENTION_DAYS days"
log "Total backups: $AFTER"
log "============================================"

exit 0
