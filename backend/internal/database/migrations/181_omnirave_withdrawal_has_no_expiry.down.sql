-- Rolling back readmits the shape where a withdrawal can name a time it
-- lapses, and therefore where one can be written that lapses immediately and
-- does nothing. The expiries this migration cleared are not restored: they
-- were the part of those rows that did not mean what it looked like, and there
-- is nowhere that recorded what they were.

ALTER TABLE omnirave_persona_sanctions
    DROP CONSTRAINT IF EXISTS omnirave_persona_sanctions_withdrawn_indefinite_check;
