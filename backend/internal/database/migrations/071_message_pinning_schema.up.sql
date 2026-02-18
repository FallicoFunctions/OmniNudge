-- F2-001: Message pinning schema
-- Adds pin metadata columns and DB-level enforcement for max 10 pinned
-- messages per conversation.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS pinned boolean;

ALTER TABLE messages
  ALTER COLUMN pinned SET DEFAULT FALSE;

UPDATE messages
SET pinned = FALSE
WHERE pinned IS NULL;

ALTER TABLE messages
  ALTER COLUMN pinned SET NOT NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS pinned_by integer;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_pinned_by_fkey'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_pinned_by_fkey
      FOREIGN KEY (pinned_by) REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_pinned_state_consistency'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_pinned_state_consistency
      CHECK (
        (pinned = FALSE AND pinned_by IS NULL AND pinned_at IS NULL) OR
        (pinned = TRUE AND pinned_by IS NOT NULL AND pinned_at IS NOT NULL)
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_messages_max_pinned_per_conversation()
RETURNS trigger AS $$
DECLARE
  pinned_count integer;
BEGIN
  SELECT COUNT(*)
  INTO pinned_count
  FROM messages
  WHERE conversation_id = NEW.conversation_id
    AND pinned = TRUE
    AND id <> NEW.id;

  IF pinned_count >= 10 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'messages_max_pinned_per_conversation',
      MESSAGE = 'a conversation may have at most 10 pinned messages';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messages_max_pinned_per_conversation ON messages;

CREATE TRIGGER trg_messages_max_pinned_per_conversation
BEFORE INSERT OR UPDATE OF pinned, conversation_id ON messages
FOR EACH ROW
WHEN (NEW.pinned = TRUE)
EXECUTE FUNCTION enforce_messages_max_pinned_per_conversation();

CREATE INDEX IF NOT EXISTS idx_messages_conversation_pinned
  ON messages (conversation_id, pinned)
  WHERE pinned = TRUE;

