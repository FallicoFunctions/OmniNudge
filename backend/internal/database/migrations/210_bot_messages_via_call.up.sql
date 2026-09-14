-- A message said or typed during a live call. The chat marks these so a
-- conversation shows which turns happened on the phone.
ALTER TABLE bot_messages ADD COLUMN IF NOT EXISTS via_call BOOLEAN NOT NULL DEFAULT FALSE;
