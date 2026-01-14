-- Slideshow sessions table
-- Tracks active slideshow sessions in conversations
CREATE TABLE slideshow_sessions (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

    -- Slideshow type: 'personal' or 'reddit'
    slideshow_type VARCHAR(20) NOT NULL CHECK (slideshow_type IN ('personal', 'reddit')),

    -- For Reddit slideshows: subreddit name and sort
    subreddit VARCHAR(100),
    reddit_sort VARCHAR(20) DEFAULT 'hot',

    -- Current state
    current_index INTEGER NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,

    -- Control management
    controller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Auto-advance settings
    auto_advance BOOLEAN DEFAULT FALSE,
    auto_advance_interval INTEGER DEFAULT 5, -- seconds

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Only one active slideshow per conversation
    CONSTRAINT unique_active_slideshow UNIQUE (conversation_id)
);

-- Personal slideshow media items
-- Stores the media files for personal slideshows
CREATE TABLE slideshow_media_items (
    id SERIAL PRIMARY KEY,
    slideshow_session_id INTEGER NOT NULL REFERENCES slideshow_sessions(id) ON DELETE CASCADE,

    -- Media reference (links to media_files table)
    media_file_id INTEGER NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,

    -- Order in slideshow
    position INTEGER NOT NULL,

    -- Optional caption
    caption TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique position per slideshow
    CONSTRAINT unique_position UNIQUE (slideshow_session_id, position)
);

CREATE INDEX idx_slideshow_sessions_conversation ON slideshow_sessions(conversation_id);
CREATE INDEX idx_slideshow_sessions_controller ON slideshow_sessions(controller_user_id);
CREATE INDEX idx_slideshow_media_items_session ON slideshow_media_items(slideshow_session_id);
CREATE INDEX idx_slideshow_media_items_position ON slideshow_media_items(slideshow_session_id, position);
