package main

import (
	"errors"
	"flag"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestConfiguredEvaluationProfileUsesDeploymentRouteAndProfileControls(t *testing.T) {
	cfg := &config.Config{}
	cfg.OpenRouter.StandardModel = "configured/standard"
	cfg.OpenRouter.PremiumDeepModel = "configured/deep"

	profile, err := configuredEvaluationProfile(cfg, services.OmniChatModelProfilePremiumDeep, "")

	require.NoError(t, err)
	require.Equal(t, services.OmniChatModelProfilePremiumDeep, profile.Key)
	require.Equal(t, "configured/deep", profile.ModelKey)
	require.Equal(t, services.OmniChatModelReasoningEffortHigh, profile.ReasoningEffort)
	require.Equal(t, services.OmniChatModelSpeedStandard, profile.Speed)
}

func TestConfiguredEvaluationProfileSupportsExplicitRouteOverride(t *testing.T) {
	cfg := &config.Config{}
	cfg.OpenRouter.StandardModel = "configured/standard"

	profile, err := configuredEvaluationProfile(cfg, services.OmniChatModelProfileStandard, "candidate/route")

	require.NoError(t, err)
	require.Equal(t, "candidate/route", profile.ModelKey)
	require.Equal(t, services.OmniChatModelReasoningEffortLow, profile.ReasoningEffort)
}

func TestConfiguredEvaluationProfileRejectsUnknownProfile(t *testing.T) {
	_, err := configuredEvaluationProfile(&config.Config{}, services.OmniChatModelProfileKey("raw/provider"), "")

	require.ErrorContains(t, err, "unknown profile")
}

func TestParseResponseEvaluationOptionsRequiresPaidConfirmation(t *testing.T) {
	_, err := parseResponseEvaluationOptions([]string{"-profile", "standard"}, &strings.Builder{})

	require.ErrorContains(t, err, "-confirm-paid")
}

func TestParseResponseEvaluationOptionsAcceptsBoundedConfirmedRun(t *testing.T) {
	options, err := parseResponseEvaluationOptions([]string{
		"-profile", "premium_deep",
		"-case-timeout", "30s",
		"-confirm-paid",
	}, &strings.Builder{})

	require.NoError(t, err)
	require.Equal(t, services.OmniChatModelProfilePremiumDeep, options.profile)
	require.Equal(t, 30*time.Second, options.caseTimeout)
	require.True(t, options.confirmPaid)
}

func TestParseResponseEvaluationOptionsHandlesHelpWithoutConfirmation(t *testing.T) {
	_, err := parseResponseEvaluationOptions([]string{"-h"}, &strings.Builder{})

	require.True(t, errors.Is(err, flag.ErrHelp))
}
