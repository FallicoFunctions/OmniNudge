CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avatar_url TEXT,
    bio TEXT,
    status_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_profiles_bio_length_check CHECK (char_length(COALESCE(bio, '')) <= 500),
    CONSTRAINT user_profiles_status_text_length_check CHECK (char_length(COALESCE(status_text, '')) <= 500)
);

INSERT INTO user_profiles (user_id, avatar_url, bio, status_text, created_at, updated_at)
SELECT id, avatar_url, bio, NULL, NOW(), NOW()
FROM users
ON CONFLICT (user_id) DO UPDATE
SET avatar_url = EXCLUDED.avatar_url,
    bio = EXCLUDED.bio,
    updated_at = NOW();
