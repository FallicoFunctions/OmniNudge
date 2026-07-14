ALTER TABLE bot_personas
  ADD COLUMN IF NOT EXISTS owner_user_id INT REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'unlisted')),
  ADD COLUMN IF NOT EXISTS source_format VARCHAR(20) NOT NULL DEFAULT 'native'
    CHECK (source_format IN ('native', 'chara_card_v1', 'chara_card_v2', 'chara_card_v3')),
  ADD COLUMN IF NOT EXISTS personality TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS scenario TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS first_message TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS example_dialogue TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS post_history_instructions TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS alternate_greetings TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS creator_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS creator_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS character_version TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS extensions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS character_book_json JSONB,
  ADD COLUMN IF NOT EXISTS raw_card_json JSONB,
  ADD COLUMN IF NOT EXISTS import_source_filename TEXT;

UPDATE bot_personas
SET
  personality = COALESCE(personality, ''),
  scenario = COALESCE(scenario, ''),
  first_message = COALESCE(first_message, ''),
  example_dialogue = COALESCE(example_dialogue, ''),
  post_history_instructions = COALESCE(post_history_instructions, ''),
  alternate_greetings = COALESCE(alternate_greetings, '{}'),
  creator_notes = COALESCE(creator_notes, ''),
  tags = COALESCE(tags, '{}'),
  creator_name = COALESCE(creator_name, ''),
  character_version = COALESCE(character_version, ''),
  extensions_json = COALESCE(extensions_json, '{}'::jsonb),
  visibility = COALESCE(visibility, 'public'),
  source_format = COALESCE(source_format, 'native');

CREATE INDEX IF NOT EXISTS idx_bot_personas_owner_user_id
  ON bot_personas(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_personas_visibility_active
  ON bot_personas(visibility, is_active, updated_at DESC);
