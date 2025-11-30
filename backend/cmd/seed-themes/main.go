package main

import (
	"context"
	"log"
	"os"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
)

func main() {
	log.Println("Starting theme seed script...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Connect to database
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	themeRepo := models.NewUserThemeRepository(db.Pool)

	// Create system user (user_id = 0) if not exists
	_, err = db.Pool.Exec(ctx, `
		INSERT INTO users (id, username, password_hash, reddit_id, created_at, last_seen, karma)
		VALUES (0, 'system', '', 'system', NOW(), NOW(), 0)
		ON CONFLICT (id) DO NOTHING
	`)
	if err != nil {
		log.Fatalf("Failed to create system user: %v", err)
	}

	// Delete existing predefined themes
	_, err = db.Pool.Exec(ctx, "DELETE FROM user_themes WHERE user_id = 0")
	if err != nil {
		log.Fatalf("Failed to delete existing predefined themes: %v", err)
	}

	// Define the 8 predefined themes
	themes := []models.UserTheme{
		// 1. OmniNudge Light
		{
			UserID:           0,
			ThemeName:        "OmniNudge Light",
			ThemeDescription: strPtr("Clean, bright default light theme with excellent readability"),
			ThemeType:        "predefined",
			ScopeType:        "global",
			CSSVariables: map[string]interface{}{
				"color-primary":              "#3b82f6",
				"color-primary-hover":        "#2563eb",
				"color-primary-light":        "#dbeafe",
				"color-background":           "#ffffff",
				"color-background-secondary": "#f9fafb",
				"color-background-tertiary":  "#f3f4f6",
				"color-text-primary":         "#111827",
				"color-text-secondary":       "#6b7280",
				"color-text-tertiary":        "#9ca3af",
				"color-border":               "#e5e7eb",
				"color-border-light":         "#f3f4f6",
				"color-success":              "#10b981",
				"color-warning":              "#f59e0b",
				"color-error":                "#ef4444",
				"color-info":                 "#3b82f6",
			},
			IsPublic:      true,
			IsMarketplace: false,
			Version:       "1.0.0",
		},

		// 2. OmniNudge Dark
		{
			UserID:           0,
			ThemeName:        "OmniNudge Dark",
			ThemeDescription: strPtr("Sleek dark theme optimized for night browsing and reduced eye strain"),
			ThemeType:        "predefined",
			ScopeType:        "global",
			CSSVariables: map[string]interface{}{
				"color-primary":              "#60a5fa",
				"color-primary-hover":        "#3b82f6",
				"color-primary-light":        "#1e3a8a",
				"color-background":           "#111827",
				"color-background-secondary": "#1f2937",
				"color-background-tertiary":  "#374151",
				"color-text-primary":         "#f9fafb",
				"color-text-secondary":       "#d1d5db",
				"color-text-tertiary":        "#9ca3af",
				"color-border":               "#374151",
				"color-border-light":         "#4b5563",
				"color-success":              "#34d399",
				"color-warning":              "#fbbf24",
				"color-error":                "#f87171",
				"color-info":                 "#60a5fa",
			},
			IsPublic:      true,
			IsMarketplace: false,
			Version:       "1.0.0",
		},

		// 3. Midnight
		{
			UserID:           0,
			ThemeName:        "Midnight",
			ThemeDescription: strPtr("Deep blue dark theme with cool tones, perfect for late-night browsing"),
			ThemeType:        "predefined",
			ScopeType:        "global",
			CSSVariables: map[string]interface{}{
				"color-primary":              "#60a5fa",
				"color-primary-hover":        "#3b82f6",
				"color-primary-light":        "#1e40af",
				"color-background":           "#0c1222",
				"color-background-secondary": "#1e293b",
				"color-background-tertiary":  "#334155",
				"color-text-primary":         "#f1f5f9",
				"color-text-secondary":       "#cbd5e1",
				"color-text-tertiary":        "#94a3b8",
				"color-border":               "#334155",
				"color-border-light":         "#475569",
				"color-success":              "#22d3ee",
				"color-warning":              "#fbbf24",
				"color-error":                "#f472b6",
				"color-info":                 "#60a5fa",
			},
			IsPublic:      true,
			IsMarketplace: false,
			Version:       "1.0.0",
		},

		// 4. Sunset
		{
			UserID:           0,
			ThemeName:        "Sunset",
			ThemeDescription: strPtr("Warm sunset vibes with orange and pink gradients, cozy and inviting"),
			ThemeType:        "predefined",
			ScopeType:        "global",
			CSSVariables: map[string]interface{}{
				"color-primary":              "#f97316",
				"color-primary-hover":        "#ea580c",
				"color-primary-light":        "#ffedd5",
				"color-background":           "#fff7ed",
				"color-background-secondary": "#ffedd5",
				"color-background-tertiary":  "#fed7aa",
				"color-text-primary":         "#7c2d12",
				"color-text-secondary":       "#9a3412",
				"color-text-tertiary":        "#c2410c",
				"color-border":               "#fed7aa",
				"color-border-light":         "#ffedd5",
				"color-success":              "#10b981",
				"color-warning":              "#f59e0b",
				"color-error":                "#f43f5e",
				"color-info":                 "#f97316",
			},
			IsPublic:      true,
			IsMarketplace: false,
			Version:       "1.0.0",
		},

		// 5. Forest
		{
			UserID:           0,
			ThemeName:        "Forest",
			ThemeDescription: strPtr("Calming green nature-inspired theme with earthy tones"),
			ThemeType:        "predefined",
			ScopeType:        "global",
			CSSVariables: map[string]interface{}{
				"color-primary":              "#10b981",
				"color-primary-hover":        "#059669",
				"color-primary-light":        "#d1fae5",
				"color-background":           "#f0fdf4",
				"color-background-secondary": "#dcfce7",
				"color-background-tertiary":  "#bbf7d0",
				"color-text-primary":         "#14532d",
				"color-text-secondary":       "#166534",
				"color-text-tertiary":        "#15803d",
				"color-border":               "#bbf7d0",
				"color-border-light":         "#dcfce7",
				"color-success":              "#10b981",
				"color-warning":              "#f59e0b",
				"color-error":                "#ef4444",
				"color-info":                 "#14b8a6",
			},
			IsPublic:      true,
			IsMarketplace: false,
			Version:       "1.0.0",
		},

		// 6. Ocean
		{
			UserID:           0,
			ThemeName:        "Ocean",
			ThemeDescription: strPtr("Refreshing blue aquatic theme with wave-like tranquility"),
			ThemeType:        "predefined",
			ScopeType:        "global",
			CSSVariables: map[string]interface{}{
				"color-primary":              "#0ea5e9",
				"color-primary-hover":        "#0284c7",
				"color-primary-light":        "#e0f2fe",
				"color-background":           "#f0f9ff",
				"color-background-secondary": "#e0f2fe",
				"color-background-tertiary":  "#bae6fd",
				"color-text-primary":         "#0c4a6e",
				"color-text-secondary":       "#075985",
				"color-text-tertiary":        "#0369a1",
				"color-border":               "#bae6fd",
				"color-border-light":         "#e0f2fe",
				"color-success":              "#06b6d4",
				"color-warning":              "#f59e0b",
				"color-error":                "#ef4444",
				"color-info":                 "#0ea5e9",
			},
			IsPublic:      true,
			IsMarketplace: false,
			Version:       "1.0.0",
		},

		// 7. Lavender
		{
			UserID:           0,
			ThemeName:        "Lavender",
			ThemeDescription: strPtr("Soft purple theme with gentle, soothing pastel tones"),
			ThemeType:        "predefined",
			ScopeType:        "global",
			CSSVariables: map[string]interface{}{
				"color-primary":              "#a855f7",
				"color-primary-hover":        "#9333ea",
				"color-primary-light":        "#f3e8ff",
				"color-background":           "#faf5ff",
				"color-background-secondary": "#f3e8ff",
				"color-background-tertiary":  "#e9d5ff",
				"color-text-primary":         "#581c87",
				"color-text-secondary":       "#6b21a8",
				"color-text-tertiary":        "#7e22ce",
				"color-border":               "#e9d5ff",
				"color-border-light":         "#f3e8ff",
				"color-success":              "#10b981",
				"color-warning":              "#f59e0b",
				"color-error":                "#f43f5e",
				"color-info":                 "#a855f7",
			},
			IsPublic:      true,
			IsMarketplace: false,
			Version:       "1.0.0",
		},

		// 8. Monochrome
		{
			UserID:           0,
			ThemeName:        "Monochrome",
			ThemeDescription: strPtr("Classic black and white theme for maximum contrast and minimal distraction"),
			ThemeType:        "predefined",
			ScopeType:        "global",
			CSSVariables: map[string]interface{}{
				"color-primary":              "#000000",
				"color-primary-hover":        "#1f2937",
				"color-primary-light":        "#f3f4f6",
				"color-background":           "#ffffff",
				"color-background-secondary": "#f9fafb",
				"color-background-tertiary":  "#f3f4f6",
				"color-text-primary":         "#000000",
				"color-text-secondary":       "#374151",
				"color-text-tertiary":        "#6b7280",
				"color-border":               "#d1d5db",
				"color-border-light":         "#e5e7eb",
				"color-success":              "#000000",
				"color-warning":              "#6b7280",
				"color-error":                "#000000",
				"color-info":                 "#374151",
			},
			IsPublic:      true,
			IsMarketplace: false,
			Version:       "1.0.0",
		},
	}

	// Insert all themes
	log.Printf("Inserting %d predefined themes...", len(themes))
	for i, theme := range themes {
		created, err := themeRepo.Create(ctx, &theme)
		if err != nil {
			log.Fatalf("Failed to create theme '%s': %v", theme.ThemeName, err)
		}
		log.Printf("[%d/%d] Created theme: %s (ID: %d)", i+1, len(themes), created.ThemeName, created.ID)
	}

	log.Println("✅ Successfully seeded all predefined themes!")
	os.Exit(0)
}

func strPtr(s string) *string {
	return &s
}
