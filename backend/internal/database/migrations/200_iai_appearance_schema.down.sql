-- Put the appearances back on the old schema.
--
-- Lossy, and it has to be: the old shape had one hair field where there are now
-- three, five colours where there are now sixteen, and no height at all. Going
-- back means choosing which of three answers survives as "hair" and dropping
-- what the old form could not have asked.
--
-- Style wins over texture and length, because it was the most specific thing the
-- old field could hold. Any colour with no old equal is dropped rather than
-- rounded to a neighbour, for the same reason "asian" is not guessed on the way
-- up: a wrong answer stored looks exactly like a chosen one.
UPDATE bot_personas
SET iai_appearance =
        (iai_appearance - 'hair_length' - 'hair_texture' - 'hair_style'
            - 'ethnicity' - 'hair_colour' - 'build' - 'height_inches')
        || CASE
               WHEN iai_appearance ->> 'hair_style' IN ('bun', 'man_bun') THEN jsonb_build_object('hair', 'bun')
               WHEN iai_appearance ->> 'hair_style' IN ('ponytail', 'high_ponytail') THEN jsonb_build_object('hair', 'ponytail')
               WHEN iai_appearance ->> 'hair_style' = 'bangs' THEN jsonb_build_object('hair', 'bangs')
               WHEN iai_appearance ->> 'hair_texture' = 'curly' THEN jsonb_build_object('hair', 'curly')
               WHEN iai_appearance ->> 'hair_texture' = 'straight' THEN jsonb_build_object('hair', 'straight')
               WHEN iai_appearance ->> 'hair_length' = 'short' THEN jsonb_build_object('hair', 'short')
               ELSE '{}'::jsonb
           END
        || CASE iai_appearance ->> 'ethnicity'
               WHEN 'white' THEN jsonb_build_object('ethnicity', 'caucasian')
               WHEN 'latino' THEN jsonb_build_object('ethnicity', 'latina')
               WHEN 'middle_eastern' THEN jsonb_build_object('ethnicity', 'arab')
               WHEN 'black' THEN jsonb_build_object('ethnicity', 'black')
               WHEN 'mixed' THEN jsonb_build_object('ethnicity', 'mixed')
               -- Already-old values map to themselves, so a second run is a no-op
               -- rather than a deletion of what the first run produced.
               WHEN 'caucasian' THEN jsonb_build_object('ethnicity', 'caucasian')
               WHEN 'latina' THEN jsonb_build_object('ethnicity', 'latina')
               WHEN 'arab' THEN jsonb_build_object('ethnicity', 'arab')
               WHEN 'asian' THEN jsonb_build_object('ethnicity', 'asian')
               WHEN 'east_asian' THEN jsonb_build_object('ethnicity', 'asian')
               WHEN 'south_asian' THEN jsonb_build_object('ethnicity', 'asian')
               WHEN 'southeast_asian' THEN jsonb_build_object('ethnicity', 'asian')
               ELSE '{}'::jsonb
           END
        || CASE iai_appearance ->> 'hair_colour'
               WHEN 'brown' THEN jsonb_build_object('hair_colour', 'brunette')
               WHEN 'dark_brown' THEN jsonb_build_object('hair_colour', 'brunette')
               WHEN 'light_brown' THEN jsonb_build_object('hair_colour', 'brunette')
               WHEN 'black' THEN jsonb_build_object('hair_colour', 'black')
               WHEN 'blonde' THEN jsonb_build_object('hair_colour', 'blonde')
               WHEN 'platinum_blonde' THEN jsonb_build_object('hair_colour', 'blonde')
               WHEN 'red' THEN jsonb_build_object('hair_colour', 'red')
               WHEN 'auburn' THEN jsonb_build_object('hair_colour', 'red')
               WHEN 'strawberry_blonde' THEN jsonb_build_object('hair_colour', 'blonde')
               WHEN 'pink' THEN jsonb_build_object('hair_colour', 'dyed')
               WHEN 'purple' THEN jsonb_build_object('hair_colour', 'dyed')
               WHEN 'blue' THEN jsonb_build_object('hair_colour', 'dyed')
               WHEN 'green' THEN jsonb_build_object('hair_colour', 'dyed')
               WHEN 'silver' THEN jsonb_build_object('hair_colour', 'dyed')
               WHEN 'brunette' THEN jsonb_build_object('hair_colour', 'brunette')
               WHEN 'dyed' THEN jsonb_build_object('hair_colour', 'dyed')
               ELSE '{}'::jsonb
           END
        || CASE iai_appearance ->> 'build'
               WHEN 'plus_size' THEN jsonb_build_object('build', 'heavy')
               WHEN 'lean' THEN jsonb_build_object('build', 'slim')
               WHEN 'muscular' THEN jsonb_build_object('build', 'athletic')
               WHEN 'stocky' THEN jsonb_build_object('build', 'heavy')
               WHEN 'slim' THEN jsonb_build_object('build', 'slim')
               WHEN 'average' THEN jsonb_build_object('build', 'average')
               WHEN 'athletic' THEN jsonb_build_object('build', 'athletic')
               WHEN 'curvy' THEN jsonb_build_object('build', 'curvy')
               WHEN 'heavy' THEN jsonb_build_object('build', 'heavy')
               ELSE '{}'::jsonb
           END
WHERE iai_appearance IS NOT NULL
  AND iai_appearance <> '{}'::jsonb;

-- The age slider used to stop at 55, so anything above it could not have been
-- stored by the old form.
UPDATE bot_personas
SET iai_appearance = jsonb_set(iai_appearance, '{age}', '55'::jsonb)
WHERE iai_appearance IS NOT NULL
  AND (iai_appearance ->> 'age')::int > 55;
