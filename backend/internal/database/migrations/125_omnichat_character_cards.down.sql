DROP INDEX IF EXISTS idx_bot_personas_visibility_active;
DROP INDEX IF EXISTS idx_bot_personas_owner_user_id;

ALTER TABLE bot_personas
  DROP COLUMN IF EXISTS import_source_filename,
  DROP COLUMN IF EXISTS raw_card_json,
  DROP COLUMN IF EXISTS character_book_json,
  DROP COLUMN IF EXISTS extensions_json,
  DROP COLUMN IF EXISTS character_version,
  DROP COLUMN IF EXISTS creator_name,
  DROP COLUMN IF EXISTS tags,
  DROP COLUMN IF EXISTS creator_notes,
  DROP COLUMN IF EXISTS alternate_greetings,
  DROP COLUMN IF EXISTS post_history_instructions,
  DROP COLUMN IF EXISTS example_dialogue,
  DROP COLUMN IF EXISTS first_message,
  DROP COLUMN IF EXISTS scenario,
  DROP COLUMN IF EXISTS personality,
  DROP COLUMN IF EXISTS source_format,
  DROP COLUMN IF EXISTS visibility,
  DROP COLUMN IF EXISTS owner_user_id;
