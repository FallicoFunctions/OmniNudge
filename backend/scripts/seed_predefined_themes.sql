-- Seed script for 8 predefined themes
-- These themes are installed during migration 016 or can be run separately
-- Run with: psql -d chatreddit -f scripts/seed_predefined_themes.sql

-- First, create a system user (user_id = 0) to own predefined themes
-- This is a special system account that owns all predefined themes
INSERT INTO users (id, username, password_hash, reddit_id, created_at, last_seen, karma)
VALUES (0, 'system', '', 'system', NOW(), NOW(), 0)
ON CONFLICT (id) DO NOTHING;

-- Delete existing predefined themes to allow re-running this script
DELETE FROM user_themes WHERE user_id = 0;

-- Reset sequence if needed
SELECT setval('user_themes_id_seq', COALESCE((SELECT MAX(id) FROM user_themes), 1));

-- ============================================================================
-- 1. OmniNudge Light (Default Light Theme)
-- ============================================================================
INSERT INTO user_themes (
    user_id, theme_name, theme_description, theme_type, scope_type,
    css_variables, is_public, is_marketplace, version
) VALUES (
    0,
    'OmniNudge Light',
    'Clean, bright default light theme with excellent readability',
    'predefined',
    'global',
    '{
        "color-primary": "#3b82f6",
        "color-primary-hover": "#2563eb",
        "color-primary-light": "#dbeafe",
        "color-background": "#ffffff",
        "color-background-secondary": "#f9fafb",
        "color-background-tertiary": "#f3f4f6",
        "color-text-primary": "#111827",
        "color-text-secondary": "#6b7280",
        "color-text-tertiary": "#9ca3af",
        "color-border": "#e5e7eb",
        "color-border-light": "#f3f4f6",
        "color-success": "#10b981",
        "color-warning": "#f59e0b",
        "color-error": "#ef4444",
        "color-info": "#3b82f6"
    }'::jsonb,
    true,
    false,
    '1.0.0'
);

-- ============================================================================
-- 2. OmniNudge Dark (Default Dark Theme)
-- ============================================================================
INSERT INTO user_themes (
    user_id, theme_name, theme_description, theme_type, scope_type,
    css_variables, is_public, is_marketplace, version
) VALUES (
    0,
    'OmniNudge Dark',
    'Sleek dark theme optimized for night browsing and reduced eye strain',
    'predefined',
    'global',
    '{
        "color-primary": "#60a5fa",
        "color-primary-hover": "#3b82f6",
        "color-primary-light": "#1e3a8a",
        "color-background": "#111827",
        "color-background-secondary": "#1f2937",
        "color-background-tertiary": "#374151",
        "color-text-primary": "#f9fafb",
        "color-text-secondary": "#d1d5db",
        "color-text-tertiary": "#9ca3af",
        "color-border": "#374151",
        "color-border-light": "#4b5563",
        "color-success": "#34d399",
        "color-warning": "#fbbf24",
        "color-error": "#f87171",
        "color-info": "#60a5fa"
    }'::jsonb,
    true,
    false,
    '1.0.0'
);

-- ============================================================================
-- 3. Midnight (Deep Blue Dark Theme)
-- ============================================================================
INSERT INTO user_themes (
    user_id, theme_name, theme_description, theme_type, scope_type,
    css_variables, is_public, is_marketplace, version
) VALUES (
    0,
    'Midnight',
    'Deep blue dark theme with cool tones, perfect for late-night browsing',
    'predefined',
    'global',
    '{
        "color-primary": "#60a5fa",
        "color-primary-hover": "#3b82f6",
        "color-primary-light": "#1e40af",
        "color-background": "#0c1222",
        "color-background-secondary": "#1e293b",
        "color-background-tertiary": "#334155",
        "color-text-primary": "#f1f5f9",
        "color-text-secondary": "#cbd5e1",
        "color-text-tertiary": "#94a3b8",
        "color-border": "#334155",
        "color-border-light": "#475569",
        "color-success": "#22d3ee",
        "color-warning": "#fbbf24",
        "color-error": "#f472b6",
        "color-info": "#60a5fa"
    }'::jsonb,
    true,
    false,
    '1.0.0'
);

-- ============================================================================
-- 4. Sunset (Warm Orange/Pink Gradients)
-- ============================================================================
INSERT INTO user_themes (
    user_id, theme_name, theme_description, theme_type, scope_type,
    css_variables, is_public, is_marketplace, version
) VALUES (
    0,
    'Sunset',
    'Warm sunset vibes with orange and pink gradients, cozy and inviting',
    'predefined',
    'global',
    '{
        "color-primary": "#f97316",
        "color-primary-hover": "#ea580c",
        "color-primary-light": "#ffedd5",
        "color-background": "#fff7ed",
        "color-background-secondary": "#ffedd5",
        "color-background-tertiary": "#fed7aa",
        "color-text-primary": "#7c2d12",
        "color-text-secondary": "#9a3412",
        "color-text-tertiary": "#c2410c",
        "color-border": "#fed7aa",
        "color-border-light": "#ffedd5",
        "color-success": "#10b981",
        "color-warning": "#f59e0b",
        "color-error": "#f43f5e",
        "color-info": "#f97316"
    }'::jsonb,
    true,
    false,
    '1.0.0'
);

-- ============================================================================
-- 5. Forest (Green Nature-Inspired)
-- ============================================================================
INSERT INTO user_themes (
    user_id, theme_name, theme_description, theme_type, scope_type,
    css_variables, is_public, is_marketplace, version
) VALUES (
    0,
    'Forest',
    'Calming green nature-inspired theme with earthy tones',
    'predefined',
    'global',
    '{
        "color-primary": "#10b981",
        "color-primary-hover": "#059669",
        "color-primary-light": "#d1fae5",
        "color-background": "#f0fdf4",
        "color-background-secondary": "#dcfce7",
        "color-background-tertiary": "#bbf7d0",
        "color-text-primary": "#14532d",
        "color-text-secondary": "#166534",
        "color-text-tertiary": "#15803d",
        "color-border": "#bbf7d0",
        "color-border-light": "#dcfce7",
        "color-success": "#10b981",
        "color-warning": "#f59e0b",
        "color-error": "#ef4444",
        "color-info": "#14b8a6"
    }'::jsonb,
    true,
    false,
    '1.0.0'
);

-- ============================================================================
-- 6. Ocean (Blue Aquatic Theme)
-- ============================================================================
INSERT INTO user_themes (
    user_id, theme_name, theme_description, theme_type, scope_type,
    css_variables, is_public, is_marketplace, version
) VALUES (
    0,
    'Ocean',
    'Refreshing blue aquatic theme with wave-like tranquility',
    'predefined',
    'global',
    '{
        "color-primary": "#0ea5e9",
        "color-primary-hover": "#0284c7",
        "color-primary-light": "#e0f2fe",
        "color-background": "#f0f9ff",
        "color-background-secondary": "#e0f2fe",
        "color-background-tertiary": "#bae6fd",
        "color-text-primary": "#0c4a6e",
        "color-text-secondary": "#075985",
        "color-text-tertiary": "#0369a1",
        "color-border": "#bae6fd",
        "color-border-light": "#e0f2fe",
        "color-success": "#06b6d4",
        "color-warning": "#f59e0b",
        "color-error": "#ef4444",
        "color-info": "#0ea5e9"
    }'::jsonb,
    true,
    false,
    '1.0.0'
);

-- ============================================================================
-- 7. Lavender (Soft Purple Theme)
-- ============================================================================
INSERT INTO user_themes (
    user_id, theme_name, theme_description, theme_type, scope_type,
    css_variables, is_public, is_marketplace, version
) VALUES (
    0,
    'Lavender',
    'Soft purple theme with gentle, soothing pastel tones',
    'predefined',
    'global',
    '{
        "color-primary": "#a855f7",
        "color-primary-hover": "#9333ea",
        "color-primary-light": "#f3e8ff",
        "color-background": "#faf5ff",
        "color-background-secondary": "#f3e8ff",
        "color-background-tertiary": "#e9d5ff",
        "color-text-primary": "#581c87",
        "color-text-secondary": "#6b21a8",
        "color-text-tertiary": "#7e22ce",
        "color-border": "#e9d5ff",
        "color-border-light": "#f3e8ff",
        "color-success": "#10b981",
        "color-warning": "#f59e0b",
        "color-error": "#f43f5e",
        "color-info": "#a855f7"
    }'::jsonb,
    true,
    false,
    '1.0.0'
);

-- ============================================================================
-- 8. Monochrome (Black & White Classic)
-- ============================================================================
INSERT INTO user_themes (
    user_id, theme_name, theme_description, theme_type, scope_type,
    css_variables, is_public, is_marketplace, version
) VALUES (
    0,
    'Monochrome',
    'Classic black and white theme for maximum contrast and minimal distraction',
    'predefined',
    'global',
    '{
        "color-primary": "#000000",
        "color-primary-hover": "#1f2937",
        "color-primary-light": "#f3f4f6",
        "color-background": "#ffffff",
        "color-background-secondary": "#f9fafb",
        "color-background-tertiary": "#f3f4f6",
        "color-text-primary": "#000000",
        "color-text-secondary": "#374151",
        "color-text-tertiary": "#6b7280",
        "color-border": "#d1d5db",
        "color-border-light": "#e5e7eb",
        "color-success": "#000000",
        "color-warning": "#6b7280",
        "color-error": "#000000",
        "color-info": "#374151"
    }'::jsonb,
    true,
    false,
    '1.0.0'
);

-- Verify the themes were created
SELECT
    id,
    theme_name,
    theme_description,
    theme_type,
    is_public,
    version,
    created_at
FROM user_themes
WHERE user_id = 0
ORDER BY id;

-- Show count
SELECT COUNT(*) as predefined_theme_count FROM user_themes WHERE user_id = 0;
