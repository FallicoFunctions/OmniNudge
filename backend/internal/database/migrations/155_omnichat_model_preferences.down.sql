ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_tier_check;
ALTER TABLE bot_conversations DROP CONSTRAINT IF EXISTS bot_conversations_model_override_key_check;
ALTER TABLE bot_conversations DROP COLUMN IF EXISTS model_override_key;
DROP TABLE IF EXISTS omnichat_model_preferences;
