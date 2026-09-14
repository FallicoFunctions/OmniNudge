// Command grant_credits gives OmniCredits to one account by hand: a test
// account, or a gift. The grant is recorded as an admin grant, never as a
// purchase.
//
// Usage:
//
//	go run ./cmd/grant_credits -username NAME -credits N [-operation UUID]
//
// Passing the same -operation again is the same grant, not a second one.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/joho/godotenv"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
)

// A typo of a few extra zeros should not hand out a fortune.
const maxGrant = 100_000

func main() {
	var (
		username  = flag.String("username", "", "the account to give credits to")
		credits   = flag.Int64("credits", 0, "how many credits to give")
		operation = flag.String("operation", "", "an id that makes a repeated run the same grant (default: a new one)")
	)
	flag.Parse()

	name := strings.TrimSpace(*username)
	if name == "" {
		fatalf("-username is required")
	}
	if *credits < 1 || *credits > maxGrant {
		fatalf("-credits must be between 1 and %d", maxGrant)
	}
	operationID := uuid.New()
	if *operation != "" {
		parsed, err := uuid.Parse(*operation)
		if err != nil {
			fatalf("-operation is not a UUID: %v", err)
		}
		operationID = parsed
	}

	_ = godotenv.Load(".env", "backend/.env")
	cfg, err := config.Load()
	if err != nil {
		fatalf("load config: %v", err)
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		fatalf("connect to database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	user, err := models.NewUserRepository(db.Pool).GetByUsername(ctx, name)
	if err != nil || user == nil {
		fatalf("no account named %q", name)
	}
	wallet, err := models.NewOmniCreditsRepository(db.Pool).GrantAdminCredits(ctx, user.ID, operationID, *credits)
	if err != nil {
		fatalf("grant credits: %v", err)
	}
	fmt.Printf("Gave %d credits to %s (user %d). Balance: %d purchased, %d subscription. Operation %s.\n",
		*credits, name, user.ID, wallet.PurchasedBalance, wallet.SubscriptionBalance, operationID)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
