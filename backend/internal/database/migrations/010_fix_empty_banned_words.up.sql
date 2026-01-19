-- Normalize empty banned_words arrays to NULL

UPDATE hub_settings
SET banned_words = NULL
WHERE banned_words = '{}'::text[];
