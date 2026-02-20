ALTER TABLE message_edit_history
    DROP COLUMN IF EXISTS sender_encrypted_content,
    DROP COLUMN IF EXISTS encryption_version;
