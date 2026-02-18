-- Roll back to the pre-lock function body used by migration 068.

CREATE OR REPLACE FUNCTION enforce_message_reactions_unique_emoji_cap()
RETURNS TRIGGER AS $$
DECLARE
    distinct_emoji_count INTEGER;
    emoji_already_exists BOOLEAN;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.message_id = OLD.message_id AND NEW.emoji = OLD.emoji THEN
        RETURN NEW;
    END IF;

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
