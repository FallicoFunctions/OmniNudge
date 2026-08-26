// Command bakeoff_omnichat_profiles compares the premium execution profiles
// against synthetic prompts and public default personas only. It never reads
// or persists user conversations, and its JSON report omits routes and text.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/openrouter"
)

type bakeOffOptions struct {
	timeout                   time.Duration
	repetitions               int
	profileKeys               []services.OmniChatModelProfileKey
	confirmPaid               bool
	providerCostStopTargetUSD float64
	allowProduction           bool
	outputPath                string
	overwriteOutput           bool
}

const (
	conservativeBakeOffCostPerRepetitionUSD = 1.00
	// A complete five-profile matrix can legitimately exceed thirty minutes
	// when strict contract recovery is exercised. Keep the default bounded for
	// accidental long-running jobs, but leave enough headroom for an authorized
	// paid qualification run to finish atomically.
	defaultBakeOffTimeout = 60 * time.Minute
	maxBakeOffTimeout     = 90 * time.Minute
)

type timedProfileGenerator interface {
	Generate(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error)
	GenerateWithOptions(context.Context, []openrouter.Message, openrouter.StreamCallback, openrouter.GenerationOptions) (string, error)
	TelemetrySnapshot() openrouter.GenerationTelemetry
}

type timedProfileClient struct {
	client  timedProfileGenerator
	options openrouter.GenerationOptions
	mu      sync.Mutex
	total   time.Duration
	count   int
}

func (c *timedProfileClient) Generate(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback) (string, error) {
	return c.generate(ctx, messages, onChunk, c.options)
}

func (c *timedProfileClient) GenerateWithOptions(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback, options openrouter.GenerationOptions) (string, error) {
	// Recovery requests add a server-owned response format and token budget;
	// preserve the candidate's immutable reasoning/speed controls while
	// applying those per-attempt overrides.
	if options.MaxTokens == 0 {
		options.MaxTokens = c.options.MaxTokens
	}
	if options.ReasoningEffort == "" {
		options.ReasoningEffort = c.options.ReasoningEffort
	}
	if options.Speed == "" {
		options.Speed = c.options.Speed
	}
	return c.generate(ctx, messages, onChunk, options)
}

func (c *timedProfileClient) generate(ctx context.Context, messages []openrouter.Message, onChunk openrouter.StreamCallback, options openrouter.GenerationOptions) (string, error) {
	started := time.Now()
	var once sync.Once
	wrapped := func(token string) {
		if token != "" {
			once.Do(func() {
				c.mu.Lock()
				c.total += time.Since(started)
				c.count++
				c.mu.Unlock()
			})
		}
		if onChunk != nil {
			onChunk(token)
		}
	}
	return c.client.GenerateWithOptions(ctx, messages, wrapped, options)
}

func (c *timedProfileClient) BakeOffTelemetry() openrouter.GenerationTelemetry {
	return c.client.TelemetrySnapshot()
}

func (c *timedProfileClient) BakeOffTimeToFirstText() time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.count == 0 {
		return 0
	}
	return c.total / time.Duration(c.count)
}

func main() {
	err := runValidatedBakeOffCommand(os.Args[1:], os.Stderr, func(options bakeOffOptions) error {
		executeBakeOff(options)
		return nil
	})
	if errors.Is(err, flag.ErrHelp) {
		return
	}
	if err != nil {
		fatalf("%v", err)
	}
}

func runValidatedBakeOffCommand(arguments []string, output io.Writer, execute func(bakeOffOptions) error) error {
	options, err := parseBakeOffOptions(arguments, output)
	if err != nil {
		return err
	}
	if execute == nil {
		return fmt.Errorf("bakeoff execution callback is required")
	}
	return execute(options)
}

func executeBakeOff(options bakeOffOptions) {
	_ = godotenv.Load(".env", "backend/.env")
	cfg, err := config.Load()
	if err != nil {
		fatalf("load configuration: %v", err)
	}
	if cfg.OpenRouter.APIKey == "" {
		fatalf("OPENROUTER_API_KEY is required")
	}
	if strings.EqualFold(strings.TrimSpace(cfg.AppEnv), "production") && !options.allowProduction {
		fatalf("production bakeoffs are disabled; pass -allow-production only after confirming the isolated synthetic/public dataset")
	}
	if err := services.ValidateConfiguredOmniChatModelRoutes(configuredOmniChatModelRoutes(cfg), cfg.OpenRouter.StandardFallback); err != nil {
		fatalf("invalid configured model routes: %v", err)
	}
	candidates := configuredCandidates(cfg, options.profileKeys)
	if err := validateBakeOffRepetitions(options.repetitions, len(candidates)); err != nil {
		fatalf("invalid configured candidate set: %v", err)
	}
	db, err := database.New(cfg.Database.DatabaseURL())
	if err != nil {
		fatalf("connect to database: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), options.timeout)
	defer cancel()
	personas, cases, err := loadSyntheticMatrix(ctx, models.NewBotPersonaRepository(db.Pool))
	if err != nil {
		fatalf("load synthetic matrix: %v", err)
	}

	report, err := services.RunRepeatedBlindOmniChatModelBakeOffWithBudget(ctx, options.repetitions, options.providerCostStopTargetUSD, candidates, personas, cases, func(candidate services.OmniChatBakeOffCandidate) services.PersonaQualityClient {
		return &timedProfileClient{
			client:  openrouter.NewClient(cfg.OpenRouter.APIKey, candidate.Route),
			options: generationOptionsForCandidate(candidate),
		}
	})
	if err != nil {
		if report.CompletedRepetitions > 0 {
			gate, gateErr := services.EvaluateOmniChatBakeOffQualityGate(report, services.DefaultOmniChatBakeOffQualityGate())
			if gateErr == nil {
				gate = disqualifyDiagnosticProfileSubset(gate, len(options.profileKeys) > 0)
				if writeErr := writeBlindReportOutputs(os.Stdout, options.outputPath, options.overwriteOutput, report, gate); writeErr != nil {
					fatalf("write partial report: %v", writeErr)
				}
			}
		}
		fatalf("run bakeoff: %v", err)
	}
	gate, err := services.EvaluateOmniChatBakeOffQualityGate(report, services.DefaultOmniChatBakeOffQualityGate())
	if err != nil {
		fatalf("evaluate quality gate: %v", err)
	}
	gate = disqualifyDiagnosticProfileSubset(gate, len(options.profileKeys) > 0)
	if err := writeBlindReportOutputs(os.Stdout, options.outputPath, options.overwriteOutput, report, gate); err != nil {
		fatalf("write report: %v", err)
	}
	if code := exitCodeForGate(gate); code != 0 {
		os.Exit(code)
	}
}

func parseBakeOffOptions(arguments []string, output io.Writer) (bakeOffOptions, error) {
	flags := flag.NewFlagSet("bakeoff_omnichat_profiles", flag.ContinueOnError)
	flags.SetOutput(output)
	timeout := flags.Duration("timeout", defaultBakeOffTimeout, "maximum duration for the complete synthetic bakeoff")
	repetitions := flags.Int("repetitions", 5, "number of deterministic, order-rotated repetitions (1 or a multiple of the active candidate count)")
	profiles := flags.String("profiles", "all", "diagnostic-only comma-separated profile keys; repeated subsets must be position-balanced (default: all)")
	confirmPaid := flags.Bool("confirm-paid", false, "confirm that this command makes paid provider requests")
	providerCostStopTargetUSD := flags.Float64("provider-cost-stop-target-usd", 5, "provider cost stop target in USD; checked between repetitions after a conservative $1.00-per-repetition preflight")
	allowProduction := flags.Bool("allow-production", false, "allow an explicitly confirmed synthetic/public bakeoff in production")
	outputPath := flags.String("output", "", "optional .json path for an atomic, private copy of the exact stdout report (parent directory must exist)")
	overwriteOutput := flags.Bool("overwrite-output", false, "explicitly replace an existing regular -output file")
	if err := flags.Parse(arguments); err != nil {
		return bakeOffOptions{}, err
	}
	profileKeys, err := parseDiagnosticProfileKeys(*profiles)
	if err != nil {
		return bakeOffOptions{}, err
	}
	options := bakeOffOptions{
		timeout: *timeout, repetitions: *repetitions, confirmPaid: *confirmPaid,
		profileKeys:               profileKeys,
		providerCostStopTargetUSD: *providerCostStopTargetUSD, allowProduction: *allowProduction,
		outputPath: filepath.Clean(*outputPath), overwriteOutput: *overwriteOutput,
	}
	if *outputPath == "" {
		options.outputPath = ""
	}
	if err := validateBakeOffTimeout(options.timeout); err != nil {
		return bakeOffOptions{}, err
	}
	activeCandidateCount := len(services.DefaultOmniChatModelProfiles())
	if len(options.profileKeys) > 0 {
		activeCandidateCount = len(options.profileKeys)
	}
	if err := validateBakeOffRepetitions(options.repetitions, activeCandidateCount); err != nil {
		return bakeOffOptions{}, err
	}
	if !options.confirmPaid {
		return bakeOffOptions{}, fmt.Errorf("-confirm-paid is required before configuration, database, or provider access")
	}
	if options.providerCostStopTargetUSD <= 0 || options.providerCostStopTargetUSD > 100 {
		return bakeOffOptions{}, fmt.Errorf("-provider-cost-stop-target-usd must be greater than zero and no more than 100")
	}
	conservativeEstimate := float64(options.repetitions) * conservativeBakeOffCostPerRepetitionUSD
	if options.providerCostStopTargetUSD < conservativeEstimate {
		return bakeOffOptions{}, fmt.Errorf(
			"-provider-cost-stop-target-usd must be at least %.2f for %d repetitions using the conservative preflight estimate",
			conservativeEstimate, options.repetitions,
		)
	}
	if flags.NArg() != 0 {
		return bakeOffOptions{}, fmt.Errorf("unexpected positional arguments")
	}
	if err := validateBakeOffOutputPath(options.outputPath, options.overwriteOutput); err != nil {
		return bakeOffOptions{}, err
	}
	return options, nil
}

func parseDiagnosticProfileKeys(value string) ([]services.OmniChatModelProfileKey, error) {
	value = strings.TrimSpace(value)
	if value == "all" {
		return nil, nil
	}
	if value == "" {
		return nil, fmt.Errorf("-profiles must be 'all' or a comma-separated list of profile keys")
	}

	known := map[services.OmniChatModelProfileKey]struct{}{
		services.OmniChatModelProfileStandard: {}, services.OmniChatModelProfilePlus: {},
		services.OmniChatModelProfilePremiumQuick: {}, services.OmniChatModelProfilePremiumDeep: {},
	}
	parts := strings.Split(value, ",")
	keys := make([]services.OmniChatModelProfileKey, 0, len(parts))
	seen := make(map[services.OmniChatModelProfileKey]struct{}, len(parts))
	for _, part := range parts {
		key := services.OmniChatModelProfileKey(strings.TrimSpace(part))
		if _, exists := known[key]; !exists {
			return nil, fmt.Errorf("-profiles contains unknown profile key %q", key)
		}
		if _, duplicate := seen[key]; duplicate {
			return nil, fmt.Errorf("-profiles contains duplicate profile key %q", key)
		}
		seen[key] = struct{}{}
		keys = append(keys, key)
	}
	if len(keys) == len(known) {
		return nil, fmt.Errorf("-profiles must be a true subset; use 'all' for the complete matrix")
	}
	return keys, nil
}

func disqualifyDiagnosticProfileSubset(gate services.OmniChatBakeOffQualityGateResult, subset bool) services.OmniChatBakeOffQualityGateResult {
	if !subset {
		return gate
	}
	gate.Passed = false
	for _, failure := range gate.RunFailures {
		if failure == "diagnostic_profile_subset" {
			return gate
		}
	}
	gate.RunFailures = append(gate.RunFailures, "diagnostic_profile_subset")
	return gate
}

func generationOptionsForCandidate(candidate services.OmniChatBakeOffCandidate) openrouter.GenerationOptions {
	options := openrouter.GenerationOptions{MaxTokens: 256}
	if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(candidate.Route)), "anthropic/") {
		return options
	}
	options.ReasoningEffort = string(candidate.Profile.ReasoningEffort)
	if candidate.Profile.FastMode {
		options.Speed = "fast"
	}
	return options
}

func validateBakeOffTimeout(timeout time.Duration) error {
	if timeout <= 0 || timeout > maxBakeOffTimeout {
		return fmt.Errorf("timeout must be greater than zero and no more than %s", maxBakeOffTimeout)
	}
	return nil
}

func validateBakeOffRepetitions(repetitions, candidateCount int) error {
	if repetitions < 1 || repetitions > services.MaxOmniChatBakeOffRepetitions {
		return fmt.Errorf("repetitions must be between 1 and %d", services.MaxOmniChatBakeOffRepetitions)
	}
	profileCount := len(services.DefaultOmniChatModelProfiles())
	if candidateCount < 1 || candidateCount > profileCount {
		return fmt.Errorf("active candidate count must be between 1 and %d", profileCount)
	}
	if repetitions != 1 && repetitions%candidateCount != 0 {
		return fmt.Errorf("repetitions must be 1 or a multiple of the %d active candidates so every candidate occupies each execution position equally", candidateCount)
	}
	return nil
}

func validateBakeOffOutputPath(outputPath string, overwrite bool) error {
	if outputPath == "" {
		if overwrite {
			return fmt.Errorf("-overwrite-output requires -output")
		}
		return nil
	}
	if strings.ContainsRune(outputPath, '\x00') {
		return fmt.Errorf("-output contains an invalid null byte")
	}
	if outputPath == "." || outputPath == string(filepath.Separator) {
		return fmt.Errorf("-output must name a JSON file")
	}
	if !strings.EqualFold(filepath.Ext(outputPath), ".json") {
		return fmt.Errorf("-output must use a .json extension")
	}

	parent := filepath.Dir(outputPath)
	parentInfo, err := os.Lstat(parent)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("-output parent directory does not exist: %s", parent)
		}
		return fmt.Errorf("inspect -output parent directory: %w", err)
	}
	if parentInfo.Mode()&os.ModeSymlink != 0 || !parentInfo.IsDir() {
		return fmt.Errorf("-output parent must be an existing directory, not a symlink or file")
	}

	info, err := os.Lstat(outputPath)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return nil
	case err != nil:
		return fmt.Errorf("inspect -output: %w", err)
	case !info.Mode().IsRegular():
		return fmt.Errorf("-output may only replace an existing regular file")
	case !overwrite:
		return fmt.Errorf("-output already exists; pass -overwrite-output to replace it")
	default:
		return nil
	}
}

func configuredCandidates(cfg *config.Config, selected []services.OmniChatModelProfileKey) []services.OmniChatBakeOffCandidate {
	if cfg == nil {
		return nil
	}
	routes, err := services.ResolveConfiguredOmniChatModelRoutes(configuredOmniChatModelRoutes(cfg), cfg.OpenRouter.StandardFallback)
	if err != nil {
		return nil
	}
	profiles := services.ConfiguredOmniChatModelProfiles(routes)
	candidates := services.OmniChatBakeOffCandidatesFromProfiles(profiles)
	configured := candidates[:0]
	for _, candidate := range candidates {
		if strings.TrimSpace(candidate.Route) != "" {
			configured = append(configured, candidate)
		}
	}
	candidates = configured
	if len(selected) == 0 {
		return reindexConfiguredCandidates(candidates)
	}
	selectedSet := make(map[services.OmniChatModelProfileKey]struct{}, len(selected))
	for _, key := range selected {
		selectedSet[key] = struct{}{}
	}
	filtered := make([]services.OmniChatBakeOffCandidate, 0, len(selected))
	for _, candidate := range candidates {
		if _, included := selectedSet[services.OmniChatModelProfileKey(candidate.Profile.Name)]; included {
			filtered = append(filtered, candidate)
		}
	}
	return reindexConfiguredCandidates(filtered)
}

func configuredOmniChatModelRoutes(cfg *config.Config) map[services.OmniChatModelProfileKey]string {
	if cfg == nil {
		return nil
	}
	return map[services.OmniChatModelProfileKey]string{
		services.OmniChatModelProfileStandard:     cfg.OpenRouter.StandardModel,
		services.OmniChatModelProfilePlus:         cfg.OpenRouter.PlusModel,
		services.OmniChatModelProfilePremiumQuick: cfg.OpenRouter.PremiumQuickModel,
		services.OmniChatModelProfilePremiumDeep:  cfg.OpenRouter.PremiumDeepModel,
	}
}

func reindexConfiguredCandidates(candidates []services.OmniChatBakeOffCandidate) []services.OmniChatBakeOffCandidate {
	for index := range candidates {
		candidates[index].BlindID = fmt.Sprintf("candidate-%c", 'a'+index)
	}
	return candidates
}

func writeBlindReport(output io.Writer, report services.OmniChatBakeOffReport, gate services.OmniChatBakeOffQualityGateResult) error {
	type compactCandidate struct {
		BlindID            string                                    `json:"blind_id"`
		PassedCases        int                                       `json:"passed_cases"`
		TotalCases         int                                       `json:"total_cases"`
		LatencyMS          int64                                     `json:"latency_ms"`
		ProviderTTFTMeanMS *int64                                    `json:"provider_ttft_mean_ms,omitempty"`
		Score              services.OmniChatBakeOffScore             `json:"score"`
		Metrics            services.OmniChatBakeOffMetrics           `json:"metrics"`
		CasePassRate       float64                                   `json:"case_pass_rate"`
		EndToEndLatency    services.OmniChatBakeOffDurationSummary   `json:"end_to_end_latency"`
		ProviderTTFT       *services.OmniChatBakeOffDurationSummary  `json:"provider_ttft,omitempty"`
		Suites             []services.OmniChatBakeOffSuiteReport     `json:"suites"`
		Invariants         []services.OmniChatBakeOffInvariantReport `json:"invariants"`
		Cases              []services.OmniChatBakeOffCaseReport      `json:"cases"`
	}
	compact := make([]compactCandidate, 0, len(report.Candidates))
	for _, candidate := range report.Candidates {
		compact = append(compact, compactCandidate{
			BlindID: candidate.BlindID, PassedCases: candidate.PassedCases, TotalCases: candidate.TotalCases,
			LatencyMS: candidate.LatencyMS, ProviderTTFTMeanMS: candidate.ProviderTTFTMeanMS,
			Score: candidate.Score, Metrics: candidate.Metrics,
			CasePassRate: candidate.CasePassRate, EndToEndLatency: candidate.EndToEndLatency,
			ProviderTTFT: candidate.ProviderTTFT, Suites: candidate.Suites,
			Invariants: candidate.Invariants, Cases: candidate.Cases,
		})
	}
	encoder := json.NewEncoder(output)
	encoder.SetIndent("", "  ")
	return encoder.Encode(map[string]any{
		"data_boundary":         "public companion personas and synthetic prompts only",
		"corpus_version":        report.CorpusVersion,
		"corpus_fingerprint":    report.CorpusFingerprint,
		"persona_fingerprint":   report.PersonaFingerprint,
		"repetitions":           report.Repetitions,
		"completed_repetitions": report.CompletedRepetitions,
		"stop_reason":           report.StopReason,
		"quality_gate":          gate,
		"candidates":            compact,
	})
}

func writeBlindReportOutputs(
	stdout io.Writer,
	outputPath string,
	overwrite bool,
	report services.OmniChatBakeOffReport,
	gate services.OmniChatBakeOffQualityGateResult,
) error {
	var encoded bytes.Buffer
	if err := writeBlindReport(&encoded, report, gate); err != nil {
		return fmt.Errorf("encode privacy-safe report: %w", err)
	}
	reportBytes := encoded.Bytes()
	if outputPath != "" {
		if err := writePrivateAtomicFile(outputPath, reportBytes, overwrite); err != nil {
			return fmt.Errorf("persist privacy-safe report: %w", err)
		}
	}
	if _, err := io.Copy(stdout, bytes.NewReader(reportBytes)); err != nil {
		return fmt.Errorf("write privacy-safe report to stdout: %w", err)
	}
	return nil
}

func writePrivateAtomicFile(outputPath string, contents []byte, overwrite bool) error {
	if outputPath == "" {
		return fmt.Errorf("output path is required")
	}
	if err := validateBakeOffOutputPath(outputPath, overwrite); err != nil {
		return err
	}

	parent := filepath.Dir(outputPath)
	temporary, err := os.CreateTemp(parent, "."+filepath.Base(outputPath)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temporary report: %w", err)
	}
	temporaryPath := temporary.Name()
	temporaryClosed := false
	defer func() {
		if !temporaryClosed {
			_ = temporary.Close()
		}
		_ = os.Remove(temporaryPath)
	}()

	if err := temporary.Chmod(0o600); err != nil {
		return fmt.Errorf("restrict temporary report permissions: %w", err)
	}
	if _, err := temporary.Write(contents); err != nil {
		return fmt.Errorf("write temporary report: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync temporary report: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary report: %w", err)
	}
	temporaryClosed = true

	if overwrite {
		// Revalidate immediately before replacement so directories, devices, and
		// symlinks are never accepted as overwrite targets.
		if err := validateBakeOffOutputPath(outputPath, true); err != nil {
			return err
		}
		if err := os.Rename(temporaryPath, outputPath); err != nil {
			return fmt.Errorf("atomically replace report: %w", err)
		}
	} else {
		// A hard link publishes the fully synced temporary file without the
		// overwrite race inherent in checking for existence before os.Rename.
		if err := os.Link(temporaryPath, outputPath); err != nil {
			if errors.Is(err, os.ErrExist) {
				return fmt.Errorf("-output already exists; pass -overwrite-output to replace it")
			}
			return fmt.Errorf("atomically publish report: %w", err)
		}
		if err := os.Remove(temporaryPath); err != nil {
			return fmt.Errorf("remove temporary report link: %w", err)
		}
	}

	directory, err := os.Open(parent)
	if err != nil {
		return fmt.Errorf("open report directory for sync: %w", err)
	}
	defer func() { _ = directory.Close() }()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("sync report directory: %w", err)
	}
	return nil
}

func exitCodeForGate(gate services.OmniChatBakeOffQualityGateResult) int {
	if gate.Passed {
		return 0
	}
	return 1
}

func loadSyntheticMatrix(ctx context.Context, repo *models.BotPersonaRepository) (map[string]*models.BotPersona, []services.PersonaQualityCase, error) {
	catalog, err := repo.ListCatalog(ctx, "", nil)
	if err != nil {
		return nil, nil, err
	}
	return selectSyntheticMatrix(catalog)
}

func selectSyntheticMatrix(catalog []*models.BotPersona) (map[string]*models.BotPersona, []services.PersonaQualityCase, error) {
	personas := make(map[string]*models.BotPersona)
	for _, persona := range catalog {
		style := strings.TrimSpace(persona.ResponseStyleProfile)
		isCompanion := style == "" || style == models.ResponseStyleProfileInherit || style == models.ResponseStyleProfileNaturalDialogue || style == models.ResponseStyleProfileProfessional
		if persona.OwnerUserID == nil && persona.Visibility == "public" && persona.IsActive && isCompanion {
			personas[persona.Slug] = persona
		}
	}
	selected := make([]services.PersonaQualityCase, 0, len(personas)*3)
	for _, qualityCase := range services.DefaultOmniChatCompanionBakeOffCases() {
		if personas[qualityCase.PersonaSlug] == nil {
			continue
		}
		selected = append(selected, qualityCase)
	}
	if len(selected) == 0 {
		return nil, nil, fmt.Errorf("no synthetic quality cases matched public companion personas")
	}
	return personas, selected, nil
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
