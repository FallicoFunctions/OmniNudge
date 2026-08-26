// Command derive_omnichat_baselines reads platform characters' cards and stores
// the resting disposition each one implies.
//
// A character's authored personality reached the system prompt and nothing
// else: dispositionally, a character written as guarded started exactly as
// trusting as one written as open. This closes that, once per character. It is
// offline on purpose -- nothing on a request path may call a model to find out
// who a character has always been -- and it is idempotent, so the safe thing to
// do with it is run it again.
//
// Usage:
//
//	go run ./cmd/derive_omnichat_baselines [-dry-run] [-force] [-limit N] [-model M]
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/openrouter"
)

func main() {
	var (
		dryRun = flag.Bool("dry-run", false, "derive and print without storing anything")
		force  = flag.Bool("force", false, "re-derive characters that already have a baseline, and overwrite it")
		limit  = flag.Int("limit", 0, "stop after this many characters (0 means all of them)")
		model  = flag.String("model", "", "override the model; defaults to the configured standard model")
		pause  = flag.Duration("pause", time.Second, "wait between calls so a long run does not trip a rate limit")
	)
	flag.Parse()

	_ = godotenv.Load(".env", "backend/.env")

	cfg, err := config.Load()
	if err != nil {
		fatalf("load config: %v", err)
	}
	if strings.TrimSpace(cfg.OpenRouter.APIKey) == "" {
		fatalf("OPENROUTER_API_KEY is required")
	}
	// The same model the server gives extraction: this is a background read of
	// a character, on the same terms, and running it against something else
	// would derive baselines nothing in production would have produced.
	chosenModel := strings.TrimSpace(*model)
	if chosenModel == "" {
		chosenModel = strings.TrimSpace(cfg.OpenRouter.ExtractionModel)
	}
	if chosenModel == "" {
		chosenModel = strings.TrimSpace(cfg.OpenRouter.StandardFallback)
	}
	if chosenModel == "" {
		fatalf("no model configured: set OMNICHAT_MODEL_STANDARD_PRIMARY or pass -model")
	}

	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		fatalf("connect to database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	personas := models.NewBotPersonaRepository(db.Pool)
	deriver := services.NewOmniChatDispositionBaselineDeriver(
		openrouter.NewClient(cfg.OpenRouter.APIKey, chosenModel),
	)

	pending, err := personas.ListPlatformPersonasForBaseline(ctx, *force, *limit)
	if err != nil {
		fatalf("list characters: %v", err)
	}
	if len(pending) == 0 {
		fmt.Println("Every platform character already has a baseline. Nothing to derive.")
		return
	}
	fmt.Printf("Deriving %d character(s) with %s.\n\n", len(pending), chosenModel)

	derived, skipped, unreadable, failed := 0, 0, 0, 0
	for index, persona := range pending {
		if index > 0 && *pause > 0 {
			time.Sleep(*pause)
		}
		// A failure here is one character's derivation, not the run's. Nothing
		// is retried: a refused response usually means the model misread the
		// contract, and asking it again immediately spends quota to be told the
		// same thing. Re-run the command later; it will pick up whatever is
		// still NULL.
		baseline, err := deriver.Derive(ctx, persona)
		if errors.Is(err, services.ErrOmniChatBaselineUnreadable) {
			// A card with no temperament in it, which the pure narrators
			// genuinely are. Left underived it behaves as neutral, which is
			// right for a device rather than a person.
			unreadable++
			fmt.Printf("  %-28s no temperament to read, left underived\n", persona.Slug)
			continue
		}
		if err != nil {
			failed++
			fmt.Printf("  %-28s FAILED  %v\n", persona.Slug, err)
			continue
		}
		if *dryRun {
			fmt.Printf("  %-28s mood %+.2f  trust %+.2f  warmth %+.2f  firmness %+.2f  (dry run, not stored)\n",
				persona.Slug, baseline.Mood, baseline.Trust, baseline.Warmth, baseline.Firmness)
			continue
		}
		stored, err := personas.SetOmniChatDispositionBaseline(ctx, persona.ID, baseline, *force)
		if err != nil {
			failed++
			fmt.Printf("  %-28s FAILED  %v\n", persona.Slug, err)
			continue
		}
		if !stored {
			skipped++
			fmt.Printf("  %-28s already derived, left alone\n", persona.Slug)
			continue
		}
		derived++
		fmt.Printf("  %-28s mood %+.2f  trust %+.2f  warmth %+.2f  firmness %+.2f\n",
			persona.Slug, baseline.Mood, baseline.Trust, baseline.Warmth, baseline.Firmness)
	}

	fmt.Printf("\n%d derived, %d left alone, %d with no temperament to read, %d failed.\n",
		derived, skipped, unreadable, failed)
	if failed > 0 {
		os.Exit(1)
	}
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
