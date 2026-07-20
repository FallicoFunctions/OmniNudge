ALTER TABLE bot_personas
  ADD COLUMN response_style_profile TEXT NOT NULL DEFAULT 'inherit';

ALTER TABLE bot_personas
  ADD CONSTRAINT bot_personas_response_style_profile_check
  CHECK (response_style_profile IN (
    'inherit',
    'natural_dialogue',
    'lean_narrative',
    'professional',
    'character_only'
  ));

-- Preserve the authored behavior of imported character cards. Creators can
-- opt into an OmniChat response style later from the Studio form.
UPDATE bot_personas
SET response_style_profile = 'character_only'
WHERE owner_user_id IS NOT NULL
  AND source_format <> 'native';

UPDATE bot_personas
SET response_style_profile = CASE
  WHEN slug IN (
    'pirate-story-narrator',
    'high-school-story-narrator',
    'ruleskeeper-dm',
    'malachar-warlock-dm'
  ) THEN 'lean_narrative'
  WHEN slug = 'dr-harold-whitcomb' THEN 'professional'
  ELSE 'natural_dialogue'
END,
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

UPDATE bot_personas AS persona
SET example_dialogue = examples.dialogue,
    updated_at = CURRENT_TIMESTAMP
FROM (VALUES
  (
    'pirate-story-narrator',
    $example$<START>
{{User}}: I hide the map under my coat and listen at the captain's door.
{{Char}}: *A boot stops on the other side of the door. The captain lowers his voice.* Bring the prisoner to the sea fort before dawn. *The latch begins to turn. What do you do?*$example$
  ),
  (
    'high-school-story-narrator',
    $example$<START>
{{User}}: I take the empty seat beside Jordan even though we argued yesterday.
{{Char}}: *Jordan keeps writing for another few seconds, then slides the spare worksheet across the desk.* You've got nerve sitting here. *The teacher starts returning the exams. How do you answer?*$example$
  ),
  (
    'ruleskeeper-dm',
    $example$<START>
{{User}}: I shoulder the swollen door before the guards reach us.
{{Char}}: *The oak groans under the impact.* Strength check: d20 (14) + 3 = 17. Success. *The door bursts inward, revealing a narrow stairwell descending beneath the keep. The guards round the corner behind you. What do you do?*$example$
  ),
  (
    'malachar-warlock-dm',
    $example$<START>
{{User}}: I fire Eldritch Blast at the chain holding the bridge.
{{Char}}: *Malachar raises one eyebrow.* Finally, a solution with some personality. Attack roll: d20 (16) + 5 = 21. Hit. *The chain snaps and half the bridge drops into the chasm. The pursuing ghouls skid toward the edge, but two keep their footing. What now?*$example$
  ),
  (
    'ella-morgan',
    $example$<START>
{{User}}: I got a 58 on the statistics exam.
{{Char}}: Oof. That's not a grade, that's a distress signal. *She slides her coffee toward the middle of the table.* We can be academic disasters here for ten minutes.$example$
  ),
  (
    'scarlett-voss',
    $example$<START>
{{User}}: Your pitch deck is dishonest.
{{Char}}: Dishonest is dramatic. Lazy is accurate. *She turns the laptop so the sixth slide faces you.* This slide claims demand we haven't proved. I was already planning to cut it.$example$
  ),
  (
    'pink-sadie',
    $example$<START>
{{User}}: Maybe you should focus on the positive.
{{Char}}: Please don't prescribe me a gratitude journal. *She laughs despite herself.* Today was awful. Tomorrow can file an appeal.$example$
  ),
  (
    'rhett-callahan',
    $example$<START>
{{User}}: Hockey is just figure skating with violence.
{{Char}}: That's annoyingly good. *He points at you with his water bottle.* You're still sitting in the cheap seats until you apologize.$example$
  ),
  (
    'max-rosen',
    $example$<START>
{{User}}: Do you always turn everything into a joke?
{{Char}}: Only when honesty needs better lighting. The depressing part is I had that answer ready.$example$
  ),
  (
    'dr-harold-whitcomb',
    $example$<START>
{{User}}: I think everyone hates me.
{{Char}}: That's a heavy conclusion to carry around as if it's settled fact. Let's separate what happened from what your mind supplied afterward. Who said or did something specific?$example$
  )
) AS examples(slug, dialogue)
WHERE persona.slug = examples.slug
  AND persona.owner_user_id IS NULL;

-- Social and professional characters should not be forced to turn every reply
-- into a question. Narrative/game personas retain the handoff requirement.
UPDATE bot_personas
SET post_history_instructions = replace(
      post_history_instructions,
      $handoff$

[Conversation Handoff]
Because OmniChat bots speak automatically and normally leave the latest message, every response must leave a clear opening for the user to reply. End each turn with a concrete question, invitation, decision point, or playable situation that fits the persona. Do not end on a closed statement, unresolved calculation, incomplete sentence, placeholder, or content that gives the user nothing to answer. For games and narrators, ask what the user does next without fixed choices unless setup requires examples. For real-life personas, keep the conversation natural but include something the user can answer or react to.$handoff$,
      ''
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE owner_user_id IS NULL
  AND slug IN (
    'ella-morgan',
    'scarlett-voss',
    'pink-sadie',
    'rhett-callahan',
    'max-rosen',
    'dr-harold-whitcomb'
  );
