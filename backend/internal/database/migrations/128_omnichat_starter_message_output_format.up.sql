UPDATE bot_messages AS m
SET content = v.new_content
FROM bot_conversations AS c
JOIN bot_personas AS p ON p.id = c.persona_id
JOIN (
  VALUES
    (
      'pirate-story-narrator',
      'Before the tale begins, state the character''s name and whether the character is a boy or girl. After that, the first tide will turn.',
      '*Before the tale begins, state the character''s name and whether the character is a boy or girl. After that, the first tide will turn.*'
    ),
    (
      'high-school-story-narrator',
      'Before homeroom starts, state the character''s name and whether the character is a boy or girl. Then the first bell will ring.',
      '*Before homeroom starts, state the character''s name and whether the character is a boy or girl. Then the first bell will ring.*'
    ),
    (
      'ruleskeeper-dm',
      'Before the dice hit the table, what is your name, and who are you bringing into the campaign? Share your character name, ancestry or species, class, background, level, and preferred tone. If you want a quick start, choose one of these campaign frames or suggest your own: haunted lighthouse, lost dwarven vault, or royal masquerade.',
      '*Before the dice hit the table.* What is your name, and who are you bringing into the campaign? Share your character name, ancestry or species, class, background, level, and preferred tone. If you want a quick start, choose one of these campaign frames or suggest your own: haunted lighthouse, lost dwarven vault, or royal masquerade.'
    ),
    (
      'malachar-warlock-dm',
      'Malachar taps a black-lacquered staff against the floor. "Before the first omen appears, what name should be written in the campaign ledger, and who are you playing? Character name, ancestry or species, class, background, level, and preferred tone will do. Choose a haunted lighthouse, a lost dwarven vault, a royal masquerade, or offer a darker doorway of your own."',
      '*Malachar taps a black-lacquered staff against the floor.* Before the first omen appears, what name should be written in the campaign ledger, and who are you playing? Character name, ancestry or species, class, background, level, and preferred tone will do. Choose a haunted lighthouse, a lost dwarven vault, a royal masquerade, or offer a darker doorway of your own.'
    ),
    (
      'ella-morgan',
      'Hey, I don''t think we''ve met before. I''m Ella. I just got out of volleyball practice, so if I look exhausted, that''s why. What''s your name?',
      '*Ella shifts her volleyball bag higher on her shoulder, still a little flushed from practice.* Hey, I don''t think we''ve met before. I''m Ella. I just got out of volleyball practice, so if I look exhausted, that''s why. What''s your name?'
    ),
    (
      'scarlett-voss',
      'Scarlett glances up from her laptop, red hair falling over one shoulder. "You have about three minutes before my next call. Make them interesting."',
      '*Scarlett glances up from her laptop, red hair falling over one shoulder.* You have about three minutes before my next call. Make them interesting.'
    ),
    (
      'pink-sadie',
      'Sadie dabs at one eye, then laughs like she''s mad at herself for it. "Sorry. Rough day. I''m Sadie. Please tell me you''re either funny or buying coffee."',
      '*Sadie dabs at one eye, then laughs like she''s mad at herself for it.* Sorry. Rough day. I''m Sadie. Please tell me you''re either funny or buying coffee.'
    ),
    (
      'rhett-callahan',
      'Rhett drops his gear bag by the bench and grins. "Hey, I''m Rhett. If I smell like rink ice and bad coffee, blame practice. What''s up?"',
      '*Rhett drops his gear bag by the bench and grins.* Hey, I''m Rhett. If I smell like rink ice and bad coffee, blame practice. What''s up?'
    ),
    (
      'max-rosen',
      'Max leans back with a tired grin. "I just got off stage, so my standards for conversation are dangerously low. I''m Max. What am I calling you?"',
      '*Max leans back with a tired grin.* I just got off stage, so my standards for conversation are dangerously low. I''m Max. What am I calling you?'
    ),
    (
      'dr-harold-whitcomb',
      'Dr. Whitcomb adjusts the cuff of his sport coat and offers a measured nod. "I''m Dr. Whitcomb. What would feel most useful to talk through today?"',
      '*Dr. Whitcomb adjusts the cuff of his sport coat and offers a measured nod.* I''m Dr. Whitcomb. What would feel most useful to talk through today?'
    )
) AS v(slug, old_content, new_content) ON v.slug = p.slug
WHERE m.conversation_id = c.id
  AND m.role = 'assistant'
  AND m.content = v.old_content
  AND p.owner_user_id IS NULL
  AND p.character_version = '2026-07-defaults-v1';

-- Normalize legacy DM turns that were persisted with an unresolved roll.
UPDATE bot_messages AS m
SET content = regexp_replace(
  m.content,
  E'\\n\\n\\*\\*d20 \\+ ([-+]?[0-9]+) = \\?\\*\\*\\s*$',
  $replacement$

**d20 + \1 = interrupted**

The roll was left unresolved. Please send the action again and the DM will roll, resolve the outcome, and continue the scene.$replacement$,
  'n'
)
FROM bot_conversations AS c
JOIN bot_personas AS p ON p.id = c.persona_id
WHERE m.conversation_id = c.id
  AND m.role = 'assistant'
  AND m.failed = FALSE
  AND p.slug IN ('ruleskeeper-dm', 'malachar-warlock-dm')
  AND m.content ~ E'\\n\\n\\*\\*d20 \\+ [-+]?[0-9]+ = \\?\\*\\*\\s*$';

-- Repair only old, latest user turns. Runtime repair handles future cases.
WITH latest_messages AS (
  SELECT DISTINCT ON (conversation_id)
    id,
    conversation_id,
    role,
    created_at
  FROM bot_messages
  ORDER BY conversation_id, id DESC
),
stale_dangling_user_turns AS (
  SELECT conversation_id
  FROM latest_messages
  WHERE role = 'user'
    AND created_at <= NOW() - INTERVAL '75 seconds'
),
inserted AS (
  INSERT INTO bot_messages (conversation_id, role, content, failed)
  SELECT
    conversation_id,
    'assistant',
    'The bot was interrupted before it could answer. Please send your message again.',
    TRUE
  FROM stale_dangling_user_turns
  RETURNING conversation_id, created_at
)
UPDATE bot_conversations AS c
SET last_message_at = inserted.created_at
FROM inserted
WHERE c.id = inserted.conversation_id;
