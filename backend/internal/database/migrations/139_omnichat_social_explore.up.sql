-- Immutable chat sharing and private-source/publication separation for the
-- OmniChat Explore social surface.

CREATE TABLE IF NOT EXISTS omnichat_chat_snapshots (
    id                      UUID PRIMARY KEY,
    owner_user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_conversation_id  INTEGER REFERENCES bot_conversations(id) ON DELETE SET NULL,
    persona_id              INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE RESTRICT,
    title                   VARCHAR(160) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    excerpt                 VARCHAR(500) NOT NULL DEFAULT '',
    message_count           SMALLINT NOT NULL CHECK (message_count BETWEEN 1 AND 200),
    moderation_status       VARCHAR(16) NOT NULL DEFAULT 'pending'
                                CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'review')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_omnichat_chat_snapshots_owner_created
    ON omnichat_chat_snapshots(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS omnichat_chat_snapshot_messages (
    snapshot_id         UUID NOT NULL REFERENCES omnichat_chat_snapshots(id) ON DELETE CASCADE,
    position            SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 199),
    original_message_id INTEGER REFERENCES bot_messages(id) ON DELETE SET NULL,
    role                VARCHAR(12) NOT NULL CHECK (role IN ('user', 'assistant')),
    content             TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 10000),
    created_at          TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (snapshot_id, position)
);

CREATE TABLE IF NOT EXISTS omnichat_chat_snapshot_attachments (
    snapshot_id       UUID NOT NULL,
    message_position SMALLINT NOT NULL,
    asset_position   SMALLINT NOT NULL CHECK (asset_position BETWEEN 0 AND 9),
    asset_id         UUID NOT NULL REFERENCES omnichat_media_assets(id) ON DELETE RESTRICT,
    PRIMARY KEY (snapshot_id, message_position, asset_position),
    UNIQUE (snapshot_id, message_position, asset_id),
    FOREIGN KEY (snapshot_id, message_position)
        REFERENCES omnichat_chat_snapshot_messages(snapshot_id, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS omnichat_publications (
    id                  UUID PRIMARY KEY,
    author_user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona_id          INTEGER NOT NULL REFERENCES bot_personas(id) ON DELETE RESTRICT,
    content_kind        VARCHAR(10) NOT NULL CHECK (content_kind IN ('image', 'video', 'chat')),
    asset_id            UUID REFERENCES omnichat_media_assets(id) ON DELETE RESTRICT,
    snapshot_id         UUID REFERENCES omnichat_chat_snapshots(id) ON DELETE RESTRICT,
    caption             TEXT NOT NULL DEFAULT '' CHECK (char_length(caption) <= 2000),
    visibility          VARCHAR(10) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted')),
    status              VARCHAR(16) NOT NULL DEFAULT 'published'
                            CHECK (status IN ('published', 'under_review', 'removed')),
    like_count          INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
    comment_count       INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
    share_count         INTEGER NOT NULL DEFAULT 0 CHECK (share_count >= 0),
    remix_count         INTEGER NOT NULL DEFAULT 0 CHECK (remix_count >= 0),
    published_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at          TIMESTAMPTZ,
    CHECK (
        (content_kind = 'chat' AND snapshot_id IS NOT NULL AND asset_id IS NULL) OR
        (content_kind IN ('image', 'video') AND asset_id IS NOT NULL AND snapshot_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_omnichat_publications_explore
    ON omnichat_publications(published_at DESC, id DESC)
    WHERE status = 'published' AND visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_omnichat_publications_author
    ON omnichat_publications(author_user_id, published_at DESC)
    WHERE status <> 'removed';
CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichat_publications_active_asset
    ON omnichat_publications(asset_id)
    WHERE asset_id IS NOT NULL AND status <> 'removed';
CREATE UNIQUE INDEX IF NOT EXISTS uq_omnichat_publications_active_snapshot
    ON omnichat_publications(snapshot_id)
    WHERE snapshot_id IS NOT NULL AND status <> 'removed';

CREATE TABLE IF NOT EXISTS omnichat_publication_comments (
    id              UUID PRIMARY KEY,
    publication_id  UUID NOT NULL REFERENCES omnichat_publications(id) ON DELETE CASCADE,
    author_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id       UUID,
    body            TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    status          VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'removed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, publication_id),
    FOREIGN KEY (parent_id, publication_id)
        REFERENCES omnichat_publication_comments(id, publication_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_omnichat_publication_comments_publication
    ON omnichat_publication_comments(publication_id, created_at, id)
    WHERE status = 'active';

CREATE TABLE IF NOT EXISTS omnichat_publication_reactions (
    publication_id UUID NOT NULL REFERENCES omnichat_publications(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction_type  VARCHAR(12) NOT NULL DEFAULT 'like' CHECK (reaction_type = 'like'),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (publication_id, user_id)
);

CREATE TABLE IF NOT EXISTS omnichat_publication_shares (
    publication_id UUID NOT NULL REFERENCES omnichat_publications(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (publication_id, user_id)
);

CREATE TABLE IF NOT EXISTS omnichat_publication_bookmarks (
    publication_id UUID NOT NULL REFERENCES omnichat_publications(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (publication_id, user_id)
);

CREATE TABLE IF NOT EXISTS omnichat_follows (
    follower_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_user_id, followed_user_id),
    CHECK (follower_user_id <> followed_user_id)
);
CREATE INDEX IF NOT EXISTS idx_omnichat_follows_followed
    ON omnichat_follows(followed_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS omnichat_publication_reports (
    id              UUID PRIMARY KEY,
    publication_id  UUID NOT NULL REFERENCES omnichat_publications(id) ON DELETE CASCADE,
    reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason          VARCHAR(40) NOT NULL CHECK (reason IN ('sexual_content', 'minor_safety', 'violence', 'harassment', 'hate', 'self_harm', 'impersonation', 'copyright', 'spam', 'other')),
    details         TEXT NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
    status          VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (publication_id, reporter_user_id)
);

ALTER TABLE bot_conversations
    ADD COLUMN IF NOT EXISTS remixed_from_publication_id UUID REFERENCES omnichat_publications(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION update_omnichat_publication_reaction_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE omnichat_publications SET like_count = like_count + 1, updated_at = NOW() WHERE id = NEW.publication_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE omnichat_publications SET like_count = GREATEST(0, like_count - 1), updated_at = NOW() WHERE id = OLD.publication_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_omnichat_publication_reaction_counts
AFTER INSERT OR DELETE ON omnichat_publication_reactions
FOR EACH ROW EXECUTE FUNCTION update_omnichat_publication_reaction_counts();

CREATE OR REPLACE FUNCTION update_omnichat_publication_comment_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
        UPDATE omnichat_publications SET comment_count = comment_count + 1, updated_at = NOW() WHERE id = NEW.publication_id;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
        UPDATE omnichat_publications SET comment_count = GREATEST(0, comment_count - 1), updated_at = NOW() WHERE id = OLD.publication_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
        UPDATE omnichat_publications
        SET comment_count = GREATEST(0, comment_count + CASE WHEN NEW.status = 'active' THEN 1 ELSE -1 END), updated_at = NOW()
        WHERE id = NEW.publication_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_omnichat_publication_comment_counts
AFTER INSERT OR UPDATE OF status OR DELETE ON omnichat_publication_comments
FOR EACH ROW EXECUTE FUNCTION update_omnichat_publication_comment_counts();

CREATE OR REPLACE FUNCTION update_omnichat_publication_share_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE omnichat_publications SET share_count = share_count + 1, updated_at = NOW() WHERE id = NEW.publication_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE omnichat_publications SET share_count = GREATEST(0, share_count - 1), updated_at = NOW() WHERE id = OLD.publication_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_omnichat_publication_share_counts
AFTER INSERT OR DELETE ON omnichat_publication_shares
FOR EACH ROW EXECUTE FUNCTION update_omnichat_publication_share_counts();

