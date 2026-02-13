-- Adds a user setting to control whether last_seen is exposed in public-facing APIs.

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS show_last_seen boolean;

ALTER TABLE public.user_settings
ALTER COLUMN show_last_seen SET DEFAULT true;

-- Ensure existing rows have a non-NULL value (and future reads are safe for bool scans).
UPDATE public.user_settings
SET show_last_seen = true
WHERE show_last_seen IS NULL;

ALTER TABLE public.user_settings
ALTER COLUMN show_last_seen SET NOT NULL;
