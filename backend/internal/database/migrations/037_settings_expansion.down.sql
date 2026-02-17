-- Rollback settings expansion for F0-005: Settings Page/System.

ALTER TABLE public.user_settings
DROP CONSTRAINT IF EXISTS user_settings_access_request_cooldown_display_check;

ALTER TABLE public.user_settings
DROP CONSTRAINT IF EXISTS user_settings_font_size_check;

ALTER TABLE public.user_settings
DROP CONSTRAINT IF EXISTS user_settings_quiet_hours_start_minutes_check;

ALTER TABLE public.user_settings
DROP CONSTRAINT IF EXISTS user_settings_quiet_hours_end_minutes_check;

ALTER TABLE public.user_settings
DROP COLUMN IF EXISTS use_relative_time,
DROP COLUMN IF EXISTS auto_close_theme_selector,
DROP COLUMN IF EXISTS notify_archived_messages,
DROP COLUMN IF EXISTS notify_removed_saved_posts,
DROP COLUMN IF EXISTS default_omni_posts_only,
DROP COLUMN IF EXISTS stay_on_post_after_hide,
DROP COLUMN IF EXISTS use_infinite_scroll_home,
DROP COLUMN IF EXISTS use_infinite_scroll_hubs,
DROP COLUMN IF EXISTS use_infinite_scroll_subs,
DROP COLUMN IF EXISTS use_infinite_scroll,
DROP COLUMN IF EXISTS search_include_nsfw_by_default,
DROP COLUMN IF EXISTS block_all_nsfw,
DROP COLUMN IF EXISTS block_nsfw_thumbnails,
DROP COLUMN IF EXISTS access_request_cooldown_display,
DROP COLUMN IF EXISTS font_size,
DROP COLUMN IF EXISTS transcription_opt_in,
DROP COLUMN IF EXISTS mic_device_id,
DROP COLUMN IF EXISTS camera_device_id,
DROP COLUMN IF EXISTS speaker_device_id,
DROP COLUMN IF EXISTS quiet_hours_enabled,
DROP COLUMN IF EXISTS quiet_hours_start_minutes,
DROP COLUMN IF EXISTS quiet_hours_end_minutes,
DROP COLUMN IF EXISTS quiet_hours_timezone;
