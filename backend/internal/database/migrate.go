package database

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate runs all pending up migrations
func (db *DB) Migrate(ctx context.Context) error {
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

	// Get all up migration files
	files, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("failed to read migrations directory: %w", err)
	}

	// Filter and sort up migrations
	var upMigrations []string
	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".up.sql") {
			upMigrations = append(upMigrations, file.Name())
		}
	}
	sort.Strings(upMigrations)

	// Run pending migrations
	for _, filename := range upMigrations {
		version := strings.TrimSuffix(filename, ".up.sql")
		if applied[version] {
			continue
		}

		content, err := fs.ReadFile(migrationsFS, "migrations/"+filename)
		if err != nil {
			return fmt.Errorf("failed to read migration %s: %w", filename, err)
		}

		// Execute migration in a transaction
		tx, err := db.Pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("failed to begin transaction for %s: %w", filename, err)
		}

		if _, err := tx.Exec(ctx, string(content)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("failed to execute migration %s: %w", filename, err)
		}

		if _, err := tx.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", version); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("failed to record migration %s: %w", filename, err)
		}

		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("failed to commit migration %s: %w", filename, err)
		}

		fmt.Printf("Applied migration: %s\n", version)
	}

	return nil
}

// MigrateDown rolls back the last migration
func (db *DB) MigrateDown(ctx context.Context) error {
	// Get the last applied migration
	var version string
	err := db.Pool.QueryRow(ctx, `
		SELECT version FROM schema_migrations
		ORDER BY applied_at DESC
		LIMIT 1
	`).Scan(&version)
	if err != nil {
		return fmt.Errorf("no migrations to rollback: %w", err)
	}

	// Read the down migration file
	downFile := version + ".down.sql"
	content, err := fs.ReadFile(migrationsFS, "migrations/"+downFile)
	if err != nil {
		return fmt.Errorf("failed to read down migration %s: %w", downFile, err)
	}

	// Execute rollback in a transaction
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	if _, err := tx.Exec(ctx, string(content)); err != nil {
		tx.Rollback(ctx)
		return fmt.Errorf("failed to execute rollback %s: %w", downFile, err)
	}

	if _, err := tx.Exec(ctx, "DELETE FROM schema_migrations WHERE version = $1", version); err != nil {
		tx.Rollback(ctx)
		return fmt.Errorf("failed to remove migration record %s: %w", version, err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit rollback: %w", err)
	}

	fmt.Printf("Rolled back migration: %s\n", version)
	return nil
}
