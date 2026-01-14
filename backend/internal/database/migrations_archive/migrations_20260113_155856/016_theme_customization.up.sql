-- Migration: Theme Customization System
-- Phase: 2a - Foundation
-- Description: Add tables for MySpace-style theme customization
-- Created: 2025-11-29

-- ============================================================================
-- user_themes: Stores custom themes created by users
-- ============================================================================
CREATE TABLE user_themes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Basic Info
    theme_name VARCHAR(100) NOT NULL,
    theme_description TEXT,

    -- Theme Type
    theme_type VARCHAR(50) NOT NULL DEFAULT 'variable_customization',
    -- Options: 'predefined', 'variable_customization', 'full_css'

    -- Scope
    scope_type VARCHAR(20) NOT NULL DEFAULT 'global',
    -- Options: 'global', 'per_page'
    target_page VARCHAR(50),
    -- For per_page scope: 'feed', 'profile', 'settings', 'messages', 'notifications', 'search'

    -- Theme Content
    css_variables JSONB,
    -- For 'variable_customization' and 'predefined' types
    -- Example: {"--primary-color": "#3B82F6", "--background-color": "#1F2937", ...}

    custom_css TEXT,
    -- For 'full_css' type
    -- Raw CSS content (sanitized server-side)

    -- Sharing & Marketplace (Phase 2c/3)
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    -- Can be browsed and installed by other users

    is_marketplace BOOLEAN NOT NULL DEFAULT FALSE,
    -- Available for purchase in marketplace (Phase 3)

    price_coins INTEGER DEFAULT 0,
    -- Marketplace price (0 = free)

    -- Metadata
    category VARCHAR(50),
    -- e.g., 'dark', 'light', 'colorful', 'minimal', 'gradient'

    tags TEXT[],
    -- Array of tags for discovery

    thumbnail_url VARCHAR(500),
    -- Preview image URL

    -- Stats
    install_count INTEGER NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    average_rating DECIMAL(3,2) DEFAULT 0,
    -- 0.00 to 5.00

    -- Versioning
    version VARCHAR(20) DEFAULT '1.0.0',

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Indexes
    CONSTRAINT chk_scope_target CHECK (
        (scope_type = 'global' AND target_page IS NULL) OR
        (scope_type = 'per_page' AND target_page IS NOT NULL)
    ),

    CONSTRAINT chk_content CHECK (
        (theme_type IN ('predefined', 'variable_customization') AND css_variables IS NOT NULL) OR
        (theme_type = 'full_css' AND custom_css IS NOT NULL)
    )
);

-- Indexes for user_themes
CREATE INDEX idx_user_themes_user_id ON user_themes(user_id);
CREATE INDEX idx_user_themes_public ON user_themes(is_public) WHERE is_public = TRUE;
CREATE INDEX idx_user_themes_marketplace ON user_themes(is_marketplace) WHERE is_marketplace = TRUE;
CREATE INDEX idx_user_themes_category ON user_themes(category);
CREATE INDEX idx_user_themes_rating ON user_themes(average_rating DESC, rating_count DESC);
CREATE INDEX idx_user_themes_installs ON user_themes(install_count DESC);

-- GIN index for tags array search
CREATE INDEX idx_user_themes_tags ON user_themes USING GIN(tags);

-- Full-text search index for theme discovery
CREATE INDEX idx_user_themes_search ON user_themes
USING GIN(to_tsvector('english', theme_name || ' ' || COALESCE(theme_description, '')));

-- ============================================================================
-- user_theme_overrides: Per-page theme customizations
-- ============================================================================
CREATE TABLE user_theme_overrides (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page_name VARCHAR(50) NOT NULL,
    -- 'feed', 'profile', 'settings', 'messages', 'notifications', 'search'

    theme_id INTEGER NOT NULL REFERENCES user_themes(id) ON DELETE CASCADE,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- One override per page per user
    UNIQUE(user_id, page_name)
);

-- Indexes for user_theme_overrides
CREATE INDEX idx_user_theme_overrides_user ON user_theme_overrides(user_id);
CREATE INDEX idx_user_theme_overrides_theme ON user_theme_overrides(theme_id);

-- ============================================================================
-- user_installed_themes: Tracks installed/purchased themes
-- ============================================================================
CREATE TABLE user_installed_themes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme_id INTEGER NOT NULL REFERENCES user_themes(id) ON DELETE CASCADE,

    -- Purchase Info
    purchased_at TIMESTAMP NOT NULL DEFAULT NOW(),
    price_paid INTEGER NOT NULL DEFAULT 0,
    -- Coins paid (0 if free)

    -- Installation
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    -- Currently using this theme (global active theme)

    installed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,

    -- Updates
    installed_version VARCHAR(20),
    update_available BOOLEAN NOT NULL DEFAULT FALSE,
    auto_update_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    -- Engagement
    user_rating INTEGER,
    -- 1-5 stars (NULL if not rated)

    review TEXT,
    reviewed_at TIMESTAMP,

    -- One installation per theme per user
    UNIQUE(user_id, theme_id)
);

-- Indexes for user_installed_themes
CREATE INDEX idx_user_installed_themes_user ON user_installed_themes(user_id);
CREATE INDEX idx_user_installed_themes_theme ON user_installed_themes(theme_id);
CREATE INDEX idx_user_installed_themes_active ON user_installed_themes(user_id, is_active)
WHERE is_active = TRUE;

-- ============================================================================
-- Update user_settings table to include theme preferences
-- ============================================================================
ALTER TABLE user_settings
ADD COLUMN active_theme_id INTEGER REFERENCES user_themes(id) ON DELETE SET NULL,
ADD COLUMN advanced_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for quick theme lookup
CREATE INDEX idx_user_settings_active_theme ON user_settings(active_theme_id);

-- ============================================================================
-- Seed predefined themes (created by system user_id = 0)
-- ============================================================================
-- Note: user_id 0 might not exist, so we'll need to handle this in the application
-- or create a dedicated system user account. For now, these will be seeded via
-- a separate script after migration.

-- ============================================================================
-- Functions for maintaining theme statistics
-- ============================================================================

-- Function to update theme rating when user rates
CREATE OR REPLACE FUNCTION update_theme_rating() RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate average rating for the theme
    UPDATE user_themes
    SET
        rating_count = (
            SELECT COUNT(*)
            FROM user_installed_themes
            WHERE theme_id = NEW.theme_id AND user_rating IS NOT NULL
        ),
        average_rating = (
            SELECT COALESCE(AVG(user_rating), 0)
            FROM user_installed_themes
            WHERE theme_id = NEW.theme_id AND user_rating IS NOT NULL
        ),
        updated_at = NOW()
    WHERE id = NEW.theme_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update theme rating
CREATE TRIGGER trigger_update_theme_rating
AFTER INSERT OR UPDATE OF user_rating ON user_installed_themes
FOR EACH ROW
WHEN (NEW.user_rating IS NOT NULL)
EXECUTE FUNCTION update_theme_rating();

-- Function to update install count
CREATE OR REPLACE FUNCTION update_theme_install_count() RETURNS TRIGGER AS $$
BEGIN
    -- Increment install count
    UPDATE user_themes
    SET
        install_count = install_count + 1,
        updated_at = NOW()
    WHERE id = NEW.theme_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update install count
CREATE TRIGGER trigger_update_theme_install_count
AFTER INSERT ON user_installed_themes
FOR EACH ROW
EXECUTE FUNCTION update_theme_install_count();

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE user_themes IS 'Stores custom themes created by users for MySpace-style customization';
COMMENT ON TABLE user_theme_overrides IS 'Per-page theme customizations (different theme for each page)';
COMMENT ON TABLE user_installed_themes IS 'Tracks which users have installed/purchased which themes';
COMMENT ON COLUMN user_themes.theme_type IS 'Type: predefined (system), variable_customization (CSS vars), full_css (custom CSS)';
COMMENT ON COLUMN user_themes.scope_type IS 'Scope: global (all pages) or per_page (specific page)';
COMMENT ON COLUMN user_themes.css_variables IS 'JSON object of CSS custom properties (e.g., {"--primary-color": "#3B82F6"})';
COMMENT ON COLUMN user_themes.custom_css IS 'Raw CSS content (sanitized server-side, Phase 2b+)';
COMMENT ON COLUMN user_themes.is_public IS 'If true, other users can browse and install this theme';
COMMENT ON COLUMN user_themes.is_marketplace IS 'If true, available for purchase in marketplace (Phase 3)';
