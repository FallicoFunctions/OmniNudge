-- Remove access request cooldown setting from hub settings

ALTER TABLE public.hub_settings
DROP COLUMN IF EXISTS access_request_cooldown_days;
