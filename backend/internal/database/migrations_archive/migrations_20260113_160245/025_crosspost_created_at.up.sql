-- Add column to track when a crosspost was created on Omni
ALTER TABLE platform_posts
    ADD COLUMN crossposted_at TIMESTAMPTZ;

-- Backfill existing crossposts so they at least reflect their stored creation time
UPDATE platform_posts
SET crossposted_at = created_at
WHERE crosspost_origin_type IS NOT NULL
  AND crossposted_at IS NULL;
