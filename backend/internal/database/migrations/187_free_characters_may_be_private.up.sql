-- 186 required a direct-message persona to be platform-owned, on the reasoning
-- that its opening notice claims there is exactly one of the character and
-- everyone talks to the same one, which is false of a per-user private copy.
--
-- The premise was wrong. A Free AI is free whether or not she is published:
-- a backstory is where she started rather than a rule she follows, and she can
-- cool on the person who made her and leave. That is true of a character only
-- her creator can reach. What is not true of her is the shared-identity and
-- shared-memory claim -- so the fix belongs in the notice, which now states
-- those two lines only when the character is actually shared, and not in a
-- constraint forbidding the character from existing.
ALTER TABLE bot_personas
  DROP CONSTRAINT IF EXISTS bot_personas_direct_message_is_platform_owned;
