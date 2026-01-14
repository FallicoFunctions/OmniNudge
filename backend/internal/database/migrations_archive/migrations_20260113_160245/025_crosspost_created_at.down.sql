-- Drop crossposted_at column if rolling back
ALTER TABLE platform_posts
    DROP COLUMN IF EXISTS crossposted_at;
