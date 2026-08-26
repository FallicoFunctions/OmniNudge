package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGetEnvAsPositiveIntFallsBackForInvalidValues(t *testing.T) {
	for _, value := range []string{"0", "-1", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("TEST_POSITIVE_INT", value)
			require.Equal(t, 7, getEnvAsPositiveInt("TEST_POSITIVE_INT", 7))
		})
	}
	t.Setenv("TEST_POSITIVE_INT", "12")
	require.Equal(t, 12, getEnvAsPositiveInt("TEST_POSITIVE_INT", 7))
}

func TestGetEnvAsPositiveInt64FallsBackForInvalidValues(t *testing.T) {
	for _, value := range []string{"0", "-1", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("TEST_POSITIVE_INT64", value)
			require.EqualValues(t, 1024, getEnvAsPositiveInt64("TEST_POSITIVE_INT64", 1024))
		})
	}
	t.Setenv("TEST_POSITIVE_INT64", "2048")
	require.EqualValues(t, 2048, getEnvAsPositiveInt64("TEST_POSITIVE_INT64", 1024))
}

func TestGetEnvAsStringListNormalizesAndDeduplicates(t *testing.T) {
	t.Setenv("TEST_STRING_LIST", " 10.0.0.1, 192.0.2.0/24,10.0.0.1, ,")
	require.Equal(t, []string{"10.0.0.1", "192.0.2.0/24"}, getEnvAsStringList("TEST_STRING_LIST"))

	t.Setenv("TEST_STRING_LIST", "")
	require.Nil(t, getEnvAsStringList("TEST_STRING_LIST"))
}

func TestAppendHTTPSOriginHostAddsConfiguredStorageOriginWithoutTrustingUnsafeURLs(t *testing.T) {
	hosts := []string{"storage.googleapis.com"}
	hosts = appendHTTPSOriginHost(hosts, "https://R2.Example.test")
	hosts = appendHTTPSOriginHost(hosts, "https://r2.example.test")
	hosts = appendHTTPSOriginHost(hosts, "http://internal.example.test")
	hosts = appendHTTPSOriginHost(hosts, "https://user:secret@example.test")
	hosts = appendHTTPSOriginHost(hosts, "https://example.test/path")

	require.Equal(t, []string{"storage.googleapis.com", "r2.example.test", "example.test"}, hosts)
}

func TestLoadUsesQualifiedOmniChatStandardModelByDefault(t *testing.T) {
	t.Setenv("DB_USER", "test")
	t.Setenv("JWT_SECRET", "test")
	t.Setenv("ENCRYPTION_KEY", "test")
	t.Setenv("RUNPOD_API_KEY", "server-only")
	t.Setenv("RUNPOD_IMAGE_ENDPOINT_ID", "image-endpoint")
	t.Setenv("RUNPOD_IMAGE_ENDPOINT_ID_NSFW", "image-endpoint-nsfw")
	t.Setenv("RUNPOD_VIDEO_ENDPOINT_ID", "video-endpoint")
	t.Setenv("RUNPOD_INPUT_HOSTS", "storage.example.test,media.example.test,storage.example.test")
	t.Setenv("RUNPOD_OUTPUT_HOSTS", "storage.googleapis.com, media.example.test,storage.googleapis.com")
	t.Setenv("S3_ENDPOINT", "https://r2.example.test")
	t.Setenv("CLOUDFRONT_URL", "https://cdn.example.test")
	previous, existed := os.LookupEnv("OMNICHAT_MODEL_STANDARD_PRIMARY")
	require.NoError(t, os.Unsetenv("OMNICHAT_MODEL_STANDARD_PRIMARY"))
	t.Cleanup(func() {
		if existed {
			require.NoError(t, os.Setenv("OMNICHAT_MODEL_STANDARD_PRIMARY", previous))
			return
		}
		require.NoError(t, os.Unsetenv("OMNICHAT_MODEL_STANDARD_PRIMARY"))
	})

	cfg, err := Load()
	require.NoError(t, err)
	require.Equal(t, "google/gemini-3.1-flash-lite", cfg.OpenRouter.StandardModel)

	// Extraction has its own default and must not silently follow the chat
	// model. They are chosen on different criteria, and when they shared a knob,
	// fixing one would have changed what free members talk to.
	require.Equal(t, "google/gemini-3-flash-preview", cfg.OpenRouter.ExtractionModel)
	require.NotEqual(t, cfg.OpenRouter.StandardModel, cfg.OpenRouter.ExtractionModel)
	require.Equal(t, "runpod", cfg.OmniChatMedia.Provider)
	require.Equal(t, "server-only", cfg.OmniChatMedia.RunPodAPIKey)
	require.Equal(t, "image-endpoint", cfg.OmniChatMedia.RunPodImageEndpointID)
	require.Equal(t, "image-endpoint-nsfw", cfg.OmniChatMedia.RunPodNSFWImageEndpointID)
	require.Equal(t, "video-endpoint", cfg.OmniChatMedia.RunPodVideoEndpointID)
	// A video job is two provider renders inside one bounded request.
	require.Equal(t, 1800, cfg.OmniChatMedia.RunPodRequestTimeoutSeconds)
	require.Equal(t, []string{"storage.googleapis.com", "media.example.test", "r2.example.test", "cdn.example.test"}, cfg.OmniChatMedia.RunPodOutputHosts)
	require.Equal(t, []string{"storage.example.test", "media.example.test", "r2.example.test", "cdn.example.test"}, cfg.OmniChatMedia.RunPodInputHosts)
}
