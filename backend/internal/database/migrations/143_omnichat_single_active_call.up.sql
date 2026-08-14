-- A user has one active OmniChat call across devices. Normalize any sessions
-- left active by older clients before enforcing the invariant.
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY last_activity_at DESC, started_at DESC, id DESC) AS position
    FROM omnichat_call_sessions
    WHERE status = 'active'
)
UPDATE omnichat_call_sessions AS sessions
SET status = 'ended', ended_at = NOW(), last_activity_at = NOW()
FROM ranked
WHERE sessions.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_omnichat_call_sessions_one_active_user
    ON omnichat_call_sessions(user_id)
    WHERE status = 'active';
