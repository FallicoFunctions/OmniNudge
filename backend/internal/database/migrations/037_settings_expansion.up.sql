-- Expand user_settings to support F0-005: Settings Page/System.
-- Adds cross-device persisted preferences and notification controls.

ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS use_relative_time boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS auto_close_theme_selector boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS notify_archived_messages boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS notify_removed_saved_posts boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS default_omni_posts_only boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS stay_on_post_after_hide boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS use_infinite_scroll_home boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS use_infinite_scroll_hubs boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS use_infinite_scroll_subs boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS use_infinite_scroll boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS search_include_nsfw_by_default boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS block_all_nsfw boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS block_nsfw_thumbnails boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS access_request_cooldown_display varchar(10) DEFAULT 'days' NOT NULL,
ADD COLUMN IF NOT EXISTS font_size varchar(10) DEFAULT 'medium' NOT NULL,
ADD COLUMN IF NOT EXISTS transcription_opt_in boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS mic_device_id varchar(255) DEFAULT '' NOT NULL,
ADD COLUMN IF NOT EXISTS camera_device_id varchar(255) DEFAULT '' NOT NULL,
ADD COLUMN IF NOT EXISTS speaker_device_id varchar(255) DEFAULT '' NOT NULL,
ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS quiet_hours_start_minutes integer DEFAULT 1320 NOT NULL,
ADD COLUMN IF NOT EXISTS quiet_hours_end_minutes integer DEFAULT 420 NOT NULL,
ADD COLUMN IF NOT EXISTS quiet_hours_timezone varchar(64) DEFAULT 'UTC' NOT NULL;

ALTER TABLE public.user_settings
ADD CONSTRAINT user_settings_access_request_cooldown_display_check
CHECK (access_request_cooldown_display IN ('days', 'date', 'both'));

ALTER TABLE public.user_settings
ADD CONSTRAINT user_settings_font_size_check
CHECK (font_size IN ('small', 'medium', 'large'));

ALTER TABLE public.user_settings
ADD CONSTRAINT user_settings_quiet_hours_start_minutes_check
CHECK (quiet_hours_start_minutes >= 0 AND quiet_hours_start_minutes <= 1439);

ALTER TABLE public.user_settings
ADD CONSTRAINT user_settings_quiet_hours_end_minutes_check
CHECK (quiet_hours_end_minutes >= 0 AND quiet_hours_end_minutes <= 1439);
