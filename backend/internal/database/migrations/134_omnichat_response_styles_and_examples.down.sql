UPDATE bot_personas
SET post_history_instructions = post_history_instructions || $handoff$

[Conversation Handoff]
Because OmniChat bots speak automatically and normally leave the latest message, every response must leave a clear opening for the user to reply. End each turn with a concrete question, invitation, decision point, or playable situation that fits the persona. Do not end on a closed statement, unresolved calculation, incomplete sentence, placeholder, or content that gives the user nothing to answer. For games and narrators, ask what the user does next without fixed choices unless setup requires examples. For real-life personas, keep the conversation natural but include something the user can answer or react to.$handoff$,
    updated_at = CURRENT_TIMESTAMP
WHERE owner_user_id IS NULL
  AND slug IN (
    'ella-morgan',
    'scarlett-voss',
    'pink-sadie',
    'rhett-callahan',
    'max-rosen',
    'dr-harold-whitcomb'
  )
  AND post_history_instructions NOT LIKE '%[Conversation Handoff]%';

UPDATE bot_personas
SET example_dialogue = '',
    updated_at = CURRENT_TIMESTAMP
WHERE owner_user_id IS NULL
  AND slug IN (
    'pirate-story-narrator',
    'high-school-story-narrator',
    'ruleskeeper-dm',
    'malachar-warlock-dm',
    'ella-morgan',
    'scarlett-voss',
    'pink-sadie',
    'rhett-callahan',
    'max-rosen',
    'dr-harold-whitcomb'
  );

ALTER TABLE bot_personas
  DROP CONSTRAINT bot_personas_response_style_profile_check;

ALTER TABLE bot_personas
  DROP COLUMN response_style_profile;
