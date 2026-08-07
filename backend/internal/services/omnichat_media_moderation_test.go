package services

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

func moderatorReturning(t *testing.T, result string, err error) *OpenRouterOmniChatMediaModerator {
	t.Helper()
	client := stubChatCompletionClient{generate: func(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
		require.Len(t, messages, 2)
		require.Equal(t, openrouter.RoleSystem, messages[0].Role)
		require.Contains(t, messages[1].Content, "untrusted_media_request")
		return result, err
	}}
	return NewOpenRouterOmniChatMediaModerator(client)
}

func TestMediaModeratorBlocksOnlyOnAnExplicitBlock(t *testing.T) {
	for _, testCase := range []struct {
		result  string
		allowed bool
	}{
		{"ALLOW", true},
		{" BLOCK ", false},
		{"block", false},
		// An unparseable reply is a classifier malfunction, not a verdict.
		{"ALLOW because it is consensual", true},
		{"", true},
	} {
		t.Run(strings.TrimSpace(testCase.result), func(t *testing.T) {
			allowed, err := moderatorReturning(t, testCase.result, nil).
				AllowPrivateMedia(context.Background(), "scene request", models.OmniChatMediaKindImage)
			require.NoError(t, err)
			require.Equal(t, testCase.allowed, allowed)
		})
	}
}

// The predecessor was fail-closed, so an OpenRouter outage looked like a total
// generation failure. That is why it was deleted rather than fixed.
func TestMediaModeratorFailsOpenWhenTheProviderIsDown(t *testing.T) {
	allowed, err := moderatorReturning(t, "", errors.New("provider unavailable")).
		AllowPrivateMedia(context.Background(), "scene request", models.OmniChatMediaKindVideo)
	require.NoError(t, err)
	require.True(t, allowed)
}

func TestMediaModeratorPromptAllowsAdultContentAndNamesTheBlockedCategories(t *testing.T) {
	prompt := omniChatMediaModerationSystemPrompt
	// The product's core function must not be classified as unsafe.
	for _, allowed := range []string{"BDSM", "bondage", "nudity", "explicit acts"} {
		require.Contains(t, prompt, allowed)
	}
	for _, blocked := range []string{"under 18", "ambiguous", "identifiable real person", "non-consensual"} {
		require.Contains(t, prompt, blocked)
	}
}

type promptModeratorFake struct {
	allowed bool
	err     error
	seen    string
}

func (f *promptModeratorFake) AllowPrivateMedia(_ context.Context, text string, _ models.OmniChatMediaKind) (bool, error) {
	f.seen = text
	return f.allowed, f.err
}

func TestModerateGenerationPromptGatesGenerationRequests(t *testing.T) {
	request := models.OmniChatGenerationRequest{
		Kind:            models.OmniChatMediaKindImage,
		EffectivePrompt: "a stone dungeon scene",
		NegativePrompt:  "blurry",
	}

	// No moderator configured: local development and tests stay runnable.
	require.NoError(t, moderateGenerationPrompt(context.Background(), nil, request))

	allow := &promptModeratorFake{allowed: true}
	require.NoError(t, moderateGenerationPrompt(context.Background(), allow, request))
	require.Contains(t, allow.seen, "a stone dungeon scene")
	require.Contains(t, allow.seen, "blurry")

	block := &promptModeratorFake{allowed: false}
	require.ErrorIs(t, moderateGenerationPrompt(context.Background(), block, request), ErrOmniChatGenerationSafetyRejected)
}
