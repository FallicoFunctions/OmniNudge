-- Add media_file_id foreign key to messages table
ALTER TABLE messages
ADD COLUMN media_file_id INTEGER REFERENCES media_files(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_messages_media_file ON messages(media_file_id) WHERE media_file_id IS NOT NULL;

-- Update existing media_files to link back to messages that reference them
-- (This handles the reverse relationship if media was uploaded with used_in_message_id)
UPDATE messages m
SET media_file_id = mf.id
FROM media_files mf
WHERE mf.used_in_message_id = m.id
  AND m.media_file_id IS NULL;
