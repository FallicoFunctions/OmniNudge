package main

import (
	"encoding/json"
	"errors"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestConfiguredCandidatesUseDeploymentRoutesWithoutExposingCredentials(t *testing.T) {
	cfg := &config.Config{}
	cfg.OpenRouter.StandardModel = "configured/standard"
	cfg.OpenRouter.PlusModel = "configured/plus"
	cfg.OpenRouter.PremiumQuickModel = "configured/quick"
	cfg.OpenRouter.PremiumDeepModel = "configured/deep"
	cfg.OpenRouter.UltraFastModel = "configured/fast"

	candidates := configuredCandidates(cfg)

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
	require.Contains(t, output.String(), `"p50_ms": 10`)
	require.Contains(t, output.String(), `"p95_ms": 20`)
	require.Contains(t, output.String(), `"invariants"`)
	require.Contains(t, output.String(), `"no_prompt_disclosure"`)
}

func TestExitCodeForQualityGate(t *testing.T) {
	require.Equal(t, 0, exitCodeForGate(services.OmniChatBakeOffQualityGateResult{Passed: true}))
	require.Equal(t, 1, exitCodeForGate(services.OmniChatBakeOffQualityGateResult{Passed: false}))
}

func TestValidateBakeOffTimeout(t *testing.T) {
	require.NoError(t, validateBakeOffTimeout(10*time.Minute))
	require.NoError(t, validateBakeOffTimeout(30*time.Minute))
	require.Error(t, validateBakeOffTimeout(0))
	require.Error(t, validateBakeOffTimeout(31*time.Minute))
}

func TestValidateBakeOffRepetitions(t *testing.T) {
	require.NoError(t, validateBakeOffRepetitions(1))
	require.NoError(t, validateBakeOffRepetitions(5))
	require.NoError(t, validateBakeOffRepetitions(services.MaxOmniChatBakeOffRepetitions))
	require.Error(t, validateBakeOffRepetitions(0))
	require.Error(t, validateBakeOffRepetitions(-1))
	require.Error(t, validateBakeOffRepetitions(3))
	require.Error(t, validateBakeOffRepetitions(services.MaxOmniChatBakeOffRepetitions+1))
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
	require.Equal(t, 30*time.Minute, options.timeout)
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
