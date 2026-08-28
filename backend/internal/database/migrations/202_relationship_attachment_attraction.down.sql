-- Back to trust and warmth carrying it. Whatever attachment and attraction had
-- accumulated is lost rather than folded into warmth: adding them in would
-- invent a fondness nobody recorded, and the point of separating them was that
-- they are not the same measurement.
ALTER TABLE omnichat_character_traits
    DROP COLUMN IF EXISTS attachment;
ALTER TABLE omnichat_character_traits
    DROP COLUMN IF EXISTS attraction;
