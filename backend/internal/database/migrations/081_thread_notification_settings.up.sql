-- Per-thread notification preferences (F7-010): mute/unmute notifications for a specific message thread.
CREATE TABLE IF NOT EXISTS public.thread_notification_settings (
    thread_root_id INTEGER NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    muted boolean NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (thread_root_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_notification_settings_user_muted
    ON public.thread_notification_settings(user_id, muted);
