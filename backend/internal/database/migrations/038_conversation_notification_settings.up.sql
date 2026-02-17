-- Per-conversation notification preferences (F0-005): mute/unmute conversation notifications.

CREATE TABLE IF NOT EXISTS public.conversation_notification_settings (
    conversation_id INTEGER NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    muted BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_notification_settings_user_muted
    ON public.conversation_notification_settings(user_id, muted);
