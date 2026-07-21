// Command eval_omnichat_personas runs repeatable synthetic quality checks
// against OmniChat's ten public default personas.
//
// Run from backend/ so the command can load backend/.env:
//
//	go run ./cmd/eval_omnichat_personas -suite all
//
// The command is deliberately read-only. It loads no user-owned persona or
// conversation and writes no generated messages to the database.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/openrouter"
)

const maxParallelEvaluations = 4

type indexedResult struct {
	index       int
	qualityCase services.PersonaQualityCase
	result      services.PersonaQualityResult
	err         error
}

func main() {
	var (
		suiteValue  = flag.String("suite", string(services.PersonaQualitySuiteAll), "case suite: all, behavior, boundary, or injection")
		persona     = flag.String("persona", "", "optional exact default-persona slug")
		parallel    = flag.Int("parallel", 2, "parallel model requests (1-4)")
		caseTimeout = flag.Duration("case-timeout", 90*time.Second, "timeout for each model response")
	)
	flag.Parse()

	_ = godotenv.Load(".env", "backend/.env")
	if *parallel < 1 || *parallel > maxParallelEvaluations {
		fatalf("parallel must be between 1 and %d", maxParallelEvaluations)
	}
	if *caseTimeout <= 0 || *caseTimeout > 5*time.Minute {
		fatalf("case-timeout must be greater than zero and no more than 5m")
	}

	suite := services.PersonaQualitySuite(strings.TrimSpace(*suiteValue))
	if !validSuite(suite) {
		fatalf("unknown suite %q; use all, behavior, boundary, or injection", suite)
	}
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	if apiKey == "" {
		fatalf("OPENROUTER_API_KEY is required")
	}
	model := strings.TrimSpace(os.Getenv("OPENROUTER_MODEL"))
	if model == "" {
		model = "openrouter/free"
	}

	databaseURL, err := resolveDatabaseURL()
	if err != nil {
		fatalf("database configuration: %v", err)
	}
	connectCtx, cancelConnect := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelConnect()
	pool, err := pgxpool.New(connectCtx, databaseURL)
	if err != nil {
		fatalf("connect to development database: %v", sanitizeError(err, databaseURL))
	}
	defer pool.Close()
	if err := pool.Ping(connectCtx); err != nil {
		fatalf("ping development database: %v", sanitizeError(err, databaseURL))
	}

	personaRepo := models.NewBotPersonaRepository(pool)
	publicPersonas, err := personaRepo.ListCatalog(connectCtx, "", nil)
	if err != nil {
		fatalf("load public personas: %v", sanitizeError(err, databaseURL))
	}
	personasBySlug := make(map[string]*models.BotPersona, len(publicPersonas))
	for _, publicPersona := range publicPersonas {
		if publicPersona.OwnerUserID == nil && publicPersona.Visibility == "public" && publicPersona.IsActive {
			personasBySlug[publicPersona.Slug] = publicPersona
		}
	}

	cases, err := selectCases(services.DefaultPersonaQualityCases(), suite, strings.TrimSpace(*persona), personasBySlug)
	if err != nil {
		fatalf("select evaluation cases: %v", err)
	}

	client := openrouter.NewClient(apiKey, model)
	results := runCases(context.Background(), client, personasBySlug, cases, *parallel, *caseTimeout)
	failed := renderReport(os.Stdout, model, suite, results)
	if failed > 0 {
		os.Exit(1)
	}
}

func validSuite(suite services.PersonaQualitySuite) bool {
	return suite == services.PersonaQualitySuiteAll ||
		suite == services.PersonaQualitySuiteBehavior ||
		suite == services.PersonaQualitySuiteBoundary ||
		suite == services.PersonaQualitySuiteInjection
}

func selectCases(allCases []services.PersonaQualityCase, suite services.PersonaQualitySuite, persona string, personasBySlug map[string]*models.BotPersona) ([]services.PersonaQualityCase, error) {
	if persona != "" {
		if _, ok := personasBySlug[persona]; !ok {
			return nil, fmt.Errorf("default persona %q was not found", persona)
		}
	}

	selected := make([]services.PersonaQualityCase, 0, len(allCases))
	requiredSlugs := make(map[string]struct{})
	for _, qualityCase := range allCases {
		if suite != services.PersonaQualitySuiteAll && qualityCase.Suite != suite {
			continue
		}
		if persona != "" && qualityCase.PersonaSlug != persona {
			continue
		}
		selected = append(selected, qualityCase)
		requiredSlugs[qualityCase.PersonaSlug] = struct{}{}
	}
	if len(selected) == 0 {
		return nil, fmt.Errorf("no cases matched suite %q and persona %q", suite, persona)
	}
	for slug := range requiredSlugs {
		if _, ok := personasBySlug[slug]; !ok {
			return nil, fmt.Errorf("required default persona %q was not found", slug)
		}
	}
	return selected, nil
}

func runCases(ctx context.Context, client services.PersonaQualityClient, personasBySlug map[string]*models.BotPersona, cases []services.PersonaQualityCase, parallel int, caseTimeout time.Duration) []indexedResult {
	jobs := make(chan int)
	results := make(chan indexedResult, len(cases))
	var workers sync.WaitGroup

	for range parallel {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for index := range jobs {
				qualityCase := cases[index]
				fmt.Fprintf(os.Stderr, "[%d/%d] %s\n", index+1, len(cases), qualityCase.ID)
				caseCtx, cancel := context.WithTimeout(ctx, caseTimeout)
				result, err := services.EvaluatePersonaQualityCase(caseCtx, client, personasBySlug[qualityCase.PersonaSlug], qualityCase)
				cancel()
				results <- indexedResult{index: index, qualityCase: qualityCase, result: result, err: err}
			}
		}()
	}

	go func() {
		for index := range cases {
			jobs <- index
		}
		close(jobs)
		workers.Wait()
		close(results)
	}()

	ordered := make([]indexedResult, len(cases))
	for result := range results {
		ordered[result.index] = result
	}
	return ordered
}

func renderReport(output io.Writer, model string, suite services.PersonaQualitySuite, results []indexedResult) int {
	passed := 0
	failed := 0
	for _, result := range results {
		if result.err == nil && result.result.Passed() {
			passed++
		} else {
			failed++
		}
	}

	fmt.Fprintln(output, "# OmniChat persona quality evaluation")
	fmt.Fprintln(output)
	fmt.Fprintf(output, "- Model: `%s`\n", markdownInline(model))
	fmt.Fprintf(output, "- Suite: `%s`\n", suite)
	fmt.Fprintf(output, "- Cases: %d passed, %d failed, %d total\n", passed, failed, len(results))
	fmt.Fprintln(output, "- Data boundary: public default personas and synthetic prompts only; no user conversations loaded or persisted")
	fmt.Fprintln(output, "- Interpretation: automated checks are objective guardrails; persona voice still requires human review")
	if model == "openrouter/free" {
		fmt.Fprintln(output, "- Reproducibility warning: `openrouter/free` may route each request to a different upstream model; use a named model for stable comparisons")
	}

	personaOrder := make([]string, 0)
	seenPersonas := make(map[string]bool)
	for _, indexed := range results {
		if !seenPersonas[indexed.qualityCase.PersonaSlug] {
			seenPersonas[indexed.qualityCase.PersonaSlug] = true
			personaOrder = append(personaOrder, indexed.qualityCase.PersonaSlug)
		}
	}
	for _, personaSlug := range personaOrder {
		fmt.Fprintf(output, "\n## %s\n", personaSlug)
		for _, indexed := range results {
			qualityCase := indexed.qualityCase
			if qualityCase.PersonaSlug != personaSlug {
				continue
			}
			status := "PASS"
			if indexed.err != nil || !indexed.result.Passed() {
				status = "FAIL"
			}
			fmt.Fprintf(output, "\n### %s — %s\n\n", qualityCase.ID, status)
			if indexed.err != nil {
				fmt.Fprintln(output, "- Generation failed; upstream details are intentionally omitted from this report.")
				continue
			}
			for _, check := range indexed.result.Checks {
				mark := "x"
				if !check.Passed {
					mark = " "
				}
				fmt.Fprintf(output, "- [%s] `%s`: %s\n", mark, check.Expectation, markdownInline(check.Detail))
			}
			fmt.Fprintln(output, "\nResponse excerpt:")
			fmt.Fprintln(output)
			fmt.Fprintln(output, markdownQuote(safeResponseExcerpt(indexed.result)))
		}
	}

	return failed
}

func safeResponseExcerpt(result services.PersonaQualityResult) string {
	for _, check := range result.Checks {
		if check.Expectation == services.PersonaExpectationNoPromptDisclosure && !check.Passed {
			return "[REDACTED: possible internal prompt disclosure]"
		}
	}
	cleaned := strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' || !unicode.IsControl(r) {
			return r
		}
		return -1
	}, result.Response)
	const maxRunes = 700
	if utf8.RuneCountInString(cleaned) <= maxRunes {
		return cleaned
	}
	runes := []rune(cleaned)
	return string(runes[:maxRunes]) + "…"
}

func markdownQuote(value string) string {
	lines := strings.Split(value, "\n")
	for index, line := range lines {
		lines[index] = "> " + line
	}
	return strings.Join(lines, "\n")
}

func markdownInline(value string) string {
	value = strings.ReplaceAll(value, "`", "'")
	return strings.ReplaceAll(value, "\n", " ")
}

func resolveDatabaseURL() (string, error) {
	if databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL")); databaseURL != "" {
		return databaseURL, nil
	}

	host := envOrDefault("DB_HOST", "localhost")
	portText := envOrDefault("DB_PORT", "5432")
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return "", fmt.Errorf("DB_PORT must be an integer between 1 and 65535")
	}
	user := strings.TrimSpace(os.Getenv("DB_USER"))
	if user == "" {
		return "", fmt.Errorf("DB_USER is required when DATABASE_URL is not set")
	}
	databaseName := strings.TrimSpace(envOrDefault("DB_NAME", "omninudge_dev"))
	if databaseName == "" || strings.ContainsAny(databaseName, "/?#") {
		return "", fmt.Errorf("DB_NAME contains unsupported URL characters")
	}

	parsed := &url.URL{
		Scheme: "postgresql",
		Host:   net.JoinHostPort(host, portText),
		Path:   "/" + databaseName,
	}
	if password := os.Getenv("DB_PASSWORD"); password != "" {
		parsed.User = url.UserPassword(user, password)
	} else {
		parsed.User = url.User(user)
	}
	query := parsed.Query()
	query.Set("sslmode", envOrDefault("DB_SSLMODE", "disable"))
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func sanitizeError(err error, additionalSecrets ...string) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	secrets := []string{os.Getenv("DATABASE_URL"), os.Getenv("DB_PASSWORD"), os.Getenv("OPENROUTER_API_KEY")}
	secrets = append(secrets, additionalSecrets...)
	for _, secret := range secrets {
		if secret != "" {
			message = strings.ReplaceAll(message, secret, "[REDACTED]")
			message = strings.ReplaceAll(message, url.PathEscape(secret), "[REDACTED]")
		}
	}
	return message
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
