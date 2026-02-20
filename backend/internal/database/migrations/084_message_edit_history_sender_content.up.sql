-- Add sender_encrypted_content and encryption_version to message_edit_history
-- so senders can decrypt their own edit history entries.
ALTER TABLE message_edit_history
    ADD COLUMN IF NOT EXISTS sender_encrypted_content TEXT,
    ADD COLUMN IF NOT EXISTS encryption_version        TEXT NOT NULL DEFAULT 'plaintext';
