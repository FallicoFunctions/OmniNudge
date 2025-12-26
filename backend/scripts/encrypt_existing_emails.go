package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/utils"
)

// This script encrypts all existing plaintext emails in the database
// Run this after deploying the email encryption feature

func main() {
	log.Println("Starting email encryption migration...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize encryption
	if err := utils.SetEncryptionKey(cfg.Encryption.Key); err != nil {
		log.Fatalf("Failed to initialize encryption: %v", err)
	}
	log.Println("Encryption initialized")

	// Connect to database
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.Database.DatabaseURL())
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()
	log.Println("Connected to database")

	// Find all users with non-encrypted emails
	query := `
		SELECT id, email
		FROM users
		WHERE email IS NOT NULL
		  AND email != ''
		  AND (email_encrypted IS NULL OR email_encrypted = FALSE)
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		log.Fatalf("Failed to query users: %v", err)
	}
	defer rows.Close()

	type UserEmail struct {
		ID    int
		Email string
	}

	var users []UserEmail
	for rows.Next() {
		var u UserEmail
		if err := rows.Scan(&u.ID, &u.Email); err != nil {
			log.Fatalf("Failed to scan row: %v", err)
		}
		users = append(users, u)
	}

	if err := rows.Err(); err != nil {
		log.Fatalf("Error iterating rows: %v", err)
	}

	log.Printf("Found %d users with plaintext emails to encrypt", len(users))

	if len(users) == 0 {
		log.Println("No emails to encrypt. Migration complete.")
		return
	}

	// Confirm before proceeding
	fmt.Print("\nThis will encrypt all plaintext emails. Continue? (yes/no): ")
	var response string
	fmt.Scanln(&response)
	if response != "yes" {
		log.Println("Migration cancelled")
		os.Exit(0)
	}

	// Encrypt each email
	updateQuery := `
		UPDATE users
		SET email = $1, email_encrypted = TRUE
		WHERE id = $2
	`

	successCount := 0
	failCount := 0

	for _, user := range users {
		encrypted, err := utils.EncryptEmail(user.Email)
		if err != nil {
			log.Printf("ERROR: Failed to encrypt email for user %d: %v", user.ID, err)
			failCount++
			continue
		}

		_, err = pool.Exec(ctx, updateQuery, encrypted, user.ID)
		if err != nil {
			log.Printf("ERROR: Failed to update user %d: %v", user.ID, err)
			failCount++
			continue
		}

		successCount++
		if successCount%100 == 0 {
			log.Printf("Progress: %d/%d emails encrypted", successCount, len(users))
		}
	}

	log.Printf("\nMigration complete!")
	log.Printf("  Successfully encrypted: %d emails", successCount)
	log.Printf("  Failed: %d emails", failCount)

	if failCount > 0 {
		log.Println("\nWARNING: Some emails failed to encrypt. Check the logs above.")
		os.Exit(1)
	}
}
