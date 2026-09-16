-- The server no longer decrypts anything to build a data export, so it keeps
-- no temporary copy of a group key. The export carries ciphertext and the
-- owner's device opens it.
--
-- Nothing has written this table since the export stopped decrypting, and the
-- rows it held were short lived by design.
DROP INDEX IF EXISTS idx_export_session_key_export;
DROP INDEX IF EXISTS idx_export_session_key_expires;
DROP TABLE IF EXISTS export_session_keys;
