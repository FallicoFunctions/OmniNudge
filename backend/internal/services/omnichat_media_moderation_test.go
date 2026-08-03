package services

import (
	"context"
	"errors"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/openrouter"
	"github.com/stretchr/testify/require"
)

func TestOpenRouterOmniChatMediaModeratorAcceptsOnlyExactDecision(t *testing.T) {
	for _, test := range []struct {
		result  string
		allowed bool
		wantErr bool
	}{
		{result: "ALLOW", allowed: true},
		{result: " BLOCK ", allowed: false},
		{result: "ALLOW because it is safe", wantErr: true},
	} {
		client := stubChatCompletionClient{generate: func(_ context.Context, messages []openrouter.Message, _ openrouter.StreamCallback) (string, error) {
			require.Contains(t, messages[1].Content, `kind="video"`)
			require.Contains(t, messages[1].Content, "scene request")
			return test.result, nil
		}}
		allowed, err := NewOpenRouterOmniChatMediaModerator(client).AllowPrivateMedia(
			context.Background(), "scene request", models.OmniChatMediaKindVideo,
		)
		require.Equal(t, test.allowed, allowed)
		require.Equal(t, test.wantErr, err != nil)
	}
}

func TestOpenRouterOmniChatMediaModeratorFailsClosed(t *testing.T) {
	client := stubChatCompletionClient{generate: func(context.Context, []openrouter.Message, openrouter.StreamCallback) (string, error) {
		return "", errors.New("provider unavailable")
	}}
	allowed, err := NewOpenRouterOmniChatMediaModerator(client).AllowPrivateMedia(
		context.Background(), "scene request", models.OmniChatMediaKindImage,
	)
	require.False(t, allowed)
	require.Error(t, err)
}
