-- Migration 094 rollback: remove cdn_url column from media_files
ALTER TABLE media_files DROP COLUMN IF EXISTS cdn_url;
