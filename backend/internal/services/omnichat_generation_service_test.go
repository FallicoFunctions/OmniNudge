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
	updatedID    int
}

func (f *generationConversationReaderFake) GetByID(_ context.Context, _, _ int) (*models.BotConversation, error) {
	return f.conversation, nil
}

func (f *generationConversationReaderFake) UpdateLastMessageAt(_ context.Context, conversationID int) error {
	f.updatedID = conversationID
	return nil
}

type generationStoreFake struct {
	scene          *models.OmniChatSceneState
	recentEvents   []string
	asset          *models.OmniChatMediaAsset
	existingJob    *models.OmniChatGenerationJob
	created        *models.OmniChatGenerationJob
	failedCode     string
	failedError    string
	markErr        error
	markContextErr error
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

func (f *generationStoreFake) GetGenerationJobForSourceMessageOwned(_ context.Context, _, _ int) (*models.OmniChatGenerationJob, error) {
	return f.existingJob, nil
}

func (f *generationStoreFake) CreateGenerationJob(_ context.Context, ownerUserID int, req models.OmniChatGenerationRequest, provider string) (*models.OmniChatGenerationJob, error) {
	f.created = &models.OmniChatGenerationJob{
		ID:                 uuid.New(),
		OwnerUserID:        ownerUserID,
		PersonaID:          req.PersonaID,
		ConversationID:     req.ConversationID,
		SourceMessageID:    req.SourceMessageID,
		Kind:               req.Kind,
		Mode:               req.Mode,
		Status:             models.OmniChatGenerationStatusQueued,
		Prompt:             req.Prompt,
		EffectivePrompt:    req.EffectivePrompt,
		BillingOperationID: req.BillingOperationID,
		Scene:              req.Scene,
		Provider:           provider,
		BillingRequired:    req.BillingRequired == nil || *req.BillingRequired,
		AllowNSFW:          req.AllowNSFW,
		SourceAssetID:      req.SourceAssetID,
	}
	return f.created, nil
}

func (f *generationStoreFake) MarkGenerationJobFailed(ctx context.Context, _ uuid.UUID, safeCode, providerError string) (bool, error) {
	f.failedCode = safeCode
	f.failedError = providerError
	f.markContextErr = ctx.Err()
	return f.markErr == nil, f.markErr
}

type generationEnqueuerFake struct {
	jobID uuid.UUID
	err   error
}

type generationMessageWriterFake struct {
	conversationID int
	content        string
	requestID      uuid.UUID
	message        *models.BotMessage
	reused         bool
}

func (f *generationMessageWriterFake) CreateUserTurnWithRequestID(_ context.Context, conversationID int, content string, requestID uuid.UUID) (*models.BotMessage, bool, error) {
	f.conversationID = conversationID
	f.content = content
	f.requestID = requestID
	f.message = &models.BotMessage{ID: 88, ConversationID: conversationID, Role: models.BotMessageRoleUser, Content: content}
	return f.message, f.reused, nil
}

type generationServiceBillingFake struct{}

func (generationServiceBillingFake) ReserveOwned(_ context.Context, _ int, operationID uuid.UUID, usageKind string) (*models.OmniCreditsUsageReservation, error) {
	return &models.OmniCreditsUsageReservation{OperationID: operationID, UsageKind: usageKind}, nil
}
func (generationServiceBillingFake) RefundOwned(context.Context, int, uuid.UUID) error { return nil }

type refundedOperationGenerationBillingFake struct {
	operations []uuid.UUID
}

func (f *refundedOperationGenerationBillingFake) ReserveOwned(_ context.Context, _ int, operationID uuid.UUID, usageKind string) (*models.OmniCreditsUsageReservation, error) {
	f.operations = append(f.operations, operationID)
	if len(f.operations) == 1 {
		return nil, models.ErrOmniCreditsReservationRefunded
	}
	return &models.OmniCreditsUsageReservation{OperationID: operationID, UsageKind: usageKind}, nil
}
func (*refundedOperationGenerationBillingFake) RefundOwned(context.Context, int, uuid.UUID) error {
	return nil
}

type adminGenerationServiceBillingFake struct {
	reserveCalls int
}

func (f *adminGenerationServiceBillingFake) ReserveOwned(_ context.Context, userID int, operationID uuid.UUID, usageKind string) (*models.OmniCreditsUsageReservation, error) {
	f.reserveCalls++
	return &models.OmniCreditsUsageReservation{
		UserID: userID, OperationID: operationID, UsageKind: usageKind,
		AdminBypass: true, Status: models.OmniCreditsReservationCaptured,
	}, nil
}

func (*adminGenerationServiceBillingFake) RefundOwned(context.Context, int, uuid.UUID) error {
	return nil
}

func (f *generationEnqueuerFake) EnqueueOmniChatGeneration(_ context.Context, id uuid.UUID) error {
	f.jobID = id
	return f.err
}

func TestOmniChatGenerationServiceAdvancesAfterRefundedStableOperation(t *testing.T) {
	store := &generationStoreFake{}
	billing := &refundedOperationGenerationBillingFake{}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		nil,
		store,
		&generationEnqueuerFake{},
		"runpod",
	).SetBilling(billing)
	stable := uuid.New()
	job, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate,
		PersonaID: 42, Prompt: "A sunny park", BillingOperationID: &stable,
	})
	require.NoError(t, err)
	require.NotNil(t, job)
	require.Len(t, billing.operations, 2)
	require.Equal(t, stable, billing.operations[0])
	require.NotEqual(t, stable, billing.operations[1])
	require.NotNil(t, store.created.BillingOperationID)
	require.Equal(t, billing.operations[1], *store.created.BillingOperationID)
}

func TestOmniChatGenerationServicePersistsAdminGenerationAsUnbilled(t *testing.T) {
	store := &generationStoreFake{}
	billing := &adminGenerationServiceBillingFake{}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		nil,
		store,
		&generationEnqueuerFake{},
		"runpod",
	).SetBilling(billing)

	job, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate,
		PersonaID: 42, Prompt: "A sunny park",
	})
	require.NoError(t, err)
	require.NotNil(t, job)
	require.Equal(t, 1, billing.reserveCalls)
	require.Nil(t, store.created.BillingOperationID)
	require.False(t, store.created.BillingRequired)
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
		"runpod",
	).SetBilling(generationServiceBillingFake{})

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
		"runpod",
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
		"runpod",
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
		"runpod",
	).SetBilling(generationServiceBillingFake{})

	_, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind:      models.OmniChatMediaKindImage,
		Mode:      models.OmniChatGenerationModeCreate,
		PersonaID: 42,
		Prompt:    "Portrait at sunset",
	})

	require.ErrorIs(t, err, ErrOmniChatGenerationUnavailable)
	require.Equal(t, "queue_unavailable", store.failedCode)
	require.Equal(t, "generation could not be queued", store.failedError)
	require.NoError(t, store.markContextErr)
}

func TestOmniChatGenerationServiceUsesIndependentContextToRecordQueueFailure(t *testing.T) {
	store := &generationStoreFake{}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{}, store, nil, "runpod",
	).SetBilling(generationServiceBillingFake{})
	requestCtx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := service.CreateGeneration(requestCtx, 9, models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate,
		PersonaID: 42, Prompt: "Portrait at sunset",
	})

	require.ErrorIs(t, err, ErrOmniChatGenerationUnavailable)
	require.Equal(t, "queue_unavailable", store.failedCode)
	require.Equal(t, "generation could not be queued", store.failedError)
	require.NoError(t, store.markContextErr)
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

func TestOmniChatGenerationServiceAllowsPrivateAdultScenePrompt(t *testing.T) {
	store := &generationStoreFake{}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{}, store, &generationEnqueuerFake{}, "runpod",
	).SetBilling(generationServiceBillingFake{})

	job, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeCreate,
		PersonaID: 42, Prompt: "Two consenting adults share a private intimate moment",
	})

	require.NoError(t, err)
	require.NotNil(t, job)
	require.NotNil(t, store.created)
}

func TestOmniChatGenerationServiceMediaCommandPersistsTurnAndLinksSource(t *testing.T) {
	conversationID := 7
	writer := &generationMessageWriterFake{}
	store := &generationStoreFake{}
	requestID := uuid.New()
	conversationReader := &generationConversationReaderFake{conversation: &models.BotConversation{ID: conversationID, UserID: 9, PersonaID: 42}}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		conversationReader,
		store, &generationEnqueuerFake{}, "runpod",
	).SetBilling(generationServiceBillingFake{}).SetMessageWriter(writer).SetConversationWriter(conversationReader)

	job, message, err := service.CreateConversationMediaCommand(context.Background(), 9, conversationID, models.OmniChatMediaCommandRequest{
		RequestID: requestID, Kind: models.OmniChatMediaKindVideo, Prompt: "walking down the stairs in a red dress",
	})

	require.NoError(t, err)
	require.NotNil(t, job)
	require.NotNil(t, message)
	require.Equal(t, "/video walking down the stairs in a red dress", writer.content)
	require.Equal(t, requestID, writer.requestID)
	require.Equal(t, conversationID, writer.conversationID)
	require.Equal(t, conversationID, conversationReader.updatedID)
	require.Equal(t, 88, *store.created.SourceMessageID)
	require.Equal(t, requestID, *message.RequestID)
	require.Equal(t, models.OmniChatGenerationModeCreate, store.created.Mode)
}

func TestOmniChatGenerationServiceMediaCommandRejectsInvalidPromptBeforePersisting(t *testing.T) {
	writer := &generationMessageWriterFake{}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{conversation: &models.BotConversation{ID: 7, UserID: 9, PersonaID: 42}},
		&generationStoreFake{}, &generationEnqueuerFake{}, "runpod",
	).SetBilling(generationServiceBillingFake{}).SetMessageWriter(writer)

	_, _, err := service.CreateConversationMediaCommand(context.Background(), 9, 7, models.OmniChatMediaCommandRequest{
		RequestID: uuid.New(), Kind: models.OmniChatMediaKindImage, Prompt: "   ",
	})

	require.EqualError(t, err, "prompt is required")
	require.Empty(t, writer.content)
}

func TestOmniChatGenerationServiceMediaCommandReusesAcceptedJobAfterInterruptedResponse(t *testing.T) {
	conversationID := 7
	requestID := uuid.New()
	sourceMessageID := 88
	existing := &models.OmniChatGenerationJob{
		ID: uuid.New(), OwnerUserID: 9, PersonaID: 42, ConversationID: &conversationID,
		SourceMessageID: &sourceMessageID, Kind: models.OmniChatMediaKindImage,
		Mode: models.OmniChatGenerationModeCreate, Status: models.OmniChatGenerationStatusQueued,
	}
	writer := &generationMessageWriterFake{reused: true}
	store := &generationStoreFake{existingJob: existing}
	service := NewOmniChatGenerationService(
		&generationPersonaReaderFake{persona: &models.BotPersona{ID: 42}},
		&generationConversationReaderFake{conversation: &models.BotConversation{ID: conversationID, UserID: 9, PersonaID: 42}},
		store, &generationEnqueuerFake{}, "runpod",
	).SetBilling(generationServiceBillingFake{}).SetMessageWriter(writer)

	job, message, err := service.CreateConversationMediaCommand(context.Background(), 9, conversationID, models.OmniChatMediaCommandRequest{
		RequestID: requestID, Kind: models.OmniChatMediaKindImage, Prompt: "a portrait in the park",
	})

	require.NoError(t, err)
	require.Same(t, existing, job)
	require.Equal(t, requestID, *message.RequestID)
	require.Nil(t, store.created)
}

func TestOmniChatGenerationServiceRejectsDirectMessagePersona(t *testing.T) {
	conversationID := 7
	directPersona := &models.BotPersona{
		ID:                   42,
		ResponseStyleProfile: models.ResponseStyleProfileDirectMessage,
	}

	t.Run("scene generation", func(t *testing.T) {
		store := &generationStoreFake{}
		service := NewOmniChatGenerationService(
			&generationPersonaReaderFake{persona: directPersona},
			&generationConversationReaderFake{
				conversation: &models.BotConversation{ID: conversationID, UserID: 9, PersonaID: 42},
			},
			store,
			&generationEnqueuerFake{},
			"runpod",
		)

		_, err := service.CreateGeneration(context.Background(), 9, models.OmniChatGenerationRequest{
			Kind:           models.OmniChatMediaKindImage,
			Mode:           models.OmniChatGenerationModeContextual,
			PersonaID:      42,
			ConversationID: &conversationID,
			Prompt:         "Show me",
		})

		require.ErrorIs(t, err, ErrOmniChatGenerationNotSupported)
		require.Nil(t, store.created)
	})

	// Hiding the buttons is cosmetic. A hand-rolled /photo request has to be
	// refused by the server too, or the character is still made to pose.
	t.Run("slash command", func(t *testing.T) {
		store := &generationStoreFake{}
		service := NewOmniChatGenerationService(
			&generationPersonaReaderFake{persona: directPersona},
			&generationConversationReaderFake{
				conversation: &models.BotConversation{ID: conversationID, UserID: 9, PersonaID: 42},
			},
			store,
			&generationEnqueuerFake{},
			"runpod",
		)
		service.SetMessageWriter(&generationMessageWriterFake{})

		_, _, err := service.CreateConversationMediaCommand(context.Background(), 9, conversationID,
			models.OmniChatMediaCommandRequest{
				RequestID: uuid.New(),
				Kind:      models.OmniChatMediaKindImage,
				Prompt:    "Show me what you're wearing",
			})

		require.ErrorIs(t, err, ErrOmniChatGenerationNotSupported)
		require.Nil(t, store.created)
	})
}
