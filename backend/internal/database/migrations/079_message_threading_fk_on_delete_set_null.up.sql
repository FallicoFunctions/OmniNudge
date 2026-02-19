-- Ensure threading foreign keys are delete-tolerant for existing databases that
-- may have applied migration 078 with default NO ACTION behavior.
ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_reply_to_fkey,
DROP CONSTRAINT IF EXISTS messages_thread_root_fkey;

ALTER TABLE messages
ADD CONSTRAINT messages_reply_to_fkey
FOREIGN KEY (reply_to) REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE messages
ADD CONSTRAINT messages_thread_root_fkey
FOREIGN KEY (thread_root) REFERENCES messages(id) ON DELETE SET NULL;
