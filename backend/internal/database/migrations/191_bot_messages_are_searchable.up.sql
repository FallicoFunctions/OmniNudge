-- Let a character go and look something up.
--
-- She holds the last 200 turns verbatim and remembers older things as episodes
-- the extractor wrote. Neither reaches a specific exchange from a year ago: the
-- window does not go back that far, and memory only holds what extraction
-- happened to think worth keeping. A person in that position scrolls up and
-- reads the actual messages, which needs the transcript to be searchable.
--
-- No stored tsvector column and no trigger to keep it current. Messages are
-- never edited after they are written except by the assistant-edit path, the
-- table is append-heavy, and an expression index costs nothing on insert beyond
-- the index itself. to_tsvector is immutable once the configuration is named
-- explicitly, which is why the config is spelled out rather than left to
-- default_text_search_config.
CREATE INDEX IF NOT EXISTS idx_bot_messages_content_fts
    ON bot_messages USING GIN (to_tsvector('english', content));
