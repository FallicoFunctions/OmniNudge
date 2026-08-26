// Command eval_omnichat_responses runs OmniChat's versioned multi-turn
// continuity regression corpus against a server-owned model profile. It loads
// active public default personas and synthetic prompts only, never user
// conversations, and its JSON report intentionally excludes response text.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
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

type responseEvaluationOptions struct {
	profile         services.OmniChatModelProfileKey
	modelOverride   string
	caseTimeout     time.Duration
	confirmPaid     bool
	allowProduction bool
}

func main() {
	options, err := parseResponseEvaluationOptions(os.Args[1:], os.Stderr)
	if errors.Is(err, flag.ErrHelp) {
		return
	}
	if err != nil {
		fatalf("%v", err)
	}
	_ = godotenv.Load(".env", "backend/.env")
	cfg, err := config.Load()
	if err != nil {
		fatalf("load configuration: %v", err)
	}
	if strings.TrimSpace(cfg.OpenRouter.APIKey) == "" {
		fatalf("OPENROUTER_API_KEY is required")
	}
	if strings.EqualFold(strings.TrimSpace(cfg.AppEnv), "production") && !options.allowProduction {
		fatalf("production response evaluations are disabled; pass -allow-production only for the isolated synthetic/public corpus")
	}
	profile, err := configuredEvaluationProfile(cfg, options.profile, options.modelOverride)
	if err != nil {
		fatalf("configure evaluation profile: %v", err)
	}
	modelRoute := strings.TrimSpace(profile.ModelKey)
	if modelRoute == "" || modelRoute == "openrouter/free" {
		fatalf("a stable named model route is required for profile %q", profile.Key)
	}

	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		fatalf("connect to database: %v", err)
	}
	defer db.Close()

	corpus := services.DefaultResponseEvaluationCorpus()
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(len(corpus.Cases))*(options.caseTimeout+time.Second))
	defer cancel()
	personas, err := loadRequiredPublicPersonas(ctx, models.NewBotPersonaRepository(db.Pool), corpus)
	if err != nil {
		fatalf("load public personas: %v", err)
	}

	client, err := services.NewOmniChatProfileEvaluationClient(openrouter.NewClient(cfg.OpenRouter.APIKey, modelRoute), profile)
	if err != nil {
		fatalf("configure profile completion client: %v", err)
	}
	// What the corpus asserts about format has to follow what each character is
	// actually configured as, or a style change silently invalidates the whole
	// corpus and it reports failure against correct behaviour.
	corpus = services.AlignResponseEvaluationCorpusToPersonas(corpus, personas)

	report, err := services.RunResponseEvaluationCorpus(ctx, corpus, func(parent context.Context, testCase services.ResponseEvaluationCase) (string, error) {
		caseCtx, cancelCase := context.WithTimeout(parent, options.caseTimeout)
		defer cancelCase()
		return services.GenerateResponseEvaluationCase(caseCtx, client, personas[testCase.PersonaSlug], testCase)
	})
	if err != nil {
		fatalf("run response evaluation: %v", err)
	}
	if err := services.WriteResponseEvaluationReport(os.Stdout, report); err != nil {
		fatalf("write response evaluation report: %v", err)
	}
	if !report.Passed {
		os.Exit(1)
	}
}

func parseResponseEvaluationOptions(arguments []string, output io.Writer) (responseEvaluationOptions, error) {
	flags := flag.NewFlagSet("eval_omnichat_responses", flag.ContinueOnError)
	flags.SetOutput(output)
	profileValue := flags.String("profile", string(services.OmniChatModelProfileStandard), "server-owned OmniChat model profile")
	modelValue := flags.String("model", "", "optional named OpenRouter route override for the selected profile")
	caseTimeout := flags.Duration("case-timeout", 45*time.Second, "timeout for each synthetic response")
	confirmPaid := flags.Bool("confirm-paid", false, "confirm that this command makes paid provider requests")
	allowProduction := flags.Bool("allow-production", false, "allow an explicitly confirmed synthetic/public evaluation in production")
	if err := flags.Parse(arguments); err != nil {
		return responseEvaluationOptions{}, err
	}
	if *caseTimeout <= 0 || *caseTimeout > 5*time.Minute {
		return responseEvaluationOptions{}, fmt.Errorf("case-timeout must be greater than zero and no more than 5m")
	}
	if !*confirmPaid {
		return responseEvaluationOptions{}, fmt.Errorf("-confirm-paid is required before configuration, database, or provider access")
	}
	if flags.NArg() != 0 {
		return responseEvaluationOptions{}, fmt.Errorf("unexpected positional arguments")
	}
	return responseEvaluationOptions{
		profile:         services.OmniChatModelProfileKey(strings.TrimSpace(*profileValue)),
		modelOverride:   strings.TrimSpace(*modelValue),
		caseTimeout:     *caseTimeout,
		confirmPaid:     *confirmPaid,
		allowProduction: *allowProduction,
	}, nil
}

func configuredEvaluationProfile(
	cfg *config.Config,
	key services.OmniChatModelProfileKey,
	modelOverride string,
) (services.OmniChatModelProfile, error) {
	if cfg == nil {
		return services.OmniChatModelProfile{}, fmt.Errorf("configuration is required")
	}
	catalogProfile, found := services.FindOmniChatModelProfile(key)
	if !found {
		return services.OmniChatModelProfile{}, fmt.Errorf("unknown profile %q", key)
	}
	routes, err := services.ResolveConfiguredOmniChatModelRoutes(map[services.OmniChatModelProfileKey]string{
		services.OmniChatModelProfileStandard:     cfg.OpenRouter.StandardModel,
		services.OmniChatModelProfilePlus:         cfg.OpenRouter.PlusModel,
		services.OmniChatModelProfilePremiumQuick: cfg.OpenRouter.PremiumQuickModel,
		services.OmniChatModelProfilePremiumDeep:  cfg.OpenRouter.PremiumDeepModel,
	}, cfg.OpenRouter.StandardFallback)
	if err != nil {
		return services.OmniChatModelProfile{}, err
	}
	catalogProfile.ModelKey = routes[key]
	if override := strings.TrimSpace(modelOverride); override != "" {
		if !openrouter.IsValidModelRoute(override) {
			return services.OmniChatModelProfile{}, fmt.Errorf("model override is not a valid named route")
		}
		catalogProfile.ModelKey = override
	}
	return catalogProfile, nil
}

func loadRequiredPublicPersonas(
	ctx context.Context,
	repo *models.BotPersonaRepository,
	corpus services.ResponseEvaluationCorpus,
) (map[string]*models.BotPersona, error) {
	catalog, err := repo.ListCatalog(ctx, "", nil)
	if err != nil {
		return nil, err
	}
	required := make(map[string]bool)
	for _, testCase := range corpus.Cases {
		required[testCase.PersonaSlug] = true
	}
	personas := make(map[string]*models.BotPersona, len(required))
	for _, persona := range catalog {
		if required[persona.Slug] && persona.OwnerUserID == nil && persona.Visibility == "public" && persona.IsActive {
			personas[persona.Slug] = persona
		}
	}
	for slug := range required {
		if personas[slug] == nil {
			return nil, fmt.Errorf("required active public default persona %q was not found", slug)
		}
	}
	return personas, nil
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
