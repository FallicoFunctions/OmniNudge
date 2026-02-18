CREATE TABLE IF NOT EXISTS user_friendships (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'accepted',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_friendships_no_self CHECK (user_id <> friend_user_id),
    CONSTRAINT user_friendships_order_check CHECK (user_id < friend_user_id),
    CONSTRAINT user_friendships_status_check CHECK (status IN ('pending', 'accepted', 'blocked')),
    PRIMARY KEY (user_id, friend_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_friendships_user ON user_friendships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_friendships_friend ON user_friendships(friend_user_id, status);
