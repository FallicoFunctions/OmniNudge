package queue

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/fal"
	"github.com/stretchr/testify/require"
)

type cancelledGenerationStoreFake struct{ job *models.OmniChatGenerationJob }

func (f *cancelledGenerationStoreFake) GetGenerationJobForProcessing(context.Context, uuid.UUID) (*models.OmniChatGenerationJob, error) {
	return f.job, nil
}
func (*cancelledGenerationStoreFake) GetMediaAssetOwned(context.Context, uuid.UUID, int) (*models.OmniChatMediaAsset, error) {
	return nil, nil
}
func (*cancelledGenerationStoreFake) MarkGenerationJobRunning(context.Context, uuid.UUID, string) (bool, error) {
	return false, nil
}
func (*cancelledGenerationStoreFake) UpdateGenerationProgress(context.Context, uuid.UUID, int) error {
	return nil
}
func (*cancelledGenerationStoreFake) MarkGenerationJobFailed(context.Context, uuid.UUID, string, string) error {
	return nil
}
func (*cancelledGenerationStoreFake) CompleteGenerationJob(context.Context, uuid.UUID, *models.MediaFile, *models.OmniChatMediaAsset, int64, int64) error {
	return nil
}

type cancellableFalFake struct{ cancelCalls int }

func (*cancellableFalFake) Submit(context.Context, string, any) (string, error) { return "", nil }
func (*cancellableFalFake) Status(context.Context, string, string) (*fal.QueueStatus, error) {
	return &fal.QueueStatus{Status: fal.StatusInProgress}, nil
}
func (*cancellableFalFake) Result(context.Context, string, string) (*fal.Result, error) {
	return nil, nil
}
func (f *cancellableFalFake) Cancel(context.Context, string, string) error {
	f.cancelCalls++
	return nil
}

type generationClaimStoreFake struct {
	job        *models.OmniChatGenerationJob
	markResult bool
	markErr    error
}

func (f *generationClaimStoreFake) GetGenerationJobForProcessing(context.Context, uuid.UUID) (*models.OmniChatGenerationJob, error) {
	return f.job, nil
}
func (*generationClaimStoreFake) GetMediaAssetOwned(context.Context, uuid.UUID, int) (*models.OmniChatMediaAsset, error) {
	return nil, nil
}
func (f *generationClaimStoreFake) MarkGenerationJobRunning(context.Context, uuid.UUID, string) (bool, error) {
	return f.markResult, f.markErr
}
func (*generationClaimStoreFake) UpdateGenerationProgress(context.Context, uuid.UUID, int) error {
	return nil
}
func (*generationClaimStoreFake) MarkGenerationJobFailed(context.Context, uuid.UUID, string, string) error {
	return nil
}
func (*generationClaimStoreFake) CompleteGenerationJob(context.Context, uuid.UUID, *models.MediaFile, *models.OmniChatMediaAsset, int64, int64) error {
	return nil
}

type generationPersonaReaderFake struct {
	persona      *models.BotPersona
	viewer       *int
	inaccessible bool
}

func (f *generationPersonaReaderFake) GetAccessibleByID(_ context.Context, _ int, viewerUserID *int) (*models.BotPersona, error) {
	if viewerUserID != nil {
		viewer := *viewerUserID
		f.viewer = &viewer
	}
	if f.inaccessible {
		return nil, nil
	}
	if f.persona == nil {
		return &models.BotPersona{}, nil
	}
	return f.persona, nil
}

func TestResolveInputsRechecksPersonaAccessForJobOwner(t *testing.T) {
	reader := &generationPersonaReaderFake{inaccessible: true}
	handler := NewOmniChatGenerationHandler(
		&generationClaimStoreFake{}, reader, &unusedGenerationStorageFake{}, nil,
		&submittingFalFake{}, omniChatMediaTestConfig(), false,
	)
	job := &models.OmniChatGenerationJob{OwnerUserID: 29, PersonaID: 17}

	_, _, err := handler.resolveInputs(context.Background(), job)

	var permanent *permanentGenerationError
	require.ErrorAs(t, err, &permanent)
	require.Equal(t, "persona_not_found", permanent.code)
	require.NotNil(t, reader.viewer)
	require.Equal(t, 29, *reader.viewer)
}

type unusedGenerationStorageFake struct{}

func (*unusedGenerationStorageFake) Upload(context.Context, string, io.Reader, string) (string, error) {
	return "", nil
}
func (*unusedGenerationStorageFake) Download(context.Context, string) (io.ReadCloser, error) {
	return nil, errors.New("unused")
}
func (*unusedGenerationStorageFake) Delete(context.Context, string) error { return nil }
func (*unusedGenerationStorageFake) GetSignedURL(context.Context, string, time.Duration) (string, error) {
	return "", nil
}
func (*unusedGenerationStorageFake) List(context.Context, string) ([]string, error) { return nil, nil }
func (*unusedGenerationStorageFake) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (*unusedGenerationStorageFake) PublicURL(string) string { return "" }
func (*unusedGenerationStorageFake) GetObjectSize(context.Context, string) (int64, error) {
	return 0, nil
}

type cleanupGenerationStorageFake struct {
	unusedGenerationStorageFake
	deleteContextErr error
}

func (f *cleanupGenerationStorageFake) Delete(ctx context.Context, _ string) error {
	f.deleteContextErr = ctx.Err()
	return nil
}

type submittingFalFake struct {
	cancellableFalFake
	submitCalls int
}

func (f *submittingFalFake) Submit(context.Context, string, any) (string, error) {
	f.submitCalls++
	return "provider-job", nil
}

func newGenerationClaimTestHandler(store *generationClaimStoreFake, provider *submittingFalFake) *OmniChatGenerationHandler {
	return NewOmniChatGenerationHandler(
		store,
		&generationPersonaReaderFake{},
		&unusedGenerationStorageFake{},
		nil,
		provider,
		omniChatMediaTestConfig(),
		false,
	)
}

func omniChatMediaTestConfig() config.OmniChatMediaConfig {
	return config.OmniChatMediaConfig{
		FalImageModel:      "fal-ai/nano-banana-2",
		FalImageEditModel:  "fal-ai/nano-banana-2/edit",
		FalTextVideoModel:  "fal-ai/wan/v2.7/text-to-video",
		FalImageVideoModel: "fal-ai/wan/v2.7/image-to-video",
	}
}

func TestBuildFalGenerationSpecUsesCharacterReferenceForImage(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindImage,
		EffectivePrompt: "Sadie at the park",
		AspectRatio:     "4:5",
	}
	spec, err := BuildFalGenerationSpec(omniChatMediaTestConfig(), job, []string{"https://cdn.example.test/sadie.png"}, "")

	require.NoError(t, err)
	require.Equal(t, "fal-ai/nano-banana-2/edit", spec.ModelID)
	require.Equal(t, []string{"https://cdn.example.test/sadie.png"}, spec.Input["image_urls"])
	require.Equal(t, "4:5", spec.Input["aspect_ratio"])
	require.Equal(t, true, spec.Input["limit_generations"])
}

func TestBuildFalGenerationSpecBuildsImageToVideoInput(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeImageToVideo,
		EffectivePrompt: "She turns and waves",
		NegativePrompt:  "distorted hands",
		AspectRatio:     "9:16",
		DurationSeconds: 7,
	}
	spec, err := BuildFalGenerationSpec(omniChatMediaTestConfig(), job, nil, "https://signed.example.test/source.png")

	require.NoError(t, err)
	require.Equal(t, "fal-ai/wan/v2.7/image-to-video", spec.ModelID)
	require.Equal(t, "https://signed.example.test/source.png", spec.Input["image_url"])
	require.Equal(t, 7, spec.Input["duration"])
	require.Equal(t, "9:16", spec.Input["aspect_ratio"])
	require.Equal(t, true, spec.Input["enable_safety_checker"])
}

func TestBuildFalGenerationSpecBuildsTextToVideoInput(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeCreate,
		EffectivePrompt: "Walking through a rainy city",
		AspectRatio:     "16:9",
		DurationSeconds: 5,
	}
	spec, err := BuildFalGenerationSpec(omniChatMediaTestConfig(), job, nil, "")

	require.NoError(t, err)
	require.Equal(t, "fal-ai/wan/v2.7/text-to-video", spec.ModelID)
	require.NotContains(t, spec.Input, "image_url")
	require.Equal(t, "1080p", spec.Input["resolution"])
}

func TestBuildFalGenerationSpecRequiresSourceURLForImageToVideo(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeImageToVideo,
		EffectivePrompt: "Wave",
	}
	_, err := BuildFalGenerationSpec(omniChatMediaTestConfig(), job, nil, "")
	require.EqualError(t, err, "image-to-video source is unavailable")
}

func TestOmniChatGenerationHandlerStopsProviderWorkWhenJobIsCancelled(t *testing.T) {
	provider := &cancellableFalFake{}
	jobID := uuid.New()
	handler := &OmniChatGenerationHandler{
		jobs:     &cancelledGenerationStoreFake{job: &models.OmniChatGenerationJob{ID: jobID, Status: models.OmniChatGenerationStatusCancelled}},
		provider: provider,
	}

	cancelled, err := handler.stopIfGenerationCancelled(context.Background(), jobID, "fal-ai/model", "provider-job")
	require.NoError(t, err)
	require.True(t, cancelled)
	require.Equal(t, 1, provider.cancelCalls)
}

func TestOmniChatGenerationHandlerCancelsSubmittedWorkWhenClaimLosesRace(t *testing.T) {
	provider := &submittingFalFake{}
	job := &models.OmniChatGenerationJob{
		ID: uuid.New(), PersonaID: 42, Kind: models.OmniChatMediaKindImage,
		Mode: models.OmniChatGenerationModeCreate, Status: models.OmniChatGenerationStatusQueued,
		EffectivePrompt: "Sadie at the park",
	}
	handler := newGenerationClaimTestHandler(&generationClaimStoreFake{job: job}, provider)

	err := handler.process(context.Background(), job.ID)

	require.NoError(t, err)
	require.Equal(t, 1, provider.submitCalls)
	require.Equal(t, 1, provider.cancelCalls)
}

func TestOmniChatGenerationHandlerCancelsSubmittedWorkWhenClaimPersistenceFails(t *testing.T) {
	provider := &submittingFalFake{}
	job := &models.OmniChatGenerationJob{
		ID: uuid.New(), PersonaID: 42, Kind: models.OmniChatMediaKindImage,
		Mode: models.OmniChatGenerationModeCreate, Status: models.OmniChatGenerationStatusQueued,
		EffectivePrompt: "Sadie at the park",
	}
	databaseErr := errors.New("database unavailable")
	handler := newGenerationClaimTestHandler(&generationClaimStoreFake{job: job, markErr: databaseErr}, provider)

	err := handler.process(context.Background(), job.ID)

	require.ErrorIs(t, err, databaseErr)
	require.Equal(t, 1, provider.submitCalls)
	require.Equal(t, 1, provider.cancelCalls)
}

func TestOmniChatGenerationHandlerCleansUpUploadAfterRequestCancellation(t *testing.T) {
	storage := &cleanupGenerationStorageFake{}
	handler := &OmniChatGenerationHandler{storage: storage}
	requestContext, cancel := context.WithCancel(context.Background())
	cancel()

	handler.deleteGenerationObject(requestContext, "omnichat/generated/orphan.png")

	require.NoError(t, storage.deleteContextErr)
}

var _ services.StorageService = (*unusedGenerationStorageFake)(nil)
