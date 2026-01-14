-- Add full-text search capabilities using PostgreSQL tsvector
-- This enables fast, ranked full-text search across posts, comments, users, and hubs
-- Note: We use triggers instead of GENERATED columns because to_tsvector is not immutable

-- =====================================================
-- ADD SEARCH VECTOR COLUMNS
-- =====================================================

-- Add search vector columns (populated by triggers)
ALTER TABLE platform_posts ADD COLUMN search_vector tsvector;
ALTER TABLE post_comments ADD COLUMN search_vector tsvector;
ALTER TABLE users ADD COLUMN search_vector tsvector;
ALTER TABLE hubs ADD COLUMN search_vector tsvector;

-- =====================================================
-- CREATE TRIGGER FUNCTIONS TO UPDATE SEARCH VECTORS
-- =====================================================

-- Trigger function for platform_posts
CREATE OR REPLACE FUNCTION update_post_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tsvector_update_post
BEFORE INSERT OR UPDATE ON platform_posts
FOR EACH ROW
EXECUTE FUNCTION update_post_search_vector();

-- Trigger function for post_comments
CREATE OR REPLACE FUNCTION update_comment_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', coalesce(NEW.body, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tsvector_update_comment
BEFORE INSERT OR UPDATE ON post_comments
FOR EACH ROW
EXECUTE FUNCTION update_comment_search_vector();

-- Trigger function for users
CREATE OR REPLACE FUNCTION update_user_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.username, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.bio, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tsvector_update_user
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_user_search_vector();

-- Trigger function for hubs
CREATE OR REPLACE FUNCTION update_hub_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tsvector_update_hub
BEFORE INSERT OR UPDATE ON hubs
FOR EACH ROW
EXECUTE FUNCTION update_hub_search_vector();

-- =====================================================
-- POPULATE EXISTING DATA WITH SEARCH VECTORS
-- =====================================================

-- Update existing posts
UPDATE platform_posts SET search_vector =
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'C');

-- Update existing comments
UPDATE post_comments SET search_vector = to_tsvector('english', coalesce(body, ''));

-- Update existing users
UPDATE users SET search_vector =
    setweight(to_tsvector('english', coalesce(username, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(bio, '')), 'B');

-- Update existing hubs
UPDATE hubs SET search_vector =
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B');

-- =====================================================
-- CREATE GIN INDICES FOR FAST SEARCH
-- =====================================================

-- GIN index on posts (enables fast full-text search)
CREATE INDEX idx_platform_posts_search ON platform_posts USING GIN(search_vector);

-- GIN index on comments
CREATE INDEX idx_post_comments_search ON post_comments USING GIN(search_vector);

-- GIN index on users
CREATE INDEX idx_users_search ON users USING GIN(search_vector);

-- GIN index on hubs
CREATE INDEX idx_hubs_search ON hubs USING GIN(search_vector);

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN platform_posts.search_vector IS 'Full-text search vector with weighted fields (title:A, body:B, tags:C)';
COMMENT ON COLUMN post_comments.search_vector IS 'Full-text search vector for comment body';
COMMENT ON COLUMN users.search_vector IS 'Full-text search vector for username and bio';
COMMENT ON COLUMN hubs.search_vector IS 'Full-text search vector for hub name and description';
