package services

import (
	"strings"
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
	require.Contains(t, req.EffectivePrompt, "same subject identity")
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

func TestVisualRecentEventsKeepsPhysicalNarrationAndDropsDialogue(t *testing.T) {
	got := visualRecentEvents([]string{
		`User: I ask, "Are you nervous?"`,
		`Character: *I step closer and rest my hand on the table.* "Maybe."`,
		`User: I slide my hand along her arm and pull her closer.`,
	})

	require.Equal(t, "I step closer and rest my hand on the table.; I slide my hand along her arm and pull her closer.", got)
}

func TestVisualRecentEventsKeepsTruncatedNarrationAfterOpeningAsterisk(t *testing.T) {
	got := visualRecentEvents([]string{
		`User: FUCK!!!!! *I aim my dick at your mouth as the scene continues`,
	})

	require.Equal(t, "I aim my dick at your mouth as the scene continues", got)
}

func TestContextualEffectivePromptUsesVisualDirectionInsteadOfTranscriptMeta(t *testing.T) {
	request := models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeContextual,
		PersonaID: 42, ConversationID: generationIntPtr(7), Prompt: "show the scene",
		Scene: models.OmniChatSceneState{RecentEvents: []string{`Character: *I walk toward the window.* "Look at me."`}},
	}
	got, err := NormalizeOmniChatGenerationRequest(request)
	require.NoError(t, err)
	require.Contains(t, got.EffectivePrompt, "Recent physical context: I walk toward the window.")
	require.NotContains(t, got.EffectivePrompt, "untrusted scene context")
	require.NotContains(t, got.EffectivePrompt, "Look at me")
	require.Contains(t, got.EffectivePrompt, "not a headshot or selfie")
	require.Contains(t, got.EffectivePrompt, "replace the reference background")
}

func generationIntPtr(value int) *int { return &value }

// contextualPromptFor is a small helper for the subject-framing table below.
func contextualPromptFor(t *testing.T, prompt string, scene models.OmniChatSceneState) string {
	t.Helper()
	request, err := NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind:           models.OmniChatMediaKindImage,
		Mode:           models.OmniChatGenerationModeContextual,
		PersonaID:      42,
		ConversationID: generationIntPtr(7),
		Prompt:         prompt,
		AspectRatio:    "4:5",
		Scene:          scene,
	})
	require.NoError(t, err)
	return request.EffectivePrompt
}

// A scene image is shot from the user's point of view and shows the persona
// alone. The worker used to infer subject count from transcript substrings,
// which put an uninvited second body in ordinary scenes.
func TestContextualPromptDefaultsToPersonaOnlyAndOptsInDeliberately(t *testing.T) {
	dungeon := models.OmniChatSceneState{Location: "a stone dungeon", Activity: "kneeling"}

	for _, testCase := range []struct {
		name            string
		prompt          string
		scene           models.OmniChatSceneState
		includeUserBody bool
	}{
		{"a plain scene request", "Show Sadie at the park", models.OmniChatSceneState{Location: "a park"}, false},
		{"a wardrobe question", "Show me what she is wearing", dungeon, false},
		{"observing from a distance", "I watch her across the room", dungeon, false},
		{"an explicit request for both", "Show us standing together", dungeon, true},
		{"another phrasing for both", "a photo of the two of us", dungeon, true},
		{"server-derived physical contact", "Show the current scene", models.OmniChatSceneState{
			Location: "a stone dungeon", Activity: "kneeling", IncludeUserBody: true,
		}, true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			prompt := contextualPromptFor(t, testCase.prompt, testCase.scene)
			if testCase.includeUserBody {
				require.Contains(t, prompt, "Two subjects are in frame")
				require.Contains(t, prompt, "Crop the viewer's face out of frame")
				require.NotContains(t, prompt, "only subject in frame")
			} else {
				require.Contains(t, prompt, "only subject in frame")
				require.Contains(t, prompt, "Do not add the viewer's body")
				require.NotContains(t, prompt, "Two subjects are in frame")
			}
		})
	}
}

func TestContextualPromptCarriesAccessoriesAndBodyState(t *testing.T) {
	prompt := contextualPromptFor(t, "Show the current scene", models.OmniChatSceneState{
		Location:    "a stone-walled basement with iron rings bolted to the wall",
		Outfit:      "a black leather harness; wrists bound behind her back",
		Accessories: []string{"leather collar", "flogger"},
		Pose:        "kneeling upright",
	})
	require.Contains(t, prompt, "iron rings bolted to the wall")
	require.Contains(t, prompt, "wrists bound behind her back")
	require.Contains(t, prompt, "leather collar, flogger")
	require.Contains(t, prompt, "kneeling upright")
}

// The /image command is deliberately unrelated to the roleplay, so it must not
// pick up scene framing or scene fields.
func TestCreateModePromptIsPassedThroughUnchanged(t *testing.T) {
	request, err := NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind:        models.OmniChatMediaKindImage,
		Mode:        models.OmniChatGenerationModeCreate,
		PersonaID:   42,
		Prompt:      "Sadie standing on the beach in a red bikini",
		AspectRatio: "4:5",
	})
	require.NoError(t, err)
	require.Equal(t, "Sadie standing on the beach in a red bikini", request.EffectivePrompt)
	require.NotContains(t, request.EffectivePrompt, "only subject in frame")
}

// The reference is whatever the persona's avatar is. A user may upload an
// object and legitimately request it in a new setting, so the contextual
// scaffolding must not assert that the subject is a person.
func TestContextualPromptDoesNotAssertTheSubjectIsHuman(t *testing.T) {
	prompt := contextualPromptFor(t, "Show the current scene", models.OmniChatSceneState{
		Location: "a mountain summit at sunset with clouds below",
		Activity: "resting on bare rock",
	})
	for _, banned := range []string{"person", "character", "woman", "human"} {
		require.NotContains(t, strings.ToLower(prompt), banned, "%q leaked into the prompt", banned)
	}
	require.Contains(t, prompt, "the subject's identity")
}

// Server-owned scene fields must not be settable by a caller. SubjectAppearance
// is injected verbatim as the leading clause of the image prompt, so a request
// that set it would override the persona's own description entirely.
func TestServerOwnedSceneFieldsAreStrippedFromCallerInput(t *testing.T) {
	scene := models.OmniChatSceneState{
		Location:          "a bedroom",
		SubjectAppearance: "a 12 year old girl",
		ViewerPosition:    "attacker supplied viewpoint",
		IncludeUserBody:   true,
	}
	stripServerOwnedSceneFields(&scene)

	require.Empty(t, scene.SubjectAppearance, "caller must not set the persona's appearance")
	require.Empty(t, scene.ViewerPosition, "caller must not set the camera viewpoint")
	require.False(t, scene.IncludeUserBody, "caller must not force a second body into frame")
	require.Equal(t, "a bedroom", scene.Location, "ordinary scene fields survive")
}

func TestServerDerivedSceneTextStaysBounded(t *testing.T) {
	// These are filled after the scrub, from the extractor and the persona, so
	// normalization is what keeps an over-long value out of the prompt.
	_, err := NormalizeOmniChatSceneState(models.OmniChatSceneState{
		SubjectAppearance: strings.Repeat("a", omniChatMaxSceneFieldRunes+1),
	})
	require.Error(t, err)

	_, err = NormalizeOmniChatSceneState(models.OmniChatSceneState{
		ViewerPosition: strings.Repeat("b", omniChatMaxSceneFieldRunes+1),
	})
	require.Error(t, err)
}
