package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
)

func main() {
	// Parse command line flags
	action := flag.String("action", "", "Migration action: up, down, status, dry-run")
	steps := flag.Int("steps", 1, "Number of migrations to roll back (for down action)")
	flag.Parse()

	if *action == "" {
		fmt.Println("Usage: migrate -action=<up|down|status|dry-run> [-steps=N]")
		fmt.Println("")
		fmt.Println("Actions:")
		fmt.Println("  up       - Apply all pending migrations")
		fmt.Println("  down     - Roll back the last N migrations (default: 1)")
		fmt.Println("  status   - Show migration status")
		fmt.Println("  dry-run  - Show which migrations would be applied without applying them")
		fmt.Println("")
		fmt.Println("Examples:")
		fmt.Println("  migrate -action=up")
		fmt.Println("  migrate -action=down")
		fmt.Println("  migrate -action=down -steps=3")
		fmt.Println("  migrate -action=status")
		fmt.Println("  migrate -action=dry-run")
		os.Exit(1)
	}

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

	// Execute action
	switch *action {
	case "up":
		fmt.Println("Running migrations...")
		if err := db.Migrate(ctx); err != nil {
			log.Fatalf("Migration failed: %v", err)
		}
		fmt.Println("✅ All migrations applied successfully")

	case "down":
		for i := 0; i < *steps; i++ {
			fmt.Printf("Rolling back migration %d/%d...\n", i+1, *steps)
			if err := db.MigrateDown(ctx); err != nil {
				log.Fatalf("Rollback failed: %v", err)
			}
		}
		fmt.Printf("✅ Successfully rolled back %d migration(s)\n", *steps)

	case "status":
		if err := showStatus(ctx, db); err != nil {
			log.Fatalf("Failed to show status: %v", err)
		}

	case "dry-run":
		if err := dryRun(ctx, db); err != nil {
			log.Fatalf("Dry run failed: %v", err)
		}

	default:
		log.Fatalf("Unknown action: %s", *action)
	}
}

// showStatus displays the current migration status
func showStatus(ctx context.Context, db *database.DB) error {
	// Get all applied migrations
	rows, err := db.Pool.Query(ctx, `
		SELECT version, applied_at
		FROM schema_migrations
		ORDER BY version ASC
	`)
	if err != nil {
		return fmt.Errorf("failed to query migrations: %w", err)
	}
	defer rows.Close()

	fmt.Println("Applied Migrations:")
	fmt.Println("==================")

	count := 0
	for rows.Next() {
		var version string
		var appliedAt time.Time
		if err := rows.Scan(&version, &appliedAt); err != nil {
			return fmt.Errorf("failed to scan row: %w", err)
		}
		fmt.Printf("✅ %s (applied: %s)\n", version, appliedAt.Format("2006-01-02 15:04:05"))
		count++
	}

	if count == 0 {
		fmt.Println("No migrations applied yet")
	} else {
		fmt.Printf("\nTotal: %d migration(s) applied\n", count)
	}

	return rows.Err()
}

// dryRun shows which migrations would be applied without applying them
func dryRun(ctx context.Context, db *database.DB) error {
	// Create migrations tracking table if it doesn't exist
	_, err := db.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	// Get list of applied migrations
	applied := make(map[string]bool)
	rows, err := db.Pool.Query(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return fmt.Errorf("failed to query migrations: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var version string
		if err := rows.Scan(&version); err != nil {
			return fmt.Errorf("failed to scan migration version: %w", err)
		}
		applied[version] = true
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("error iterating migration rows: %w", err)
	}

	// Get all up migration files
	migrations, err := database.GetPendingMigrations(applied)
	if err != nil {
		return fmt.Errorf("failed to get pending migrations: %w", err)
	}

	if len(migrations) == 0 {
		fmt.Println("✅ No pending migrations - database is up to date")
		return nil
	}

	fmt.Println("Pending Migrations (dry run):")
	fmt.Println("==============================")
	for _, migration := range migrations {
		fmt.Printf("📄 %s\n", migration)
	}
	fmt.Printf("\nTotal: %d migration(s) pending\n", len(migrations))
	fmt.Println("\nRun with -action=up to apply these migrations")

	return nil
}
