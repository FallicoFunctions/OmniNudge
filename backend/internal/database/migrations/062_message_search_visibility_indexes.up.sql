-- Improve message search visibility-path performance (F0-003)
-- These indexes target the common OR predicate:
-- (sender_id = $user AND deleted_for_sender = false)
-- OR (recipient_id = $user AND deleted_for_recipient = false)
-- with ORDER BY sent_at DESC, id DESC and LIMIT/OFFSET pagination.

CREATE INDEX IF NOT EXISTS idx_messages_sender_visible_sent_at
ON messages (sender_id, sent_at DESC, id DESC)
WHERE deleted_for_sender = FALSE;

CREATE INDEX IF NOT EXISTS idx_messages_recipient_visible_sent_at
ON messages (recipient_id, sent_at DESC, id DESC)
WHERE deleted_for_recipient = FALSE;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent_at
ON messages (conversation_id, sent_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_recipient_sent_at
ON messages (conversation_id, recipient_id, sent_at DESC, id DESC);
