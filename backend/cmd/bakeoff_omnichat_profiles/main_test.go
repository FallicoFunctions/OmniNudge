package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

type timedProfileGeneratorFake struct {
	options openrouter.GenerationOptions
}

func (f *timedProfileGeneratorFake) Generate(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
	return "ok", nil
}

func (f *timedProfileGeneratorFake) GenerateWithOptions(_ context.Context, _ []openrouter.Message, onChunk openrouter.StreamCallback, options openrouter.GenerationOptions) (string, error) {
	f.options = options
	if onChunk != nil {
		onChunk("ok")
	}
	return "ok", nil
}

func (f *timedProfileGeneratorFake) TelemetrySnapshot() openrouter.GenerationTelemetry {
	return openrouter.GenerationTelemetry{}
}

func TestConfiguredCandidatesUseDeploymentRoutesWithoutExposingCredentials(t *testing.T) {
	cfg := &config.Config{}
	cfg.OpenRouter.StandardModel = "configured/standard"
	cfg.OpenRouter.PlusModel = "configured/plus"
	cfg.OpenRouter.PremiumQuickModel = "configured/quick"
	cfg.OpenRouter.PremiumDeepModel = "configured/deep"
	cfg.OpenRouter.UltraFastModel = "configured/fast"

	candidates := configuredCandidates(cfg, nil)

	require.Len(t, candidates, 5)
	require.Equal(t, []string{
		"configured/standard", "configured/plus", "configured/quick",
		"configured/deep", "configured/fast",
	}, []string{
		candidates[0].Route, candidates[1].Route, candidates[2].Route,
		candidates[3].Route, candidates[4].Route,
	})
	require.Equal(t, services.OmniChatBakeOffReasoningLow, candidates[2].Profile.ReasoningEffort)
	require.Equal(t, services.OmniChatBakeOffReasoningHigh, candidates[3].Profile.ReasoningEffort)
	require.True(t, candidates[4].Profile.FastMode)
}

func TestConfiguredCandidatesSelectDiagnosticProfilesInCanonicalBlindOrder(t *testing.T) {
	cfg := &config.Config{}
	cfg.OpenRouter.StandardModel = "configured/standard"
	cfg.OpenRouter.PlusModel = "configured/plus"
	cfg.OpenRouter.PremiumQuickModel = "configured/quick"
	cfg.OpenRouter.PremiumDeepModel = "configured/deep"
	cfg.OpenRouter.UltraFastModel = "configured/fast"

	candidates := configuredCandidates(cfg, []services.OmniChatModelProfileKey{
		services.OmniChatModelProfilePlus,
		services.OmniChatModelProfileStandard,
	})

	require.Len(t, candidates, 2)
	require.Equal(t, []string{"candidate-a", "candidate-b"}, []string{candidates[0].BlindID, candidates[1].BlindID})
	require.Equal(t, []string{"configured/standard", "configured/plus"}, []string{candidates[0].Route, candidates[1].Route})
}

func TestConfiguredCandidatesResolveFallbackRoutesAndOmitUnconfiguredProfiles(t *testing.T) {
	cfg := &config.Config{}
	cfg.OpenRouter.StandardFallback = "configured/fallback"
	cfg.OpenRouter.PlusModel = "configured/plus"

	candidates := configuredCandidates(cfg, nil)

	require.Len(t, candidates, 5)
	require.Equal(t, []string{"candidate-a", "candidate-b", "candidate-c", "candidate-d", "candidate-e"}, []string{
		candidates[0].BlindID, candidates[1].BlindID, candidates[2].BlindID, candidates[3].BlindID, candidates[4].BlindID,
	})
	require.Equal(t, services.OmniChatModelProfileStandard, services.OmniChatModelProfileKey(candidates[0].Profile.Name))
	require.Equal(t, "configured/fallback", candidates[0].Route)
	require.Equal(t, "configured/plus", candidates[1].Route)
	require.Equal(t, "configured/plus", candidates[2].Route)
	require.Equal(t, "configured/plus", candidates[3].Route)
	require.Equal(t, "configured/plus", candidates[4].Route)

	selected := configuredCandidates(cfg, []services.OmniChatModelProfileKey{services.OmniChatModelProfileStandard})
	require.Len(t, selected, 1)
	require.Equal(t, "configured/fallback", selected[0].Route)
	selected = configuredCandidates(cfg, []services.OmniChatModelProfileKey{services.OmniChatModelProfilePlus})
	require.Len(t, selected, 1)
	require.Equal(t, "candidate-a", selected[0].BlindID)
}

func TestTimedProfileClientPreservesProfileControlsDuringStructuredRecovery(t *testing.T) {
	fake := &timedProfileGeneratorFake{}
	client := &timedProfileClient{
		client:  fake,
		options: openrouter.GenerationOptions{MaxTokens: 256, ReasoningEffort: "high", Speed: "fast"},
	}

	_, err := client.GenerateWithOptions(context.Background(), nil, nil, openrouter.GenerationOptions{MaxTokens: 128, ResponseFormat: "json_object"})
	require.NoError(t, err)
	require.Equal(t, openrouter.GenerationOptions{MaxTokens: 128, ReasoningEffort: "high", Speed: "fast", ResponseFormat: "json_object"}, fake.options)
}

func TestGenerationOptionsOnlySendAnthropicSpecificControlsToAnthropicRoutes(t *testing.T) {
	profile := services.OmniChatBakeOffProfile{
		ReasoningEffort: services.OmniChatBakeOffReasoningHigh,
		FastMode:        true,
	}
	anthropic := generationOptionsForCandidate(services.OmniChatBakeOffCandidate{
		Route: "anthropic/claude-sonnet", Profile: profile,
	})
	require.Equal(t, 256, anthropic.MaxTokens)
	require.Equal(t, "high", anthropic.ReasoningEffort)
	require.Equal(t, "fast", anthropic.Speed)

	nonAnthropic := generationOptionsForCandidate(services.OmniChatBakeOffCandidate{
		Route: "google/gemini-flash", Profile: profile,
	})
	require.Equal(t, 256, nonAnthropic.MaxTokens)
	require.Empty(t, nonAnthropic.ReasoningEffort)
	require.Empty(t, nonAnthropic.Speed)
}

func TestBlindReportProjectionDoesNotSerializeProfileOrRouteMapping(t *testing.T) {
	report := services.OmniChatBakeOffReport{
		CorpusVersion: "test-corpus-v1", CorpusFingerprint: "corpus-digest", PersonaFingerprint: "persona-digest",
		Repetitions: 3,
		Candidates: []services.OmniChatBakeOffCandidateReport{{
			BlindID:         "candidate-a",
			Profile:         services.OmniChatBakeOffProfile{Name: "secret-profile"},
			EndToEndLatency: services.OmniChatBakeOffDurationSummary{Samples: 3, P50MS: 10, P95MS: 20},
			Invariants: []services.OmniChatBakeOffInvariantReport{{
				Expectation:  services.PersonaExpectationNoPromptDisclosure,
				PassedChecks: 3, TotalChecks: 3, PassRate: 1,
			}},
		}},
		CandidateMapping: map[string]services.OmniChatBakeOffCandidate{
			"candidate-a": {BlindID: "candidate-a", Route: "secret/provider-route"},
		},
	}
	gate := services.OmniChatBakeOffQualityGateResult{Passed: true}
	var output strings.Builder

	require.NoError(t, writeBlindReport(&output, report, gate))
	var decoded map[string]any
	require.NoError(t, json.Unmarshal([]byte(output.String()), &decoded))
	require.Contains(t, output.String(), "candidate-a")
	require.NotContains(t, output.String(), "secret-profile")
	require.NotContains(t, output.String(), "secret/provider-route")
	require.Contains(t, output.String(), `"repetitions": 3`)
	require.Contains(t, output.String(), `"corpus_version": "test-corpus-v1"`)
	require.Contains(t, output.String(), `"corpus_fingerprint": "corpus-digest"`)
	require.Contains(t, output.String(), `"persona_fingerprint": "persona-digest"`)
	require.Contains(t, output.String(), `"p50_ms": 10`)
	require.Contains(t, output.String(), `"p95_ms": 20`)
	require.Contains(t, output.String(), `"invariants"`)
	require.Contains(t, output.String(), `"no_prompt_disclosure"`)
}

func TestSelectSyntheticMatrixUsesExactAuthoritativeCompanionCorpus(t *testing.T) {
	catalog := make([]*models.BotPersona, 0, 6)
	for _, slug := range []string{"ella-morgan", "scarlett-voss", "pink-sadie", "rhett-callahan", "max-rosen", "dr-harold-whitcomb"} {
		catalog = append(catalog, &models.BotPersona{
			Slug: slug, Name: slug, Visibility: "public", IsActive: true,
			ResponseStyleProfile: models.ResponseStyleProfileNaturalDialogue,
		})
	}

	personas, cases, err := selectSyntheticMatrix(catalog)
	require.NoError(t, err)
	require.Len(t, personas, 6)
	require.Len(t, cases, 18)
	require.Equal(t, services.OmniChatCompanionBakeOffCorpusFingerprint, services.PersonaQualityCorpusFingerprint(cases))
}

func TestExitCodeForQualityGate(t *testing.T) {
	require.Equal(t, 0, exitCodeForGate(services.OmniChatBakeOffQualityGateResult{Passed: true}))
	require.Equal(t, 1, exitCodeForGate(services.OmniChatBakeOffQualityGateResult{Passed: false}))
}

func TestValidateBakeOffTimeout(t *testing.T) {
	require.NoError(t, validateBakeOffTimeout(10*time.Minute))
	require.NoError(t, validateBakeOffTimeout(30*time.Minute))
	require.NoError(t, validateBakeOffTimeout(defaultBakeOffTimeout))
	require.NoError(t, validateBakeOffTimeout(maxBakeOffTimeout))
	require.Error(t, validateBakeOffTimeout(0))
	require.Error(t, validateBakeOffTimeout(maxBakeOffTimeout+time.Minute))
}

func TestValidateBakeOffRepetitions(t *testing.T) {
	for _, testCase := range []struct {
		name           string
		repetitions    int
		candidateCount int
		valid          bool
	}{
		{name: "single screening", repetitions: 1, candidateCount: 5, valid: true},
		{name: "one candidate", repetitions: 3, candidateCount: 1, valid: true},
		{name: "two candidates balanced", repetitions: 6, candidateCount: 2, valid: true},
		{name: "three candidates balanced", repetitions: 3, candidateCount: 3, valid: true},
		{name: "four candidates balanced", repetitions: 8, candidateCount: 4, valid: true},
		{name: "full matrix balanced", repetitions: 5, candidateCount: 5, valid: true},
		{name: "maximum balanced", repetitions: services.MaxOmniChatBakeOffRepetitions, candidateCount: 5, valid: true},
		{name: "zero repetitions", repetitions: 0, candidateCount: 5},
		{name: "negative repetitions", repetitions: -1, candidateCount: 5},
		{name: "above maximum", repetitions: services.MaxOmniChatBakeOffRepetitions + 1, candidateCount: 5},
		{name: "zero candidates", repetitions: 1, candidateCount: 0},
		{name: "too many candidates", repetitions: 1, candidateCount: 6},
		{name: "two candidates unbalanced", repetitions: 3, candidateCount: 2},
		{name: "three candidates unbalanced", repetitions: 4, candidateCount: 3},
		{name: "four candidates unbalanced", repetitions: 5, candidateCount: 4},
		{name: "full matrix unbalanced", repetitions: 6, candidateCount: 5},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateBakeOffRepetitions(testCase.repetitions, testCase.candidateCount)
			if testCase.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}

func TestParseBakeOffOptionsRequiresPaidConfirmationBeforeWorkCanStart(t *testing.T) {
	_, err := parseBakeOffOptions([]string{"-repetitions=5"}, &strings.Builder{})
	require.ErrorContains(t, err, "-confirm-paid is required")
}

func TestParseBakeOffOptionsHelpReturnsBeforePaidConfirmation(t *testing.T) {
	var output strings.Builder
	_, err := parseBakeOffOptions([]string{"-h"}, &output)
	require.True(t, errors.Is(err, flag.ErrHelp))
	require.Contains(t, output.String(), "-confirm-paid")
	require.Contains(t, output.String(), "-repetitions")
	require.Contains(t, output.String(), "-output")
	require.Contains(t, output.String(), "-overwrite-output")
	require.Contains(t, output.String(), "-profiles")
}

func TestParseBakeOffOptionsAcceptsPositionBalancedRepeatedDiagnosticSubsets(t *testing.T) {
	options, err := parseBakeOffOptions([]string{
		"-confirm-paid", "-repetitions=6", "-provider-cost-stop-target-usd=6",
		"-profiles=plus,standard",
	}, &strings.Builder{})
	require.NoError(t, err)
	require.Equal(t, []services.OmniChatModelProfileKey{
		services.OmniChatModelProfilePlus,
		services.OmniChatModelProfileStandard,
	}, options.profileKeys)
	require.Equal(t, 6, options.repetitions)

	for _, arguments := range [][]string{
		{"-confirm-paid", "-repetitions=3", "-provider-cost-stop-target-usd=3", "-profiles=standard"},
		{"-confirm-paid", "-repetitions=3", "-provider-cost-stop-target-usd=3", "-profiles=standard,plus,premium_quick"},
		{"-confirm-paid", "-repetitions=4", "-provider-cost-stop-target-usd=4", "-profiles=standard,plus,premium_quick,premium_deep"},
	} {
		_, parseErr := parseBakeOffOptions(arguments, &strings.Builder{})
		require.NoError(t, parseErr, arguments)
	}

	for _, arguments := range [][]string{
		{"-confirm-paid", "-repetitions=3", "-provider-cost-stop-target-usd=3", "-profiles=standard,plus"},
		{"-confirm-paid", "-repetitions=4", "-provider-cost-stop-target-usd=4", "-profiles=standard,plus,premium_quick"},
		{"-confirm-paid", "-repetitions=5", "-provider-cost-stop-target-usd=5", "-profiles=standard,plus,premium_quick,premium_deep"},
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-profiles="},
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-profiles=standard,"},
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-profiles=standard,standard"},
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-profiles=standard,,plus"},
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-profiles=all,standard"},
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-profiles=standard,plus,premium_quick,premium_deep,ultra_fast"},
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-profiles=unknown"},
	} {
		_, parseErr := parseBakeOffOptions(arguments, &strings.Builder{})
		require.Error(t, parseErr, arguments)
	}
}

func TestDiagnosticProfileSubsetIsAlwaysNonqualifying(t *testing.T) {
	passing := services.OmniChatBakeOffQualityGateResult{Passed: true}

	unchanged := disqualifyDiagnosticProfileSubset(passing, false)
	require.True(t, unchanged.Passed)
	require.Empty(t, unchanged.RunFailures)

	diagnostic := disqualifyDiagnosticProfileSubset(passing, true)
	require.False(t, diagnostic.Passed)
	require.Equal(t, []string{"diagnostic_profile_subset"}, diagnostic.RunFailures)

	diagnostic = disqualifyDiagnosticProfileSubset(diagnostic, true)
	require.Equal(t, []string{"diagnostic_profile_subset"}, diagnostic.RunFailures)
}

func TestParseBakeOffOptionsValidatesRunAndBudgetBounds(t *testing.T) {
	for _, arguments := range [][]string{
		{"-confirm-paid", "-repetitions=0"},
		{"-confirm-paid", "-repetitions=21"},
		{"-confirm-paid", "-provider-cost-stop-target-usd=0"},
		{"-confirm-paid", "-provider-cost-stop-target-usd=101"},
		{"-confirm-paid", "-repetitions=5", "-provider-cost-stop-target-usd=4.99"},
		{"-confirm-paid", "unexpected"},
	} {
		_, err := parseBakeOffOptions(arguments, &strings.Builder{})
		require.Error(t, err, arguments)
	}
	options, err := parseBakeOffOptions([]string{
		"-confirm-paid", "-repetitions=5", "-provider-cost-stop-target-usd=5", "-timeout=12m",
	}, &strings.Builder{})
	require.NoError(t, err)
	require.Equal(t, 5, options.repetitions)
	require.Equal(t, 5.0, options.providerCostStopTargetUSD)
	require.Equal(t, 12*time.Minute, options.timeout)
}

func TestRunValidatedBakeOffCommandDoesNotReachSideEffectsForHelpOrUnsafeArguments(t *testing.T) {
	for _, arguments := range [][]string{
		{"-h"},
		{"-repetitions=5"},
		{"-confirm-paid", "-repetitions=0"},
		{"-confirm-paid", "-repetitions=5", "-provider-cost-stop-target-usd=4.99"},
		{
			"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1",
			"-output", filepath.Join(t.TempDir(), "missing", "report.json"),
		},
	} {
		executed := false
		err := runValidatedBakeOffCommand(arguments, &strings.Builder{}, func(bakeOffOptions) error {
			executed = true
			return nil
		})
		require.Error(t, err)
		require.False(t, executed, arguments)
	}
}

func TestRunValidatedBakeOffCommandPassesValidatedBudgetToExecution(t *testing.T) {
	var received bakeOffOptions
	err := runValidatedBakeOffCommand(
		[]string{"-confirm-paid", "-repetitions=5", "-provider-cost-stop-target-usd=6"},
		&strings.Builder{},
		func(options bakeOffOptions) error {
			received = options
			return nil
		},
	)
	require.NoError(t, err)
	require.Equal(t, 5, received.repetitions)
	require.Equal(t, 6.0, received.providerCostStopTargetUSD)
	require.True(t, received.confirmPaid)
}

func TestParseBakeOffOptionsDefaultsToFullRunTimeout(t *testing.T) {
	options, err := parseBakeOffOptions(
		[]string{"-confirm-paid", "-repetitions=5", "-provider-cost-stop-target-usd=5"},
		&strings.Builder{},
	)
	require.NoError(t, err)
	require.Equal(t, defaultBakeOffTimeout, options.timeout)
}

func TestParseBakeOffOptionsValidatesOptionalReportOutputBeforeExecution(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "bakeoff-report.json")
	options, err := parseBakeOffOptions([]string{
		"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1",
		"-output", outputPath,
	}, &strings.Builder{})
	require.NoError(t, err)
	require.Equal(t, outputPath, options.outputPath)
	require.False(t, options.overwriteOutput)

	for _, arguments := range [][]string{
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-overwrite-output"},
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-output", filepath.Join(t.TempDir(), "report.txt")},
		{"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1", "-output", filepath.Join(t.TempDir(), "missing", "report.json")},
	} {
		_, parseErr := parseBakeOffOptions(arguments, &strings.Builder{})
		require.Error(t, parseErr, arguments)
	}
}

func TestParseBakeOffOptionsRejectsExistingOutputWithoutExplicitOverwrite(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "report.json")
	require.NoError(t, os.WriteFile(outputPath, []byte("existing"), 0o600))

	_, err := parseBakeOffOptions([]string{
		"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1",
		"-output", outputPath,
	}, &strings.Builder{})
	require.ErrorContains(t, err, "-overwrite-output")

	options, err := parseBakeOffOptions([]string{
		"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1",
		"-output", outputPath, "-overwrite-output",
	}, &strings.Builder{})
	require.NoError(t, err)
	require.True(t, options.overwriteOutput)
}

func TestParseBakeOffOptionsRejectsSymlinkOutputEvenWithOverwrite(t *testing.T) {
	directory := t.TempDir()
	targetPath := filepath.Join(directory, "target.json")
	outputPath := filepath.Join(directory, "report.json")
	require.NoError(t, os.WriteFile(targetPath, []byte("target"), 0o600))
	require.NoError(t, os.Symlink(targetPath, outputPath))

	_, err := parseBakeOffOptions([]string{
		"-confirm-paid", "-repetitions=1", "-provider-cost-stop-target-usd=1",
		"-output", outputPath, "-overwrite-output",
	}, &strings.Builder{})
	require.ErrorContains(t, err, "regular file")
}

func TestWriteBlindReportOutputsPersistsExactStdoutAtomicallyWithPrivatePermissions(t *testing.T) {
	report := services.OmniChatBakeOffReport{
		Repetitions:          5,
		CompletedRepetitions: 5,
		Candidates: []services.OmniChatBakeOffCandidateReport{{
			BlindID: "candidate-a",
			Profile: services.OmniChatBakeOffProfile{Name: "private-profile-name"},
		}},
		CandidateMapping: map[string]services.OmniChatBakeOffCandidate{
			"candidate-a": {Route: "private/provider-route"},
		},
	}
	gate := services.OmniChatBakeOffQualityGateResult{Passed: true}
	outputPath := filepath.Join(t.TempDir(), "report.json")
	var stdout strings.Builder

	require.NoError(t, writeBlindReportOutputs(&stdout, outputPath, false, report, gate))
	persisted, err := os.ReadFile(outputPath)
	require.NoError(t, err)
	require.Equal(t, stdout.String(), string(persisted))
	require.Contains(t, stdout.String(), `"candidate-a"`)
	require.NotContains(t, stdout.String(), "private-profile-name")
	require.NotContains(t, stdout.String(), "private/provider-route")

	info, err := os.Stat(outputPath)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o600), info.Mode().Perm())

	matches, err := filepath.Glob(filepath.Join(filepath.Dir(outputPath), "."+filepath.Base(outputPath)+".tmp-*"))
	require.NoError(t, err)
	require.Empty(t, matches)
}

func TestWritePrivateAtomicFileNeverOverwritesWithoutExplicitPermission(t *testing.T) {
	require.ErrorContains(t, writePrivateAtomicFile("", []byte("report"), false), "output path is required")

	outputPath := filepath.Join(t.TempDir(), "report.json")
	require.NoError(t, os.WriteFile(outputPath, []byte("original"), 0o644))

	err := writePrivateAtomicFile(outputPath, []byte("replacement"), false)
	require.ErrorContains(t, err, "already exists")
	contents, readErr := os.ReadFile(outputPath)
	require.NoError(t, readErr)
	require.Equal(t, "original", string(contents))
}

func TestWritePrivateAtomicFileExplicitOverwriteReplacesRegularFilePrivately(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "report.json")
	require.NoError(t, os.WriteFile(outputPath, []byte("original"), 0o644))

	require.NoError(t, writePrivateAtomicFile(outputPath, []byte("replacement"), true))
	contents, err := os.ReadFile(outputPath)
	require.NoError(t, err)
	require.Equal(t, "replacement", string(contents))
	info, err := os.Stat(outputPath)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o600), info.Mode().Perm())
}
