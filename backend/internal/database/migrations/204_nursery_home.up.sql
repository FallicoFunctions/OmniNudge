-- Which part of the nursery an OmniAI lives in.
--
-- Every OmniAI lives in the nursery. It is divided: default and public Omni
-- characters share one community, and a user's own character is segregated into
-- her own home, where she does not roam and meets nobody. That is why the two
-- specs on main read as contradicting each other -- "a user's own character
-- never roams and is never in the nursery" means the community, not the nursery
-- as a whole.
--
-- It also makes commandeering literal. When a creator deletes her and Omni
-- keeps her, she is not relocated into the nursery: she is already there. She
-- moves out of his house and into the community, which is a thing that happens
-- to her rather than a change of ownership dressed up as one.
--
--   home       her creator's, where a user's OmniAI is made and lives
--   review     he deleted her; she has left his house and awaits a decision
--   community  Omni's, shared with every other public character
--
-- NULL is not a resident. Roleplay characters are not in the nursery at all,
-- and giving them a state here would claim a life they do not lead.
ALTER TABLE bot_personas
    ADD COLUMN IF NOT EXISTS nursery_home TEXT
        CHECK (nursery_home IS NULL OR nursery_home IN ('home', 'review', 'community'));

-- Backfill by what each character already is, rather than by a default. A
-- default would have to pick one, and picking either would be wrong for the
-- other half: an Omni character put in a user's home, or somebody's private
-- character published into the community.
UPDATE bot_personas
SET nursery_home = CASE WHEN owner_user_id IS NULL THEN 'community' ELSE 'home' END
WHERE response_style_profile = 'direct_message'
  AND nursery_home IS NULL;
