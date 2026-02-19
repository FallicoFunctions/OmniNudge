ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_reply_to_fkey,
DROP CONSTRAINT IF EXISTS messages_thread_root_fkey;

ALTER TABLE messages
ADD CONSTRAINT messages_reply_to_fkey
FOREIGN KEY (reply_to) REFERENCES messages(id);

ALTER TABLE messages
ADD CONSTRAINT messages_thread_root_fkey
FOREIGN KEY (thread_root) REFERENCES messages(id);
