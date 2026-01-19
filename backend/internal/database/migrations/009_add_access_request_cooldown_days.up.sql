-- Add access request cooldown setting to hub settings

ALTER TABLE public.hub_settings
ADD COLUMN IF NOT EXISTS access_request_cooldown_days integer DEFAULT 0;
