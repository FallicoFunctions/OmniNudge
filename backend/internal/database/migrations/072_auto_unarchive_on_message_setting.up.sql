ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS auto_unarchive_on_message boolean DEFAULT true NOT NULL;
