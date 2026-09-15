-- Restores the old constraints. Key versions whose maker's account is gone
-- cannot satisfy NOT NULL again and are removed; members lose those versions.
UPDATE group_encryption_keys SET encrypted_group_key = '' WHERE encrypted_group_key IS NULL;
ALTER TABLE group_encryption_keys
    ALTER COLUMN encrypted_group_key SET NOT NULL;

DELETE FROM group_encryption_keys WHERE created_by IS NULL;
ALTER TABLE group_encryption_keys
    ALTER COLUMN created_by SET NOT NULL;

COMMENT ON COLUMN group_encryption_keys.encrypted_group_key IS 'AES-256 group key encrypted with creator''s RSA public key (for backup)';
COMMENT ON COLUMN group_encryption_keys.is_active IS 'Only one key should be active per conversation at a time';
COMMENT ON COLUMN group_key_members.encrypted_key_for_user IS 'Group AES key encrypted with user''s RSA public key';
