package database

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate runs all pending up migrations
func (db *DB) Migrate(ctx context.Context) error {
	// Create migrations tracking table if it doesn't exist
	_, err := db.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.schema_migrations (
			version VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	// Get list of applied migrations
	applied := make(map[string]bool)
	rows, err := db.Pool.Query(ctx, "SELECT version FROM public.schema_migrations")
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

	// Check for errors during iteration
	if err := rows.Err(); err != nil {
		return fmt.Errorf("error iterating migration rows: %w", err)
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
		contentStr := string(content)
		requiresNoTransaction := strings.Contains(strings.ToUpper(contentStr), "CONCURRENTLY")

		if requiresNoTransaction {
			if err := executeStatements(ctx, db.Pool, contentStr); err != nil {
				return fmt.Errorf("failed to execute migration %s: %w", filename, err)
			}
			if _, err := db.Pool.Exec(ctx, "INSERT INTO public.schema_migrations (version) VALUES ($1)", version); err != nil {
				return fmt.Errorf("failed to record migration %s: %w", filename, err)
			}
			fmt.Printf("Applied migration: %s\n", version)
			continue
		}

		// Execute migration in a transaction
		tx, err := db.Pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("failed to begin transaction for %s: %w", filename, err)
		}

		if _, err := tx.Exec(ctx, contentStr); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("failed to execute migration %s: %w", filename, err)
		}

		if _, err := tx.Exec(ctx, "INSERT INTO public.schema_migrations (version) VALUES ($1)", version); err != nil {
			_ = tx.Rollback(ctx)
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
		SELECT version FROM public.schema_migrations
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
	contentStr := string(content)
	requiresNoTransaction := strings.Contains(strings.ToUpper(contentStr), "CONCURRENTLY")

	if requiresNoTransaction {
		if err := executeStatements(ctx, db.Pool, contentStr); err != nil {
			return fmt.Errorf("failed to execute rollback %s: %w", downFile, err)
		}
		if _, err := db.Pool.Exec(ctx, "DELETE FROM public.schema_migrations WHERE version = $1", version); err != nil {
			return fmt.Errorf("failed to remove migration record %s: %w", version, err)
		}
		fmt.Printf("Rolled back migration: %s\n", version)
		return nil
	}

	// Execute rollback in a transaction
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	if _, err := tx.Exec(ctx, string(content)); err != nil {
		_ = tx.Rollback(ctx)
		return fmt.Errorf("failed to execute rollback %s: %w", downFile, err)
	}

	if _, err := tx.Exec(ctx, "DELETE FROM public.schema_migrations WHERE version = $1", version); err != nil {
		_ = tx.Rollback(ctx)
		return fmt.Errorf("failed to remove migration record %s: %w", version, err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit rollback: %w", err)
	}

	fmt.Printf("Rolled back migration: %s\n", version)
	return nil
}

func executeStatements(ctx context.Context, pool execer, content string) error {
	statements := strings.Split(content, ";")
	for _, statement := range statements {
		trimmed := strings.TrimSpace(statement)
		if trimmed == "" {
			continue
		}
		if _, err := pool.Exec(ctx, trimmed); err != nil {
			return err
		}
	}
	return nil
}

type execer interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

// GetPendingMigrations returns a list of pending migrations
func GetPendingMigrations(applied map[string]bool) ([]string, error) {
	// Get all up migration files
	files, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("failed to read migrations directory: %w", err)
	}

	// Filter and sort up migrations
	var upMigrations []string
	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".up.sql") {
			version := strings.TrimSuffix(file.Name(), ".up.sql")
			if !applied[version] {
				upMigrations = append(upMigrations, version)
			}
		}
	}
	sort.Strings(upMigrations)

	return upMigrations, nil
}
