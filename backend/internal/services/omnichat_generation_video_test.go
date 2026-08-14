package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestVideoMotionPromptDescribesMovementOnly(t *testing.T) {
	// The still already fixes appearance, outfit, lighting and setting.
	// Restating them here gives the video model something to contradict, which
	// is what drift looks like.
	prompt := BuildOmniChatVideoMotionPrompt(
		models.OmniChatGenerationModeContextual,
		"Show the current scene in motion, preserving the character, setting, outfit, mood, and activity.",
		models.OmniChatSceneState{
			Location:          "the rain-slick balcony",
			Outfit:            "a red silk robe",
			SubjectAppearance: "freckled, auburn hair",
			Activity:          "leaning on the railing",
			Pose:              "weight on one hip",
			Mood:              "playful",
			CameraDirection:   "slow push in",
		},
	)

	require.Contains(t, prompt, "leaning on the railing")
	require.NotContains(t, prompt, "freckled")
	require.NotContains(t, prompt, "red silk robe")
	require.NotContains(t, prompt, "rain-slick balcony")

	// A resting posture read as an instruction and cancelled the motion; mood
	// was the only energy cue and turned a sway into a jump; a camera position
	// labelled as movement produced a moving camera.
	require.NotContains(t, prompt, "weight on one hip")
	require.NotContains(t, prompt, "playful")
	require.NotContains(t, prompt, "slow push in")
	require.Contains(t, prompt, "Static camera")

	// The button's boilerplate carries no motion information and, appended
	// last, outweighed the clause that did.
	require.NotContains(t, prompt, "preserving the character")
	require.NotContains(t, prompt, "..")
}

func TestVideoMotionPromptGivesTheClipAnEnding(t *testing.T) {
	// Without a start and end state the model samples the middle of a movement
	// and the clip stops mid-gesture.
	prompt := BuildOmniChatVideoMotionPrompt(
		models.OmniChatGenerationModeContextual, "",
		models.OmniChatSceneState{Activity: "jumping up and down"},
	)

	require.Contains(t, prompt, "starts from the position shown")
	require.Contains(t, prompt, "comes to rest before the clip ends")
}

func TestVideoMotionPromptUsesCreateRequestsAsWritten(t *testing.T) {
	for _, mode := range []models.OmniChatGenerationMode{
		models.OmniChatGenerationModeCreate,
		models.OmniChatGenerationModeImageToVideo,
	} {
		prompt := BuildOmniChatVideoMotionPrompt(mode, "she turns and waves",
			models.OmniChatSceneState{Activity: "standing still"})
		require.Equal(t, "she turns and waves", prompt)
	}
}

func TestVideoMotionPromptSurvivesAnEmptyScene(t *testing.T) {
	prompt := BuildOmniChatVideoMotionPrompt(
		models.OmniChatGenerationModeContextual, "look at me", models.OmniChatSceneState{})
	require.Contains(t, prompt, "Animate the supplied still image.")
	require.Contains(t, prompt, "comes to rest before the clip ends")
}

func TestSourceAssetIsClearedOutsideImageToVideo(t *testing.T) {
	// On a scene or create video, source_asset_id set means the job's own image
	// phase produced that still. A caller-supplied value would break that
	// meaning and make a retry skip the phase it never ran.
	sourceID := uuid.New()
	normalized, err := NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeContextual,
		PersonaID:       42,
		ConversationID:  intPointer(7),
		SourceAssetID:   &sourceID,
		Prompt:          "show me the scene",
		DurationSeconds: 5,
	})
	require.NoError(t, err)
	require.Nil(t, normalized.SourceAssetID)

	kept, err := NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeImageToVideo,
		PersonaID:       42,
		SourceAssetID:   &sourceID,
		Prompt:          "she waves",
		DurationSeconds: 5,
	})
	require.NoError(t, err)
	require.Equal(t, &sourceID, kept.SourceAssetID)
}

type generationUserReaderFake struct {
	user *models.User
	err  error
}

func (f *generationUserReaderFake) GetByID(context.Context, int) (*models.User, error) {
	return f.user, f.err
}

// entitledUser is the baseline account explicit content is allowed for:
// premium, unexpired, with the preference switched on. Tests vary one field at
// a time from here so a failure names the condition that actually decided it.
func entitledUser(plan string, expiresAt *time.Time) *models.User {
	return &models.User{ID: 9, Plan: plan, PlanExpiresAt: expiresAt, NSFW: true}
}

func newEntitlementService(store *generationStoreFake, users OmniChatUserReader) *OmniChatGenerationService {
	return NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{},
		store,
		&generationEnqueuerFake{},
		"runpod",
	).SetBilling(generationServiceBillingFake{}).
		SetContentEntitlement(NewOmniChatContentEntitlement(users))
}

func createEntitlementJob(t *testing.T, service *OmniChatGenerationService) *models.OmniChatGenerationJob {
	t.Helper()
	job, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind:      models.OmniChatMediaKindImage,
		Mode:      models.OmniChatGenerationModeCreate,
		PersonaID: 42,
		Prompt:    "Portrait at sunset",
	})
	require.NoError(t, err)
	return job
}

func TestExplicitContentIsAPremiumEntitlement(t *testing.T) {
	future := time.Now().Add(24 * time.Hour)
	for _, test := range []struct {
		name    string
		plan    string
		expires *time.Time
		allowed bool
	}{
		{name: "premium", plan: models.PlanPremium, expires: &future, allowed: true},
		{name: "premium without an expiry", plan: models.PlanPremium, allowed: true},
		{name: "plus", plan: models.PlanPlus, expires: &future, allowed: false},
		{name: "free", plan: models.PlanFree, allowed: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			store := &generationStoreFake{}
			service := newEntitlementService(store,
				&generationUserReaderFake{user: entitledUser(test.plan, test.expires)})

			require.Equal(t, test.allowed, createEntitlementJob(t, service).AllowNSFW)
		})
	}
}

func TestLapsedPremiumLosesExplicitContent(t *testing.T) {
	past := time.Now().Add(-time.Hour)
	store := &generationStoreFake{}
	service := newEntitlementService(store,
		&generationUserReaderFake{user: entitledUser(models.PlanPremium, &past)})

	require.False(t, createEntitlementJob(t, service).AllowNSFW)
}

func TestExplicitContentAlsoRequiresTheAccountPreference(t *testing.T) {
	// Plan grants the entitlement; users.nsfw is the subscriber's own switch.
	// The explore feed has always honoured it, so chat and generation ignoring
	// it would make the same account behave two different ways.
	future := time.Now().Add(24 * time.Hour)
	optedOut := entitledUser(models.PlanPremium, &future)
	optedOut.NSFW = false
	store := &generationStoreFake{}
	service := newEntitlementService(store, &generationUserReaderFake{user: optedOut})

	require.False(t, createEntitlementJob(t, service).AllowNSFW)
}

func TestAdministratorsCanReproduceWhatPremiumSees(t *testing.T) {
	store := &generationStoreFake{}
	admin := entitledUser(models.PlanFree, nil)
	admin.Role = "admin"
	service := newEntitlementService(store, &generationUserReaderFake{user: admin})

	require.True(t, createEntitlementJob(t, service).AllowNSFW)
}

func TestAdministratorsStillHonourTheAccountPreference(t *testing.T) {
	store := &generationStoreFake{}
	admin := entitledUser(models.PlanFree, nil)
	admin.Role = "admin"
	admin.NSFW = false
	service := newEntitlementService(store, &generationUserReaderFake{user: admin})

	require.False(t, createEntitlementJob(t, service).AllowNSFW)
}

func TestEntitlementLookupFailureDeniesRatherThanFailingTheRequest(t *testing.T) {
	// The render is still worth producing; it just goes to the standard
	// endpoint. Escalating on an error would be the wrong way to fail, and
	// erroring out would lose a job the user already paid for.
	store := &generationStoreFake{}
	service := newEntitlementService(store,
		&generationUserReaderFake{err: errors.New("account lookup unavailable")})

	require.False(t, createEntitlementJob(t, service).AllowNSFW)
}

func TestEntitlementDefaultsToDeniedWhenUnwired(t *testing.T) {
	store := &generationStoreFake{}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{},
		store,
		&generationEnqueuerFake{},
		"runpod",
	).SetBilling(generationServiceBillingFake{})

	require.False(t, createEntitlementJob(t, service).AllowNSFW)
}

func intPointer(value int) *int { return &value }
