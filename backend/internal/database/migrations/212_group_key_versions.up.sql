-- Group message keys, end to end: the server stores only one copy of each key
-- version per member (group_key_members), wrapped with that member's public
-- key. It keeps no copy of its own, so the old "backup" column goes unused.
ALTER TABLE group_encryption_keys
    ALTER COLUMN encrypted_group_key DROP NOT NULL;

-- created_by was NOT NULL but ON DELETE SET NULL, so deleting the account of a
-- member who made a key version failed. The version must outlive its maker:
-- the other members still read messages under it.
ALTER TABLE group_encryption_keys
    ALTER COLUMN created_by DROP NOT NULL;

COMMENT ON COLUMN group_encryption_keys.encrypted_group_key IS 'Unused: the server holds no copy of a group key';
COMMENT ON COLUMN group_encryption_keys.is_active IS 'FALSE on every version once members change; the next sender makes the next version';
COMMENT ON COLUMN group_key_members.encrypted_key_for_user IS 'The group key version wrapped with this member''s RSA-OAEP public key';
