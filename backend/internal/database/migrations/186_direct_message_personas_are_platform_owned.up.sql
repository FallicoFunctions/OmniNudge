-- A direct-message character opens with a notice telling the reader there is
-- exactly one of them and that everyone talks to the same one. On a persona
-- owned by a single user that statement is false, and it is false about
-- privacy, which is the worst thing to be wrong about. Make the shape the
-- notice describes the only shape the table can hold.
ALTER TABLE bot_personas
  ADD CONSTRAINT bot_personas_direct_message_is_platform_owned
  CHECK (response_style_profile <> 'direct_message' OR owner_user_id IS NULL);
