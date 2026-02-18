-- Enforce the per-message unique emoji cap at the database layer.
-- This prevents direct SQL writes from bypassing the application-level guard.

CREATE OR REPLACE FUNCTION enforce_message_reactions_unique_emoji_cap()
RETURNS TRIGGER AS $$
DECLARE
    distinct_emoji_count INTEGER;
    emoji_already_exists BOOLEAN;
BEGIN
    -- No-op updates do not need cap checks.
    IF TG_OP = 'UPDATE' AND NEW.message_id = OLD.message_id AND NEW.emoji = OLD.emoji THEN
        RETURN NEW;
    END IF;

    -- If this emoji already exists on the target message, the distinct count
    -- does not increase, so the cap cannot be violated.
    SELECT EXISTS (
        SELECT 1
        FROM message_reactions
        WHERE message_id = NEW.message_id
          AND emoji = NEW.emoji
          AND id <> COALESCE(NEW.id, -1)
    )
    INTO emoji_already_exists;

    IF emoji_already_exists THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(DISTINCT emoji)
    INTO distinct_emoji_count
    FROM message_reactions
    WHERE message_id = NEW.message_id
      AND id <> COALESCE(NEW.id, -1);

    IF distinct_emoji_count >= 10 THEN
        RAISE EXCEPTION 'message % already has the maximum of 10 unique emoji reactions', NEW.message_id
            USING ERRCODE = '23514',
                  CONSTRAINT = 'message_reactions_max_unique_emoji_per_message';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_reactions_unique_emoji_cap ON message_reactions;

CREATE TRIGGER trg_message_reactions_unique_emoji_cap
BEFORE INSERT OR UPDATE OF message_id, emoji ON message_reactions
FOR EACH ROW
EXECUTE FUNCTION enforce_message_reactions_unique_emoji_cap();
