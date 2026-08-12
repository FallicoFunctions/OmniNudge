-- Character memory for OmniChat personas.
--
-- Until now a persona's only continuity was the per-conversation scene state
-- and a static author-written lorebook. Chat generation reads a hard window of
-- the last 40 turns (services.maxHistoryMessages), so turn 41 was gone. These
-- tables hold the compressed remainder: what happened, who and what it
-- involved, and how strongly it should compete for recall.
--
-- Two tiers live in one table, distinguished by owner_user_id:
--
--   owner_user_id IS NOT NULL -> relational memory. Private to one user's
--       relationship with one persona. Cascades away with the user.
--   owner_user_id IS NULL     -> self memory. Persona-global, for facts not
--       derived from anyone's private conversation. Nothing writes this tier
--       yet; it is the seam for future in-world (OmniRave) participation.
--
-- The tier check below is what makes cross-tier contamination impossible
-- rather than merely discouraged: anything carrying a conversation reference
-- must name its owner, so a conversation-derived memory can never become
-- persona-global by way of a nulled column.

CREATE TABLE omnichat_memory_episodes (
    id BIGSERIAL PRIMARY KEY,
    persona_id INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    conversation_id INTEGER REFERENCES bot_conversations(id) ON DELETE SET NULL,
    source_message_id INTEGER REFERENCES bot_messages(id) ON DELETE SET NULL,

    title VARCHAR(256) NOT NULL CHECK (char_length(btrim(title)) > 0),
    summary VARCHAR(2048) NOT NULL CHECK (char_length(btrim(summary)) > 0),

    -- When we learned the memory. This is also the ranking's recency anchor:
    -- a chat transcript rarely dates its own events, so an in-fiction date
    -- would be guesswork and is deliberately not modelled.
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Salience is "how much does this matter", distinctiveness is "how unlike
    -- the surrounding routine is it". They are deliberately separate: a
    -- birthday is reliable but unremarkable, a disaster is unreliable but
    -- unforgettable. Distinctiveness is what lets one strange McDonald's trip
    -- outrank five ordinary ones that match the same words.
    salience REAL NOT NULL DEFAULT 0.5 CHECK (salience >= 0 AND salience <= 1),
    distinctiveness REAL NOT NULL DEFAULT 0.5 CHECK (distinctiveness >= 0 AND distinctiveness <= 1),
    emotional_valence REAL CHECK (emotional_valence >= -1 AND emotional_valence <= 1),

    status VARCHAR(16) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'superseded', 'corrected', 'user_hidden')),
    superseded_by BIGINT REFERENCES omnichat_memory_episodes(id) ON DELETE SET NULL,

    -- Retrieval feeds back into accessibility: a memory recalled often becomes
    -- easier to recall. This never touches the text, only its ranking.
    retrieval_count INTEGER NOT NULL DEFAULT 0 CHECK (retrieval_count >= 0),
    last_retrieved_at TIMESTAMPTZ,

    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(summary, '')), 'B')
    ) STORED,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT omnichat_memory_episodes_tier_check
        CHECK (owner_user_id IS NOT NULL OR conversation_id IS NULL),
    CONSTRAINT omnichat_memory_episodes_no_self_supersede
        CHECK (superseded_by IS NULL OR superseded_by <> id)
);

-- Recall always scopes to one persona and one tier before it ranks anything,
-- so the scope columns lead and status filters the same index.
CREATE INDEX idx_omnichat_memory_episodes_scope
    ON omnichat_memory_episodes (persona_id, owner_user_id, status, recorded_at DESC);

CREATE INDEX idx_omnichat_memory_episodes_search
    ON omnichat_memory_episodes USING GIN (search_vector);

CREATE INDEX idx_omnichat_memory_episodes_conversation
    ON omnichat_memory_episodes (conversation_id)
    WHERE conversation_id IS NOT NULL;

-- Entities are the associative anchors: the names a weak cue like "that one
-- time with Mike" can actually latch onto.
CREATE TABLE omnichat_memory_entities (
    id BIGSERIAL PRIMARY KEY,
    persona_id INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

    canonical_name VARCHAR(128) NOT NULL CHECK (char_length(btrim(canonical_name)) > 0),
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('person', 'place', 'thing', 'topic', 'event')),
    aliases TEXT[] NOT NULL DEFAULT '{}',

    mention_count INTEGER NOT NULL DEFAULT 1 CHECK (mention_count >= 0),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- COALESCE because a NULL owner is the self tier, and NULL never equals NULL
-- in a unique index; without it every self-tier upsert would insert a duplicate.
CREATE UNIQUE INDEX idx_omnichat_memory_entities_identity
    ON omnichat_memory_entities (persona_id, COALESCE(owner_user_id, 0), lower(canonical_name));

CREATE INDEX idx_omnichat_memory_entities_lookup
    ON omnichat_memory_entities (persona_id, owner_user_id, lower(canonical_name));

-- This table is the association graph. Two entities are associated when they
-- co-occur in an episode, which one self-join computes, so v1 needs no typed
-- edge table. Add one only when a named relation actually drives ranking.
CREATE TABLE omnichat_memory_episode_entities (
    episode_id BIGINT NOT NULL REFERENCES omnichat_memory_episodes(id) ON DELETE CASCADE,
    entity_id BIGINT NOT NULL REFERENCES omnichat_memory_entities(id) ON DELETE CASCADE,
    weight REAL NOT NULL DEFAULT 1.0 CHECK (weight > 0 AND weight <= 1),
    PRIMARY KEY (episode_id, entity_id)
);

CREATE INDEX idx_omnichat_memory_episode_entities_entity
    ON omnichat_memory_episode_entities (entity_id, episode_id);

-- Extraction watermark. Same role the scene-state checkpoints play: it bounds
-- the delta so a conversation is never re-extracted from turn one.
--
-- Kept out of bot_conversations on purpose. This row is written by a
-- background worker on every extraction, and bot_conversations is read on
-- every single message; widening the hot table would put write contention
-- directly on the send path.
CREATE TABLE omnichat_memory_watermarks (
    conversation_id INTEGER PRIMARY KEY REFERENCES bot_conversations(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_extracted_message_id INTEGER NOT NULL DEFAULT 0 CHECK (last_extracted_message_id >= 0),
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
