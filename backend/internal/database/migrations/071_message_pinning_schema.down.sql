DROP INDEX IF EXISTS idx_messages_conversation_pinned;

DROP TRIGGER IF EXISTS trg_messages_max_pinned_per_conversation ON messages;
DROP FUNCTION IF EXISTS enforce_messages_max_pinned_per_conversation();

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_pinned_state_consistency;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_pinned_by_fkey;

ALTER TABLE messages
  DROP COLUMN IF EXISTS pinned_at;

ALTER TABLE messages
  DROP COLUMN IF EXISTS pinned_by;

ALTER TABLE messages
  DROP COLUMN IF EXISTS pinned;

