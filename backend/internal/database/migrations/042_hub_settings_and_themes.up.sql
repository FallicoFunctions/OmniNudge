-- Add moderator role system to hub_moderators
ALTER TABLE hub_moderators
ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'moderator';

-- Update existing moderators: set creator as owner, others as full_moderator
UPDATE hub_moderators hm
SET role = CASE
    WHEN hm.user_id = (SELECT created_by FROM hubs WHERE id = hm.hub_id) THEN 'owner'
    ELSE 'full_moderator'
END;

-- Add constraint for valid roles
ALTER TABLE hub_moderators
ADD CONSTRAINT hub_moderator_role_check CHECK (role IN ('owner', 'full_moderator', 'moderator'));

-- Create hub_settings table
CREATE TABLE hub_settings (
    id SERIAL PRIMARY KEY,
    hub_id INTEGER NOT NULL UNIQUE REFERENCES hubs(id) ON DELETE CASCADE,

    -- Basic info (can override hub.name and hub.description)
    display_title VARCHAR(300),
    sidebar_markdown TEXT,

    -- Privacy settings
    privacy_type VARCHAR(20) NOT NULL DEFAULT 'public',

    -- Content settings
    allow_text_posts BOOLEAN NOT NULL DEFAULT TRUE,
    allow_link_posts BOOLEAN NOT NULL DEFAULT TRUE,
    allow_image_posts BOOLEAN NOT NULL DEFAULT TRUE,
    allow_video_posts BOOLEAN NOT NULL DEFAULT TRUE,
    allow_poll_posts BOOLEAN NOT NULL DEFAULT TRUE,

    -- Media settings
    allow_media_in_comments BOOLEAN NOT NULL DEFAULT TRUE,
    require_post_flair BOOLEAN NOT NULL DEFAULT FALSE,

    -- Auto-moderation
    banned_words TEXT[], -- Array of banned words/phrases
    spam_filter_strength VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high
    new_account_filter_days INTEGER DEFAULT 0, -- Require account age in days (0 = disabled)
    min_account_karma INTEGER DEFAULT 0, -- Minimum karma to post (0 = disabled)

    -- Other settings
    allow_spoilers BOOLEAN NOT NULL DEFAULT TRUE,
    show_thumbnails BOOLEAN NOT NULL DEFAULT TRUE,
    enable_wiki BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT privacy_type_check CHECK (privacy_type IN ('public', 'restricted', 'private')),
    CONSTRAINT spam_filter_check CHECK (spam_filter_strength IN ('low', 'medium', 'high'))
);

-- Create index for hub_id lookups
CREATE INDEX idx_hub_settings_hub_id ON hub_settings(hub_id);

-- Create hub_themes table for custom CSS/styling
CREATE TABLE hub_themes (
    id SERIAL PRIMARY KEY,
    hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,

    -- Theme metadata
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,

    -- CSS content
    css_content TEXT, -- Full CSS stylesheet

    -- Application scope
    apply_to_whole_page BOOLEAN NOT NULL DEFAULT TRUE,
    apply_to_header BOOLEAN NOT NULL DEFAULT FALSE,
    apply_to_sidebar BOOLEAN NOT NULL DEFAULT FALSE,
    apply_to_post_list BOOLEAN NOT NULL DEFAULT FALSE,
    apply_to_post_detail BOOLEAN NOT NULL DEFAULT FALSE,

    -- Version control
    version INTEGER NOT NULL DEFAULT 1,
    parent_version_id INTEGER REFERENCES hub_themes(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_hub_themes_hub_id ON hub_themes(hub_id);

-- Create partial unique index to enforce only one active theme per hub
CREATE UNIQUE INDEX idx_hub_themes_one_active ON hub_themes(hub_id) WHERE is_active = TRUE;

-- Insert default settings for existing hubs
INSERT INTO hub_settings (hub_id)
SELECT id FROM hubs
ON CONFLICT (hub_id) DO NOTHING;
