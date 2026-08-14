-- Multi-user, multi-character OmniChat rooms. These are intentionally
-- separate from E2E-encrypted direct messages because server-side characters
-- must be able to read only the group transcript they participate in.

ALTER TABLE omnichat_publications
    ADD COLUMN IF NOT EXISTS is_nsfw BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS omnichat_groups (
    id              UUID PRIMARY KEY,
    owner_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    description     TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    avatar_url      TEXT,
    visibility      VARCHAR(12) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'invite', 'public')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_omnichat_groups_activity ON omnichat_groups(last_message_at DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS omnichat_group_members (
    group_id      UUID NOT NULL REFERENCES omnichat_groups(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role          VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    muted_until   TIMESTAMPTZ,
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_omnichat_group_members_user ON omnichat_group_members(user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS omnichat_group_personas (
    group_id       UUID NOT NULL REFERENCES omnichat_groups(id) ON DELETE CASCADE,
    persona_id     INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE RESTRICT,
    added_by       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    display_order  SMALLINT NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    joined_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, persona_id),
    UNIQUE (group_id, display_order)
);

CREATE TABLE IF NOT EXISTS omnichat_group_messages (
    id                  UUID PRIMARY KEY,
    group_id            UUID NOT NULL REFERENCES omnichat_groups(id) ON DELETE CASCADE,
    sender_type         VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'persona', 'system')),
    sender_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sender_persona_id   INTEGER REFERENCES bot_personas(id) ON DELETE SET NULL,
    reply_to_id         UUID,
    content             TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000),
    failed              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at           TIMESTAMPTZ,
    deleted_at          TIMESTAMPTZ,
    UNIQUE (id, group_id),
    CHECK (
        (sender_type = 'user' AND sender_user_id IS NOT NULL AND sender_persona_id IS NULL) OR
        (sender_type = 'persona' AND sender_user_id IS NULL AND sender_persona_id IS NOT NULL) OR
        (sender_type = 'system' AND sender_user_id IS NULL AND sender_persona_id IS NULL)
    ),
    FOREIGN KEY (reply_to_id, group_id) REFERENCES omnichat_group_messages(id, group_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_omnichat_group_messages_group ON omnichat_group_messages(group_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS omnichat_group_message_attachments (
    message_id  UUID NOT NULL REFERENCES omnichat_group_messages(id) ON DELETE CASCADE,
    asset_id    UUID NOT NULL REFERENCES omnichat_media_assets(id) ON DELETE RESTRICT,
    position    SMALLINT NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 9),
    PRIMARY KEY (message_id, asset_id),
    UNIQUE (message_id, position)
);

CREATE TABLE IF NOT EXISTS omnichat_group_invites (
    id                UUID PRIMARY KEY,
    group_id          UUID NOT NULL REFERENCES omnichat_groups(id) ON DELETE CASCADE,
    created_by        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_digest      CHAR(64) NOT NULL UNIQUE,
    max_uses          SMALLINT NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 50),
    use_count         SMALLINT NOT NULL DEFAULT 0 CHECK (use_count >= 0 AND use_count <= max_uses),
    expires_at        TIMESTAMPTZ NOT NULL,
    revoked_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_omnichat_group_invites_group ON omnichat_group_invites(group_id, expires_at DESC) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_omnichat_group_member_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM omnichat_group_members WHERE group_id = NEW.group_id) >= 50 THEN
        RAISE EXCEPTION 'omnichat group member limit exceeded';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_omnichat_group_member_limit
BEFORE INSERT ON omnichat_group_members FOR EACH ROW EXECUTE FUNCTION enforce_omnichat_group_member_limit();

CREATE OR REPLACE FUNCTION enforce_omnichat_group_persona_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM omnichat_group_personas WHERE group_id = NEW.group_id) >= 10 THEN
        RAISE EXCEPTION 'omnichat group persona limit exceeded';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_omnichat_group_persona_limit
BEFORE INSERT ON omnichat_group_personas FOR EACH ROW EXECUTE FUNCTION enforce_omnichat_group_persona_limit();

