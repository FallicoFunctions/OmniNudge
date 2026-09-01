-- Move stored appearances onto the schema the form now asks for (§34, screen 3).
--
-- The JSONB column was chosen so a new question would not need a migration. A
-- question that changes shape still does: "hair" split into length, texture and
-- style, because one field made its own options compete -- curly is a texture
-- and ponytail is a shape, and a list holding both forces somebody to give up
-- one to say the other. Colours replaced people ("brunette" describes somebody,
-- not their hair) and the ethnicity list grew from six to eleven.
--
-- Left alone, every one of those keys would read as blank on the next load: an
-- answer somebody gave, silently becoming an answer they never gave.
--
-- Two values are deliberately dropped rather than guessed:
--
--   "dyed" said how a colour got there and never said which colour, so there is
--   nothing to carry forward.
--
--   "asian" has no equal in the new list, which asks for East, South or
--   Southeast. Picking one would put an answer in somebody's mouth that they
--   were never offered, and that is the same fault as a slider that silently
--   clamps. Blank reads as "not answered", which is true of a question that did
--   not exist when they filled the form in.
UPDATE bot_personas
SET omniai_appearance =
        (omniai_appearance - 'hair' - 'ethnicity' - 'hair_colour' - 'build')
        -- "hair" was three answers wearing one name. Each old value was really
        -- a length, a texture or a shape, so each lands on the axis it belonged
        -- to all along.
        || CASE omniai_appearance ->> 'hair'
               WHEN 'straight' THEN jsonb_build_object('hair_texture', 'straight')
               WHEN 'curly' THEN jsonb_build_object('hair_texture', 'curly')
               WHEN 'short' THEN jsonb_build_object('hair_length', 'short')
               WHEN 'bangs' THEN jsonb_build_object('hair_style', 'bangs')
               WHEN 'ponytail' THEN jsonb_build_object('hair_style', 'ponytail')
               WHEN 'bun' THEN CASE
                                   WHEN omniai_appearance ->> 'gender' = 'man'
                                       THEN jsonb_build_object('hair_style', 'man_bun')
                                   ELSE jsonb_build_object('hair_style', 'bun')
                   END
               ELSE '{}'::jsonb
           END
        -- Renames, one deliberate drop, and everything else passed through.
        --
        -- The pass-through is what makes a second run harmless. An earlier draft
        -- listed only the old values and dropped anything else, which meant a
        -- repeat pass saw the already-migrated "latino", matched nothing, and
        -- deleted the answer it had translated a moment earlier.
        || CASE
               WHEN omniai_appearance ->> 'ethnicity' IS NULL THEN '{}'::jsonb
               WHEN omniai_appearance ->> 'ethnicity' = 'caucasian' THEN jsonb_build_object('ethnicity', 'white')
               WHEN omniai_appearance ->> 'ethnicity' = 'latina' THEN jsonb_build_object('ethnicity', 'latino')
               WHEN omniai_appearance ->> 'ethnicity' = 'arab' THEN jsonb_build_object('ethnicity', 'middle_eastern')
               WHEN omniai_appearance ->> 'ethnicity' = 'asian' THEN '{}'::jsonb
               ELSE jsonb_build_object('ethnicity', omniai_appearance ->> 'ethnicity')
           END
        || CASE
               WHEN omniai_appearance ->> 'hair_colour' IS NULL THEN '{}'::jsonb
               WHEN omniai_appearance ->> 'hair_colour' = 'brunette' THEN jsonb_build_object('hair_colour', 'brown')
               WHEN omniai_appearance ->> 'hair_colour' = 'dyed' THEN '{}'::jsonb
               ELSE jsonb_build_object('hair_colour', omniai_appearance ->> 'hair_colour')
           END
        -- Build is gendered now. "Heavy" judges a woman's body where "plus size"
        -- describes it, and "curvy" says nothing useful about a man's shape.
        || CASE
               WHEN omniai_appearance ->> 'build' IS NULL THEN '{}'::jsonb
               WHEN omniai_appearance ->> 'build' = 'heavy' AND omniai_appearance ->> 'gender' <> 'man'
                   THEN jsonb_build_object('build', 'plus_size')
               WHEN omniai_appearance ->> 'build' = 'curvy' AND omniai_appearance ->> 'gender' = 'man'
                   THEN '{}'::jsonb
               ELSE jsonb_build_object('build', omniai_appearance ->> 'build')
           END
WHERE omniai_appearance IS NOT NULL
  AND omniai_appearance <> '{}'::jsonb;
