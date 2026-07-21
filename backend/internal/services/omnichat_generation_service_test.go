package services

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type generationPersonaReaderFake struct {
	persona *models.BotPersona
}

func (f *generationPersonaReaderFake) GetAccessibleByID(_ context.Context, _ int, _ *int) (*models.BotPersona, error) {
	return f.persona, nil
}

type generationConversationReaderFake struct {
	conversation *models.BotConversation
}

func (f *generationConversationReaderFake) GetByID(_ context.Context, _, _ int) (*models.BotConversation, error) {
	return f.conversation, nil
}

type generationStoreFake struct {
	scene        *models.OmniChatSceneState
	recentEvents []string
	asset        *models.OmniChatMediaAsset
	created      *models.OmniChatGenerationJob
	failedCode   string
	failedError  string
}

func (f *generationStoreFake) GetRecentConversationEventsOwned(_ context.Context, _, _, _ int) ([]string, error) {
	return append([]string(nil), f.recentEvents...), nil
}

func (f *generationStoreFake) GetConversationSceneOwned(_ context.Context, _, _ int) (*models.OmniChatSceneState, error) {
	return f.scene, nil
}

func (f *generationStoreFake) GetMediaAssetOwned(_ context.Context, _ uuid.UUID, _ int) (*models.OmniChatMediaAsset, error) {
	return f.asset, nil
}

func (f *generationStoreFake) MessageBelongsToConversation(_ context.Context, _, _ int) (bool, error) {
	return true, nil
}

func (f *generationStoreFake) CreateGenerationJob(_ context.Context, ownerUserID int, req models.OmniChatGenerationRequest, provider string) (*models.OmniChatGenerationJob, error) {
	f.created = &models.OmniChatGenerationJob{
		ID:              uuid.New(),
		OwnerUserID:     ownerUserID,
		PersonaID:       req.PersonaID,
		ConversationID:  req.ConversationID,
		SourceMessageID: req.SourceMessageID,
		Kind:            req.Kind,
		Mode:            req.Mode,
		Status:          models.OmniChatGenerationStatusQueued,
		Prompt:          req.Prompt,
		EffectivePrompt: req.EffectivePrompt,
		Scene:           req.Scene,
		Provider:        provider,
	}
	return f.created, nil
}

func (f *generationStoreFake) MarkGenerationJobFailed(_ context.Context, _ uuid.UUID, safeCode, providerError string) error {
	f.failedCode = safeCode
	f.failedError = providerError
	return nil
}

type generationEnqueuerFake struct {
	jobID uuid.UUID
	err   error
}

func (f *generationEnqueuerFake) EnqueueOmniChatGeneration(_ context.Context, id uuid.UUID) error {
	f.jobID = id
	return f.err
}

func TestOmniChatGenerationServiceCreateUsesStoredSceneAndEnqueues(t *testing.T) {
	conversationID := 7
	messageID := 12
	store := &generationStoreFake{scene: &models.OmniChatSceneState{
		Location: "the park",
		Outfit:   "green jacket and jeans",
	}, recentEvents: []string{"User: We meet beside the fountain.", "Sadie: I spread the picnic blanket."}}
	enqueuer := &generationEnqueuerFake{}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{conversation: &models.BotConversation{ID: conversationID, UserID: 9, PersonaID: 42}},
		store,
		enqueuer,
		"fal",
	)

	job, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind:            models.OmniChatMediaKindImage,
		Mode:            models.OmniChatGenerationModeContextual,
		PersonaID:       42,
		ConversationID:  &conversationID,
		SourceMessageID: &messageID,
		Prompt:          "Show me your outfit",
	})

	require.NoError(t, err)
	require.NotNil(t, job)
	require.Equal(t, "the park", job.Scene.Location)
	require.Contains(t, job.EffectivePrompt, "green jacket and jeans")
	require.Equal(t, store.recentEvents, job.Scene.RecentEvents)
	require.Contains(t, job.EffectivePrompt, "picnic blanket")
	require.Equal(t, job.ID, enqueuer.jobID)
}

func TestOmniChatGenerationServiceCreateRejectsPersonaConversationMismatch(t *testing.T) {
	conversationID := 7
	store := &generationStoreFake{}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{conversation: &models.BotConversation{ID: conversationID, UserID: 9, PersonaID: 99}},
		store,
		&generationEnqueuerFake{},
		"fal",
	)

	_, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind:           models.OmniChatMediaKindImage,
		Mode:           models.OmniChatGenerationModeContextual,
		PersonaID:      42,
		ConversationID: &conversationID,
		Prompt:         "Show me",
	})

	require.ErrorIs(t, err, ErrOmniChatGenerationResourceNotFound)
	require.Nil(t, store.created)
}

func TestOmniChatGenerationServiceCreateRejectsForeignSourceAsset(t *testing.T) {
	sourceID := uuid.New()
	store := &generationStoreFake{asset: nil}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{},
		store,
		&generationEnqueuerFake{},
		"fal",
	)

	_, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind:          models.OmniChatMediaKindVideo,
		Mode:          models.OmniChatGenerationModeImageToVideo,
		PersonaID:     42,
		SourceAssetID: &sourceID,
		Prompt:        "Smile and wave",
	})

	require.ErrorIs(t, err, ErrOmniChatGenerationResourceNotFound)
}

func TestOmniChatGenerationServiceCreateMarksJobFailedWhenQueueUnavailable(t *testing.T) {
	store := &generationStoreFake{}
	enqueuer := &generationEnqueuerFake{err: errors.New("redis unavailable")}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{},
		store,
		enqueuer,
		"fal",
	)

	_, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind:      models.OmniChatMediaKindImage,
		Mode:      models.OmniChatGenerationModeCreate,
		PersonaID: 42,
		Prompt:    "Portrait at sunset",
	})

	require.ErrorIs(t, err, ErrOmniChatGenerationUnavailable)
	require.Equal(t, "queue_unavailable", store.failedCode)
	require.Contains(t, store.failedError, "redis unavailable")
}

func TestOmniChatGenerationServiceRejectsUnsupportedProviderBeforeCreatingJob(t *testing.T) {
	store := &generationStoreFake{}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{}, store, &generationEnqueuerFake{}, "unknown-provider",
	)

	_, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate,
		PersonaID: 42, Prompt: "Portrait at sunset",
	})

	require.ErrorIs(t, err, ErrOmniChatGenerationUnavailable)
	require.Nil(t, store.created)
}
