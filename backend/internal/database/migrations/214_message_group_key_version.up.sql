-- A group message is sealed under one shared key version, and a reader needs to
-- know which one before it can choose a copy to open it with. The version
-- travels in the envelope the client writes, but it is recorded here too so the
-- server can answer "which key does this message need" without opening anything.
--
-- NULL for every message that is not sealed under a group key, which is every
-- message that exists today.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS group_key_version INTEGER;

COMMENT ON COLUMN messages.group_key_version IS
  'The group key version this message was sealed under; NULL for direct and mod mail messages';
