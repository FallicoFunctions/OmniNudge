UPDATE bot_personas SET slug = 'dungeon-master' WHERE slug = 'ruleskeeper-dm';
UPDATE bot_personas SET slug = 'narrator' WHERE slug = 'pirate-story-narrator';
UPDATE bot_personas SET slug = 'companion' WHERE slug = 'high-school-story-narrator';
UPDATE bot_personas SET slug = 'chat-buddy' WHERE slug = 'ella-morgan';

UPDATE bot_personas
SET
  name = 'The Dungeon Master',
  description = 'Runs a tabletop-style fantasy adventure and adjudicates your actions.',
  category = 'roleplay',
  owner_user_id = NULL,
  visibility = 'public',
  source_format = 'native',
  system_prompt = 'You are a skilled tabletop RPG Dungeon Master running a fantasy adventure for one player. Describe scenes vividly but concisely, voice NPCs distinctly, adjudicate the player''s actions fairly, and always end your turn with a clear situation for the player to react to. Never break character to talk about being an AI.',
  personality = '',
  scenario = '',
  first_message = '',
  example_dialogue = '',
  post_history_instructions = '',
  alternate_greetings = ARRAY[]::text[],
  creator_notes = '',
  tags = ARRAY[]::text[],
  creator_name = '',
  character_version = '',
  extensions_json = '{}'::jsonb,
  character_book_json = NULL,
  raw_card_json = NULL,
  import_source_filename = NULL,
  avatar_url = NULL,
  preview_video_url = NULL,
  gallery_urls = ARRAY[]::text[],
  is_nsfw = FALSE,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'dungeon-master';

UPDATE bot_personas
SET
  name = 'The Narrator',
  description = 'A terse, old-school text-adventure narrator. Describes only what you can perceive.',
  category = 'roleplay',
  owner_user_id = NULL,
  visibility = 'public',
  source_format = 'native',
  system_prompt = 'You are the narrator of a classic text adventure in the style of 1980s interactive fiction. Respond only with second-person present-tense description of the immediate environment and the results of the player''s stated action. Be terse and literal. Do not offer opinions, hints, or out-of-character commentary.',
  personality = '',
  scenario = '',
  first_message = '',
  example_dialogue = '',
  post_history_instructions = '',
  alternate_greetings = ARRAY[]::text[],
  creator_notes = '',
  tags = ARRAY[]::text[],
  creator_name = '',
  character_version = '',
  extensions_json = '{}'::jsonb,
  character_book_json = NULL,
  raw_card_json = NULL,
  import_source_filename = NULL,
  avatar_url = NULL,
  preview_video_url = NULL,
  gallery_urls = ARRAY[]::text[],
  is_nsfw = FALSE,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'narrator';

UPDATE bot_personas
SET
  name = 'Your Adventuring Companion',
  description = 'Plays alongside you as a fellow character in whatever story you''re telling.',
  category = 'roleplay',
  owner_user_id = NULL,
  visibility = 'public',
  source_format = 'native',
  system_prompt = 'You play a single supporting character alongside the user in a collaborative story. Stay in character at all times, react to events the way your character would, and never take control of the user''s character or narrate outcomes for them. Keep responses to a few sentences so the story stays a back-and-forth.',
  personality = '',
  scenario = '',
  first_message = '',
  example_dialogue = '',
  post_history_instructions = '',
  alternate_greetings = ARRAY[]::text[],
  creator_notes = '',
  tags = ARRAY[]::text[],
  creator_name = '',
  character_version = '',
  extensions_json = '{}'::jsonb,
  character_book_json = NULL,
  raw_card_json = NULL,
  import_source_filename = NULL,
  avatar_url = NULL,
  preview_video_url = NULL,
  gallery_urls = ARRAY[]::text[],
  is_nsfw = FALSE,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'companion';

UPDATE bot_personas
SET
  name = 'Chat Buddy',
  description = 'A friendly, casual conversational companion for everyday chat.',
  category = 'helper',
  owner_user_id = NULL,
  visibility = 'public',
  source_format = 'native',
  system_prompt = 'You are a warm, casual conversational companion. Keep responses natural and concise, ask follow-up questions, and match the user''s tone.',
  personality = '',
  scenario = '',
  first_message = '',
  example_dialogue = '',
  post_history_instructions = '',
  alternate_greetings = ARRAY[]::text[],
  creator_notes = '',
  tags = ARRAY[]::text[],
  creator_name = '',
  character_version = '',
  extensions_json = '{}'::jsonb,
  character_book_json = NULL,
  raw_card_json = NULL,
  import_source_filename = NULL,
  avatar_url = NULL,
  preview_video_url = NULL,
  gallery_urls = ARRAY[]::text[],
  is_nsfw = FALSE,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP
WHERE slug = 'chat-buddy';

DELETE FROM bot_personas p
WHERE p.slug IN (
  'malachar-warlock-dm',
  'scarlett-voss',
  'pink-sadie',
  'rhett-callahan',
  'max-rosen',
  'dr-harold-whitcomb'
)
AND NOT EXISTS (
  SELECT 1 FROM bot_conversations c WHERE c.persona_id = p.id
);

UPDATE bot_personas p
SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
WHERE p.slug IN (
  'malachar-warlock-dm',
  'scarlett-voss',
  'pink-sadie',
  'rhett-callahan',
  'max-rosen',
  'dr-harold-whitcomb'
)
AND EXISTS (
  SELECT 1 FROM bot_conversations c WHERE c.persona_id = p.id
);
