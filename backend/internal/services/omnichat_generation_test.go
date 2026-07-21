package services

import (
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestNormalizeOmniChatGenerationRequestBuildsContextualImagePrompt(t *testing.T) {
	req, err := NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind:            models.OmniChatMediaKindImage,
		Mode:            models.OmniChatGenerationModeContextual,
		PersonaID:       42,
		ConversationID:  generationIntPtr(7),
		SourceMessageID: generationIntPtr(11),
		Prompt:          "Show me your outfit today",
		AspectRatio:     "4:5",
		Scene: models.OmniChatSceneState{
			Location:   "Riverside park",
			TimeOfDay:  "late afternoon",
			Weather:    "sunny with a light breeze",
			Lighting:   "warm golden-hour light",
			Activity:   "walking beside the user",
			Outfit:     "blue sundress and white sneakers",
			Expression: "happy, relaxed smile",
			Mood:       "playful",
		},
	})

	require.NoError(t, err)
	require.Equal(t, models.OmniChatMediaKindImage, req.Kind)
	require.Equal(t, models.OmniChatGenerationModeContextual, req.Mode)
	require.Equal(t, "4:5", req.AspectRatio)
	require.Contains(t, req.EffectivePrompt, "Riverside park")
	require.Contains(t, req.EffectivePrompt, "blue sundress and white sneakers")
	require.Contains(t, req.EffectivePrompt, "warm golden-hour light")
	require.Contains(t, req.EffectivePrompt, "Show me your outfit today")
	require.Contains(t, req.EffectivePrompt, "same character identity")
}

func TestNormalizeOmniChatGenerationRequestRequiresConversationForContextualMode(t *testing.T) {
	_, err := NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind:      models.OmniChatMediaKindImage,
		Mode:      models.OmniChatGenerationModeContextual,
		PersonaID: 42,
		Prompt:    "Show me",
	})

	require.EqualError(t, err, "conversation_id is required for contextual generation")
}

func TestNormalizeOmniChatGenerationRequestRequiresSourceImageForImageToVideo(t *testing.T) {
	_, err := NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind:      models.OmniChatMediaKindVideo,
		Mode:      models.OmniChatGenerationModeImageToVideo,
		PersonaID: 42,
		Prompt:    "She turns toward the camera and smiles",
	})

	require.EqualError(t, err, "source_asset_id is required for image-to-video generation")
}

func TestNormalizeOmniChatGenerationRequestRejectsUnsupportedOptions(t *testing.T) {
	tests := []struct {
		name string
		req  models.OmniChatGenerationRequest
		err  string
	}{
		{
			name: "kind",
			req:  models.OmniChatGenerationRequest{Kind: "audio", Mode: models.OmniChatGenerationModeCreate, PersonaID: 1, Prompt: "hello"},
			err:  "kind must be image or video",
		},
		{
			name: "aspect ratio",
			req:  models.OmniChatGenerationRequest{Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate, PersonaID: 1, Prompt: "hello", AspectRatio: "2:7"},
			err:  "aspect_ratio is invalid",
		},
		{
			name: "duration",
			req:  models.OmniChatGenerationRequest{Kind: models.OmniChatMediaKindVideo, Mode: models.OmniChatGenerationModeCreate, PersonaID: 1, Prompt: "hello", DurationSeconds: 30},
			err:  "duration_seconds must be between 3 and 10",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NormalizeOmniChatGenerationRequest(tt.req)
			require.EqualError(t, err, tt.err)
		})
	}
}

func TestNormalizeOmniChatSceneStateTrimsAndBoundsRecentEvents(t *testing.T) {
	scene, err := NormalizeOmniChatSceneState(models.OmniChatSceneState{
		Location: "  a quiet cafe  ",
		RecentEvents: []string{
			"arrived together", "ordered tea", "sat by the window", "talked about music",
			"watched the rain", "shared dessert", "ignored overflow",
		},
	})

	require.NoError(t, err)
	require.Equal(t, "a quiet cafe", scene.Location)
	require.Equal(t, []string{
		"sat by the window", "talked about music", "watched the rain", "shared dessert", "ignored overflow",
	}, scene.RecentEvents)
}

func generationIntPtr(value int) *int { return &value }
