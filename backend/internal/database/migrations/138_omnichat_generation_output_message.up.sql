ALTER TABLE omnichat_generation_jobs
    ADD COLUMN IF NOT EXISTS output_message_id INTEGER REFERENCES bot_messages(id) ON DELETE SET NULL;

