package services

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/models"
)

type recordingJobStore struct {
	requests []models.OmniChatGenerationRequest
	failOn   int
}

func (s *recordingJobStore) CreateGenerationJob(_ context.Context, ownerUserID int,
	request models.OmniChatGenerationRequest, _ string) (*models.OmniChatGenerationJob, error) {
	if s.failOn > 0 && len(s.requests) == s.failOn-1 {
		return nil, errors.New("database is unavailable")
	}
	s.requests = append(s.requests, request)
	return &models.OmniChatGenerationJob{ID: uuid.New(), OwnerUserID: ownerUserID}, nil
}

type recordingEnqueuer struct {
	enqueued int
	failOn   int
}

func (e *recordingEnqueuer) EnqueueOmniChatGeneration(context.Context, uuid.UUID) error {
	if e.failOn > 0 && e.enqueued == e.failOn-1 {
		return errors.New("redis is unavailable")
	}
	e.enqueued++
	return nil
}

func likenessPersona(t *testing.T) *models.BotPersona {
	t.Helper()
	owner := 9
	return &models.BotPersona{
		ID: 31, Name: "Nadia", OwnerUserID: &owner,
		ResponseStyleProfile: models.ResponseStyleProfileDirectMessage,
		ExtensionsJSON:       []byte(`{"omnichat_media":{"appearance":"A 27-year-old woman with long black hair.","render_style":"anime"}}`),
	}
}

func TestSheIsAskedForFourPictures(t *testing.T) {
	jobs, queue := &recordingJobStore{}, &recordingEnqueuer{}
	started, err := NewOmniChatOmniAILikenessService(jobs, queue, "runpod").
		Start(context.Background(), likenessPersona(t))

	require.NoError(t, err)
	require.Len(t, started, OmniChatOmniAILikenessCandidates)
	require.Len(t, jobs.requests, OmniChatOmniAILikenessCandidates)
	require.Equal(t, OmniChatOmniAILikenessCandidates, queue.enqueued)

	for _, request := range jobs.requests {
		require.Equal(t, models.OmniChatGenerationModeLikeness, request.Mode)
		require.Equal(t, models.OmniChatMediaKindImage, request.Kind)
		require.Equal(t, "9:16", request.AspectRatio)
		require.False(t, request.AllowNSFW)
		require.NotNil(t, request.BillingRequired)
		require.False(t, *request.BillingRequired)
		require.Nil(t, request.ConversationID)

		// Her description reaches the render, and the medium is stated beside
		// it rather than inside it.
		require.Contains(t, request.Prompt, "A 27-year-old woman with long black hair.")
		require.Contains(t, request.Prompt, "anime artwork")
		require.NotContains(t, request.Prompt, "photograph of")
	}
}

func TestAPartialSetIsKeptRatherThanThrownAway(t *testing.T) {
	// An individual render can fail anyway, so anything reading these copes
	// with fewer than four. Discarding three good jobs because the fourth could
	// not be queued would be the worse answer.
	jobs, queue := &recordingJobStore{}, &recordingEnqueuer{failOn: 3}
	started, err := NewOmniChatOmniAILikenessService(jobs, queue, "runpod").
		Start(context.Background(), likenessPersona(t))

	require.Error(t, err, "the gap in the choice is reported")
	require.Len(t, started, 2, "and the two that did start are kept")
	require.Equal(t, 2, queue.enqueued)
}

func TestOnlyAnOmniAIIsDrawnFromHerAnswers(t *testing.T) {
	// A roleplay card's picture is whatever its author uploaded.
	owner := 9
	card := &models.BotPersona{
		ID: 32, Name: "Card", OwnerUserID: &owner,
		ResponseStyleProfile: "natural_dialogue",
	}
	jobs, queue := &recordingJobStore{}, &recordingEnqueuer{}
	_, err := NewOmniChatOmniAILikenessService(jobs, queue, "runpod").Start(context.Background(), card)

	require.Error(t, err)
	require.Empty(t, jobs.requests)
	require.Zero(t, queue.enqueued)
}

func TestAnUnconfiguredLikenessSaysSoRatherThanPanicking(t *testing.T) {
	// Creation calls this and must survive a deployment with no render
	// provider. Nothing here may be the reason a character cannot be made.
	var service *OmniChatOmniAILikenessService
	_, err := service.Start(context.Background(), likenessPersona(t))
	require.Error(t, err)

	_, err = NewOmniChatOmniAILikenessService(nil, nil, "").Start(context.Background(), likenessPersona(t))
	require.Error(t, err)
}
