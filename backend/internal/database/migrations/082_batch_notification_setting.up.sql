-- Add notification batching preference for thread reply notifications.
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS batch_notifications boolean DEFAULT true NOT NULL;
