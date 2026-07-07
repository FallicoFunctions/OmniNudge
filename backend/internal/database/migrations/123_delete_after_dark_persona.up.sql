DELETE FROM bot_conversations
WHERE persona_id = (SELECT id FROM bot_personas WHERE slug = 'after-dark');

DELETE FROM bot_personas WHERE slug = 'after-dark';
