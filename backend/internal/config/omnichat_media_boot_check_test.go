package config_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/config"
)

func full() config.OmniChatMediaConfig {
	return config.OmniChatMediaConfig{
		Provider:              "runpod",
		RunPodAPIKey:          "key",
		RunPodImageEndpointID: "image",
		RunPodVideoEndpointID: "video",
	}
}

func TestMediaEndpointGapsSilentWhenConfigured(t *testing.T) {
	require.Empty(t, full().MediaEndpointGaps())
}

// The regression this whole check exists for: video worked in August, the
// endpoint id was lost, and the backend kept booting without a word.
func TestMediaEndpointGapsNamesTheMissingVideoEndpoint(t *testing.T) {
	cfg := full()
	cfg.RunPodVideoEndpointID = ""

	gaps := cfg.MediaEndpointGaps()

	require.Len(t, gaps, 1)
	require.Contains(t, gaps[0], "RUNPOD_VIDEO_ENDPOINT_ID")
	require.Contains(t, gaps[0], "provider_unavailable")
}

// Whitespace is not configuration. A key left as "VAR= " in an environment
// file reaches here as a space and would otherwise pass.
func TestMediaEndpointGapsTreatsWhitespaceAsUnset(t *testing.T) {
	cfg := full()
	cfg.RunPodVideoEndpointID = "   "

	require.Len(t, cfg.MediaEndpointGaps(), 1)
}

func TestMediaEndpointGapsNamesEveryMissingSetting(t *testing.T) {
	gaps := config.OmniChatMediaConfig{Provider: "runpod"}.MediaEndpointGaps()

	require.Len(t, gaps, 3)
	joined := strings.Join(gaps, "\n")
	require.Contains(t, joined, "RUNPOD_API_KEY")
	require.Contains(t, joined, "RUNPOD_IMAGE_ENDPOINT_ID")
	require.Contains(t, joined, "RUNPOD_VIDEO_ENDPOINT_ID")
}

// The NSFW endpoint is only a gap when explicit content is switched on. Naming
// it on every deployment would train people to ignore the whole block, which
// is how the video gap would have been missed a second time.
func TestMediaEndpointGapsIgnoresNSFWEndpointUnlessEnabled(t *testing.T) {
	cfg := full()
	require.Empty(t, cfg.MediaEndpointGaps())

	cfg.ExplicitContentEnabled = true
	gaps := cfg.MediaEndpointGaps()

	require.Len(t, gaps, 1)
	require.Contains(t, gaps[0], "RUNPOD_NSFW_IMAGE_ENDPOINT_ID")
}

// A deployment that is not on RunPod has no RunPod endpoints to miss.
func TestMediaEndpointGapsSilentForOtherProviders(t *testing.T) {
	require.Empty(t, config.OmniChatMediaConfig{Provider: "stub"}.MediaEndpointGaps())
}
