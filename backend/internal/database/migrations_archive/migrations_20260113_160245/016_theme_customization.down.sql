-- Rollback Migration: Theme Customization System
-- Phase: 2a - Foundation
-- Description: Remove theme customization tables and columns
-- Created: 2025-11-29

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_theme_rating ON user_installed_themes;
DROP TRIGGER IF EXISTS trigger_update_theme_install_count ON user_installed_themes;

-- Drop functions
DROP FUNCTION IF EXISTS update_theme_rating();
DROP FUNCTION IF EXISTS update_theme_install_count();

-- Remove columns from user_settings
ALTER TABLE user_settings
DROP COLUMN IF EXISTS active_theme_id,
DROP COLUMN IF EXISTS advanced_mode_enabled;

-- Drop tables (in reverse order of dependencies)
DROP TABLE IF EXISTS user_installed_themes CASCADE;
DROP TABLE IF EXISTS user_theme_overrides CASCADE;
DROP TABLE IF EXISTS user_themes CASCADE;
