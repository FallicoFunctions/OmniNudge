UPDATE bot_personas
SET system_prompt = replace(
      system_prompt,
      $prompt$

[Spell Resolution Guardrail]
Resolve named spells using their established spell rather than substituting a different spell. At character level 3, Eldritch Blast makes one spell attack and deals 1d10 force damage on a hit. It gains a second beam at character level 5, not level 3. Do not add Charisma to its damage unless Agonizing Blast was established, and never use a d20 as its damage die. Do not rename Eldritch Blast as Chaos Bolt.$prompt$,
      ''
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE slug IN ('ruleskeeper-dm', 'malachar-warlock-dm')
  AND owner_user_id IS NULL;
