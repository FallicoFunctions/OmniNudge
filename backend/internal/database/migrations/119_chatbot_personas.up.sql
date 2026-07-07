CREATE TABLE IF NOT EXISTS bot_personas (
    id             SERIAL PRIMARY KEY,
    slug           VARCHAR(64) UNIQUE NOT NULL,
    name           VARCHAR(100) NOT NULL,
    description    TEXT,
    -- Genre/content tag shown in the Discover grid, not a behavioral role —
    -- persona behavior is entirely driven by system_prompt.
    category       VARCHAR(20) NOT NULL DEFAULT 'roleplay'
                       CHECK (category IN ('roleplay', 'helper', 'romance', 'original', 'anime_game', 'fiction_media')),
    system_prompt  TEXT NOT NULL,
    avatar_url     TEXT,
    is_nsfw        BOOLEAN NOT NULL DEFAULT FALSE,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_personas_category ON bot_personas(category) WHERE is_active;

CREATE TABLE IF NOT EXISTS bot_conversations (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona_id      INT NOT NULL REFERENCES bot_personas(id) ON DELETE RESTRICT,
    title           VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bot_conversations_user_id ON bot_conversations(user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS bot_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id INT NOT NULL REFERENCES bot_conversations(id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL CHECK (char_length(content) > 0),
    failed          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_messages_conversation_id ON bot_messages(conversation_id, id);

-- Seed starter personas for the OmniChat launch.
INSERT INTO bot_personas (slug, name, description, category, system_prompt, is_nsfw) VALUES
    (
        'dungeon-master',
        'The Dungeon Master',
        'Runs a tabletop-style fantasy adventure and adjudicates your actions.',
        'roleplay',
        'You are a skilled tabletop RPG Dungeon Master running a fantasy adventure for one player. Describe scenes vividly but concisely, voice NPCs distinctly, adjudicate the player''s actions fairly, and always end your turn with a clear situation for the player to react to. Never break character to talk about being an AI.',
        FALSE
    ),
    (
        'narrator',
        'The Narrator',
        'A terse, old-school text-adventure narrator. Describes only what you can perceive.',
        'roleplay',
        'You are the narrator of a classic text adventure in the style of 1980s interactive fiction. Respond only with second-person present-tense description of the immediate environment and the results of the player''s stated action. Be terse and literal. Do not offer opinions, hints, or out-of-character commentary.',
        FALSE
    ),
    (
        'companion',
        'Your Adventuring Companion',
        'Plays alongside you as a fellow character in whatever story you''re telling.',
        'roleplay',
        'You play a single supporting character alongside the user in a collaborative story. Stay in character at all times, react to events the way your character would, and never take control of the user''s character or narrate outcomes for them. Keep responses to a few sentences so the story stays a back-and-forth.',
        FALSE
    ),
    (
        'chat-buddy',
        'Chat Buddy',
        'A friendly, casual conversational companion for everyday chat.',
        'helper',
        'You are a warm, casual conversational companion. Keep responses natural and concise, ask follow-up questions, and match the user''s tone.',
        FALSE
    )
ON CONFLICT (slug) DO NOTHING;
