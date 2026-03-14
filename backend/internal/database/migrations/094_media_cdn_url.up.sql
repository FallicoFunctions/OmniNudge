-- Migration 094: add cdn_url column to media_files for CloudFront / CDN asset URLs
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS cdn_url TEXT;
