-- What she has seen lately (§32).
--
-- Headlines pulled once a day and shared by every character, rather than looked
-- up on a turn: §32 wants this ambient, the way the weather is known, and a
-- search per reply would cost on every turn for something that changes daily.
--
-- The title is the whole of it. No body, no description, no summary. A person
-- skimming a feed reads headlines, and every extra field is more text written by
-- somebody else arriving in her prompt -- the smaller that surface, the better.
--
-- `source` is who said it, and it is never a judgement about them. §32 refuses
-- to rank sources: an outlet is not inherently more trustworthy than a stranger,
-- and deciding otherwise on her behalf is us choosing what she believes.
CREATE TABLE IF NOT EXISTS omnichat_feed_items (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    topic TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT omnichat_feed_items_source_link_key UNIQUE (source, link)
);

CREATE INDEX IF NOT EXISTS idx_omnichat_feed_items_recent
    ON omnichat_feed_items (topic, published_at DESC);
