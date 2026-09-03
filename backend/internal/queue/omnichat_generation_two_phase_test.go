package queue

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/runpod"
	"github.com/stretchr/testify/require"
)

// twoPhaseStoreFake is a small in-memory stand-in for the generation job row.
// It enforces the same transitions the SQL does, because those transitions are
// exactly what the two-phase resume logic depends on: MarkGenerationJobRunning
// only matches a queued job, and StartGenerationSecondPhase only matches a
// running job that has a source asset and no provider request in flight.
type twoPhaseStoreFake struct {
	job *models.OmniChatGenerationJob

	markRunningCalls  int
	secondPhaseCalls  int
	intermediateCalls int
	completeCalls     int
	provenance        models.OmniChatGenerationProvenance
	intermediateKind  models.OmniChatMediaKind
	sourceAsset       *models.OmniChatMediaAsset
	deletedAssets     []uuid.UUID
	progress          []int
	// progressAtAttach is everything the bar had reported by the time the still
	// was stored, which is the only point where the two phases can be told
	// apart from inside the store.
	progressAtAttach []int
}

func (f *twoPhaseStoreFake) GetGenerationJobForProcessing(context.Context, uuid.UUID) (*models.OmniChatGenerationJob, error) {
	snapshot := *f.job
	return &snapshot, nil
}

func (f *twoPhaseStoreFake) GetMediaAssetOwned(_ context.Context, id uuid.UUID, ownerUserID int) (*models.OmniChatMediaAsset, error) {
	if f.sourceAsset == nil || f.sourceAsset.ID != id || f.sourceAsset.OwnerUserID != ownerUserID {
		return nil, nil
	}
	return f.sourceAsset, nil
}

func (f *twoPhaseStoreFake) DeleteMediaAssetOwned(_ context.Context, id uuid.UUID, ownerUserID int) (bool, error) {
	if f.sourceAsset == nil || f.sourceAsset.ID != id || f.sourceAsset.OwnerUserID != ownerUserID {
		return false, nil
	}
	f.deletedAssets = append(f.deletedAssets, id)
	f.sourceAsset = nil
	f.job.SourceAssetID = nil // the foreign key is ON DELETE SET NULL
	return true, nil
}

func (f *twoPhaseStoreFake) MarkGenerationJobRunning(_ context.Context, _ uuid.UUID, providerJobID string) (bool, error) {
	f.markRunningCalls++
	if f.job.Status != models.OmniChatGenerationStatusQueued {
		return false, nil
	}
	f.job.Status = models.OmniChatGenerationStatusRunning
	f.job.ProviderJobID = providerJobID
	return true, nil
}

func (f *twoPhaseStoreFake) StartGenerationSecondPhase(_ context.Context, _ uuid.UUID, providerJobID string) (bool, error) {
	f.secondPhaseCalls++
	if f.job.Status != models.OmniChatGenerationStatusRunning || f.job.SourceAssetID == nil || f.job.ProviderJobID != "" {
		return false, nil
	}
	f.job.ProviderJobID = providerJobID
	return true, nil
}

func (f *twoPhaseStoreFake) UpdateGenerationProgress(_ context.Context, _ uuid.UUID, progress int) error {
	f.progress = append(f.progress, progress)
	f.job.Progress = progress
	return nil
}

func (*twoPhaseStoreFake) MarkGenerationJobFailed(context.Context, uuid.UUID, string, string) (bool, error) {
	return true, nil
}

func (f *twoPhaseStoreFake) AttachIntermediateAsset(_ context.Context, jobID uuid.UUID, media *models.MediaFile, asset *models.OmniChatMediaAsset, kind models.OmniChatMediaKind, _, _ int64, _ models.OmniChatGenerationProvenance) error {
	f.intermediateCalls++
	f.intermediateKind = kind
	f.progressAtAttach = append([]int(nil), f.progress...)
	asset.ID = uuid.New()
	asset.OwnerUserID = f.job.OwnerUserID
	asset.GenerationJobID = jobID
	asset.Kind = kind
	asset.StoragePath = media.StoragePath
	asset.ScanStatus = models.MediaScanStatusClean
	f.sourceAsset = asset
	// Mirror the transaction: the source is recorded and the provider request
	// id is cleared in the same statement.
	f.job.SourceAssetID = &asset.ID
	f.job.ProviderJobID = ""
	return nil
}

func (f *twoPhaseStoreFake) CompleteGenerationJob(_ context.Context, _ uuid.UUID, _ *models.MediaFile, asset *models.OmniChatMediaAsset, _, _ int64, provenance models.OmniChatGenerationProvenance) error {
	f.completeCalls++
	f.provenance = provenance
	asset.ID = uuid.New()
	f.job.Status = models.OmniChatGenerationStatusSucceeded
	f.job.OutputAssetID = &asset.ID
	return nil
}

// twoPhaseProviderFake answers according to which endpoint was addressed, so a
// test can tell the image render and the animation apart.
type twoPhaseProviderFake struct {
	submittedEndpoints []string
	submittedInputs    []map[string]any
	polledJobIDs       []string
	// inProgressPolls is how many times each request reports work in flight
	// before it completes. Zero finishes on the first poll, which is the fast
	// path for tests that do not care about the progress bar.
	inProgressPolls int
	pollCounts      map[string]int
}

func (f *twoPhaseProviderFake) Submit(_ context.Context, endpointID string, input any) (string, error) {
	f.submittedEndpoints = append(f.submittedEndpoints, endpointID)
	if typed, ok := input.(map[string]any); ok {
		f.submittedInputs = append(f.submittedInputs, typed)
	}
	return endpointID + "-request", nil
}

func (f *twoPhaseProviderFake) Status(_ context.Context, _, jobID string) (*runpod.StatusResponse, error) {
	f.polledJobIDs = append(f.polledJobIDs, jobID)
	if f.pollCounts == nil {
		f.pollCounts = map[string]int{}
	}
	f.pollCounts[jobID]++
	if f.pollCounts[jobID] <= f.inProgressPolls {
		return &runpod.StatusResponse{Status: runpod.StatusInProgress}, nil
	}
	return &runpod.StatusResponse{Status: runpod.StatusCompleted}, nil
}

func (f *twoPhaseProviderFake) Result(_ context.Context, endpointID, _ string) (*runpod.Result, error) {
	if endpointID == "endpoint-video" {
		return &runpod.Result{
			Video:       &runpod.MediaFile{URL: "https://storage.googleapis.com/omnichat/clip.mp4", Duration: 5},
			WorkerBuild: "video-v1",
			ModelID:     "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
		}, nil
	}
	return &runpod.Result{
		Images:      []runpod.MediaFile{{URL: "https://storage.googleapis.com/omnichat/still.png", Width: 1344, Height: 768}},
		WorkerBuild: "image-v40",
		ModelID:     "SG161222/RealVisXL_V5.0",
	}, nil
}

func (*twoPhaseProviderFake) Cancel(context.Context, string, string) error { return nil }

// twoPhaseStorageFake records uploads and mints a signed URL for the still.
type twoPhaseStorageFake struct{ uploads []string }

func (f *twoPhaseStorageFake) Upload(_ context.Context, key string, _ io.Reader, _ string) (string, error) {
	f.uploads = append(f.uploads, key)
	return key, nil
}
func (*twoPhaseStorageFake) Download(context.Context, string) (io.ReadCloser, error) {
	return nil, nil
}
func (*twoPhaseStorageFake) Delete(context.Context, string) error { return nil }
func (*twoPhaseStorageFake) GetSignedURL(_ context.Context, key string, _ time.Duration) (string, error) {
	return "https://storage.googleapis.com/" + key + "?signature=test", nil
}
func (*twoPhaseStorageFake) List(context.Context, string) ([]string, error) { return nil, nil }
func (*twoPhaseStorageFake) GeneratePresignedPutURL(context.Context, string, string, time.Duration) (string, error) {
	return "", nil
}
func (*twoPhaseStorageFake) PublicURL(string) string { return "" }
func (*twoPhaseStorageFake) GetObjectSize(context.Context, string) (int64, error) {
	return 0, nil
}

func newTwoPhaseHandler(t *testing.T, store *twoPhaseStoreFake, provider *twoPhaseProviderFake, storage *twoPhaseStorageFake) *OmniChatGenerationHandler {
	t.Helper()
	handler := NewOmniChatGenerationHandler(
		store, &generationPersonaReaderFake{}, storage, nil, provider, omniChatMediaTestConfig(), false,
	)
	// The real fetch refuses loopback hosts, so an in-process HTTPS server
	// cannot stand in for the provider's object store. Hand back a temp file
	// with the extension the artifact kind implies.
	handler.downloadMedia = func(_ context.Context, _ string, kind modelsMediaKind, _ int64, _ ...string) (*generatedMediaDownload, func(), error) {
		extension, contentType := ".png", "image/png"
		if kind == modelsMediaKind(models.OmniChatMediaKindVideo) {
			extension, contentType = ".mp4", "video/mp4"
		}
		path := filepath.Join(t.TempDir(), "artifact"+extension)
		if err := os.WriteFile(path, []byte("artifact-bytes"), 0o600); err != nil {
			return nil, nil, err
		}
		return &generatedMediaDownload{
			Path: path, Size: 14, ContentType: contentType, Extension: extension,
		}, func() {}, nil
	}
	return handler
}

func newSceneVideoJob() *models.OmniChatGenerationJob {
	return &models.OmniChatGenerationJob{
		ID:              uuid.New(),
		OwnerUserID:     41,
		PersonaID:       42,
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeContextual,
		Status:          models.OmniChatGenerationStatusQueued,
		Prompt:          "show me the scene",
		EffectivePrompt: "A long image prompt describing her and the rain-slick balcony",
		AspectRatio:     "16:9",
		DurationSeconds: 5,
		Scene:           models.OmniChatSceneState{Location: "the balcony", Activity: "leaning on the railing"},
	}
}

func TestSceneVideoRendersAStillThenAnimatesIt(t *testing.T) {
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

	require.NoError(t, handler.process(context.Background(), store.job.ID))

	require.Equal(t, []string{"endpoint-image", "endpoint-video"}, provider.submittedEndpoints)
	require.Equal(t, 1, store.intermediateCalls)
	require.Equal(t, models.OmniChatMediaKindImage, store.intermediateKind,
		"the intermediate artifact is a still and must not be stored as a video")
	require.Equal(t, 1, store.completeCalls)

	// Two artifacts, one job id, told apart only by their extension.
	require.Len(t, storage.uploads, 2)
	require.Contains(t, storage.uploads[0], store.job.ID.String()+".png")
	require.Contains(t, storage.uploads[1], store.job.ID.String()+".mp4")

	// The animation is handed the still that was just stored, and carries no
	// appearance text of its own.
	videoInput := provider.submittedInputs[1]
	require.Equal(t, "image_to_video", videoInput["mode"])
	require.Contains(t, videoInput["source_image_url"], store.job.ID.String()+".png")
	require.NotContains(t, videoInput["prompt"], "rain-slick balcony")
	require.Contains(t, videoInput["prompt"], "leaning on the railing")
}

// The checkpoint has to reach the row, not merely the result struct.
//
// Both halves of this were broken at once: decodeResultMetadata is
// hand-written and never read model_id, so the field was populated by nothing,
// and the handler did not carry it into provenance either. A comparison of two
// models could not say which had rendered anything, and neither could the
// database afterwards.
//
// Asserted where the value is used rather than where it is defined. A test of
// the provenance struct alone stays green when the handler stops filling it in.
func TestTheCheckpointReachesTheStoredProvenance(t *testing.T) {
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

	require.NoError(t, handler.process(context.Background(), store.job.ID))
	require.Equal(t, 1, store.completeCalls)
	require.Equal(t, "video-v1", store.provenance.WorkerBuild)
	require.Equal(t, "Wan-AI/Wan2.2-TI2V-5B-Diffusers", store.provenance.ModelID)
}

func TestSceneVideoProgressLeavesRoomForTheAnimation(t *testing.T) {
	// The animation is the longer half. If the still were allowed the whole
	// bar, it would reach 90 and then sit there for the rest of the job.
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{inProgressPolls: 12}
	handler := newTwoPhaseHandler(t, store, provider, &twoPhaseStorageFake{})

	require.NoError(t, handler.process(context.Background(), store.job.ID))

	require.NotEmpty(t, store.progressAtAttach)
	for _, value := range store.progressAtAttach {
		require.LessOrEqualf(t, value, videoStillProgressCeiling,
			"the still reported %d%%, past its share of the bar", value)
	}
	require.Greater(t, store.progress[len(store.progress)-1], videoStillProgressCeiling,
		"the animation must continue the bar rather than restart it")
	require.LessOrEqual(t, store.progress[len(store.progress)-1], finalPhaseProgressCeiling)
}

func TestSceneVideoRetryAfterTheStillLandsSubmitsTheAnimation(t *testing.T) {
	// The window this covers: the image phase committed, then the process died
	// before the animation was submitted. The row carries a source asset and no
	// provider request, which is the only state that means "animate next".
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &twoPhaseProviderFake{}
	handler := newTwoPhaseHandler(t, store, provider, &twoPhaseStorageFake{})

	// First attempt: run the still, then stop as if the worker was killed.
	references, _, err := handler.resolveInputs(context.Background(), store.job)
	require.NoError(t, err)
	_, stopped, err := handler.renderVideoSourceStill(context.Background(), store.job, references)
	require.NoError(t, err)
	require.False(t, stopped)
	require.Equal(t, 1, store.intermediateCalls)
	require.NotNil(t, store.job.SourceAssetID)
	require.Empty(t, store.job.ProviderJobID)

	// Retry from a cold read of the row, watching only what the retry does.
	provider.submittedEndpoints = nil
	provider.polledJobIDs = nil
	require.NoError(t, handler.process(context.Background(), store.job.ID))

	require.Equal(t, 1, store.intermediateCalls, "the still must not be rendered again")
	require.Equal(t, []string{"endpoint-video"}, provider.submittedEndpoints)
	require.Equal(t, 1, store.secondPhaseCalls)
	require.Equal(t, 1, store.completeCalls)
	require.NotContains(t, provider.polledJobIDs, "endpoint-image-request",
		"the retry must not poll the finished image request")
}

func TestSceneVideoRetryWhileTheAnimationIsInFlightResumesIt(t *testing.T) {
	job := newSceneVideoJob()
	sourceID := uuid.New()
	job.Status = models.OmniChatGenerationStatusRunning
	job.SourceAssetID = &sourceID
	job.ProviderJobID = "endpoint-video-request"
	store := &twoPhaseStoreFake{
		job: job,
		sourceAsset: &models.OmniChatMediaAsset{
			ID: sourceID, OwnerUserID: job.OwnerUserID, Kind: models.OmniChatMediaKindImage,
			ScanStatus: models.MediaScanStatusClean, StoragePath: "omnichat/generated/41/still.png",
		},
	}
	provider := &twoPhaseProviderFake{}
	handler := newTwoPhaseHandler(t, store, provider, &twoPhaseStorageFake{})

	require.NoError(t, handler.process(context.Background(), job.ID))

	require.Empty(t, provider.submittedEndpoints, "an in-flight animation must be resumed, not resubmitted")
	require.Equal(t, []string{"endpoint-video-request"}, provider.polledJobIDs)
	require.Zero(t, store.intermediateCalls)
	require.Equal(t, 1, store.completeCalls)
}

func TestCreatePageImageToVideoSkipsTheImagePhase(t *testing.T) {
	sourceID := uuid.New()
	job := newSceneVideoJob()
	job.Mode = models.OmniChatGenerationModeImageToVideo
	job.SourceAssetID = &sourceID
	store := &twoPhaseStoreFake{
		job: job,
		sourceAsset: &models.OmniChatMediaAsset{
			ID: sourceID, OwnerUserID: job.OwnerUserID, Kind: models.OmniChatMediaKindImage,
			ScanStatus: models.MediaScanStatusClean, StoragePath: "omnichat/uploads/41/chosen.png",
		},
	}
	provider := &twoPhaseProviderFake{}
	handler := newTwoPhaseHandler(t, store, provider, &twoPhaseStorageFake{})

	require.NoError(t, handler.process(context.Background(), job.ID))

	require.Equal(t, []string{"endpoint-video"}, provider.submittedEndpoints)
	require.Zero(t, store.intermediateCalls)
	// It is the job's first provider call, so it claims a queued job rather
	// than going through the second-phase transition.
	require.Equal(t, 1, store.markRunningCalls)
	require.Zero(t, store.secondPhaseCalls)
	require.Equal(t, 1, store.completeCalls)
}

func TestSingleImageJobStillRunsOnePhase(t *testing.T) {
	job := newSceneVideoJob()
	job.Kind = models.OmniChatMediaKindImage
	job.DurationSeconds = 0
	job.AspectRatio = "4:5"
	store := &twoPhaseStoreFake{job: job}
	provider := &twoPhaseProviderFake{}
	storage := &twoPhaseStorageFake{}
	handler := newTwoPhaseHandler(t, store, provider, storage)

	require.NoError(t, handler.process(context.Background(), job.ID))

	require.Equal(t, []string{"endpoint-image"}, provider.submittedEndpoints)
	require.Zero(t, store.intermediateCalls)
	require.Equal(t, 1, store.completeCalls)
	require.Len(t, storage.uploads, 1)
}

func TestRunningJobWithNoProviderRequestStillFailsPermanently(t *testing.T) {
	// A running image job that lost its provider id is corrupt, not mid-phase.
	// Treating it as an animation phase would leave it running forever instead
	// of failing it and refunding the reservation.
	job := newSceneVideoJob()
	job.Kind = models.OmniChatMediaKindImage
	job.DurationSeconds = 0
	job.Status = models.OmniChatGenerationStatusRunning
	job.ProviderJobID = ""
	store := &twoPhaseStoreFake{job: job}
	provider := &twoPhaseProviderFake{}
	handler := newTwoPhaseHandler(t, store, provider, &twoPhaseStorageFake{})

	err := handler.process(context.Background(), job.ID)

	var permanent *permanentGenerationError
	require.ErrorAs(t, err, &permanent)
	require.Equal(t, "provider_state_invalid", permanent.code)
	require.Empty(t, provider.submittedEndpoints)
}

// failingVideoProviderFake renders the still, then fails the animation.
type failingVideoProviderFake struct{ twoPhaseProviderFake }

func (f *failingVideoProviderFake) Status(ctx context.Context, endpointID, jobID string) (*runpod.StatusResponse, error) {
	if endpointID == "endpoint-video" {
		return &runpod.StatusResponse{Status: runpod.StatusFailed}, nil
	}
	return f.twoPhaseProviderFake.Status(ctx, endpointID, jobID)
}

func TestFailedAnimationDiscardsTheStillItWasRefundedFor(t *testing.T) {
	// The whole reservation is refunded when the clip fails, so keeping the
	// still would hand out an unpaid gallery image and charge it against the
	// owner's storage quota.
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	provider := &failingVideoProviderFake{}
	handler := newTwoPhaseHandler(t, store, &provider.twoPhaseProviderFake, &twoPhaseStorageFake{})
	handler.provider = provider

	err := handler.process(context.Background(), store.job.ID)

	var permanent *permanentGenerationError
	require.ErrorAs(t, err, &permanent)
	require.Equal(t, "provider_failed", permanent.code)
	require.Equal(t, 1, store.intermediateCalls, "the still was rendered")

	// Handle is what records terminal state; process only reports the failure.
	require.NoError(t, handler.recordGenerationFailure(context.Background(), store.job.ID, permanent.code))
	require.Len(t, store.deletedAssets, 1, "the intermediate still must not outlive the job it belonged to")
	require.Nil(t, store.job.SourceAssetID)
}

func TestCancellationDiscardsTheStill(t *testing.T) {
	store := &twoPhaseStoreFake{job: newSceneVideoJob()}
	handler := newTwoPhaseHandler(t, store, &twoPhaseProviderFake{}, &twoPhaseStorageFake{})

	// Land the still, then cancel before the animation starts.
	references, _, err := handler.resolveInputs(context.Background(), store.job)
	require.NoError(t, err)
	_, _, err = handler.renderVideoSourceStill(context.Background(), store.job, references)
	require.NoError(t, err)
	require.NotNil(t, store.job.SourceAssetID)

	store.job.Status = models.OmniChatGenerationStatusCancelled
	cancelled, err := handler.stopIfGenerationCancelled(context.Background(), store.job.ID, "endpoint-video", "")
	require.NoError(t, err)
	require.True(t, cancelled)
	require.Len(t, store.deletedAssets, 1)
}

func TestAUserChosenSourceAssetSurvivesAFailedAnimation(t *testing.T) {
	// A Create-page request animates an image the user already owns and picked
	// from their gallery. Deleting that on failure would destroy their asset.
	sourceID := uuid.New()
	job := newSceneVideoJob()
	job.Mode = models.OmniChatGenerationModeImageToVideo
	job.SourceAssetID = &sourceID
	job.Status = models.OmniChatGenerationStatusFailed
	store := &twoPhaseStoreFake{
		job: job,
		sourceAsset: &models.OmniChatMediaAsset{
			ID: sourceID, OwnerUserID: job.OwnerUserID, Kind: models.OmniChatMediaKindImage,
			ScanStatus: models.MediaScanStatusClean, StoragePath: "omnichat/uploads/41/chosen.png",
		},
	}
	handler := newTwoPhaseHandler(t, store, &twoPhaseProviderFake{}, &twoPhaseStorageFake{})

	require.NoError(t, handler.recordGenerationFailure(context.Background(), job.ID, "provider_failed"))

	require.Empty(t, store.deletedAssets, "a gallery asset the user chose must never be deleted by a failed job")
	require.NotNil(t, store.job.SourceAssetID)
}

func TestASucceededJobKeepsItsStill(t *testing.T) {
	// The still is a legitimate gallery artifact of a job that produced its
	// clip; only an unfinished job's still is discarded.
	job := newSceneVideoJob()
	sourceID := uuid.New()
	job.Status = models.OmniChatGenerationStatusSucceeded
	job.SourceAssetID = &sourceID
	store := &twoPhaseStoreFake{
		job:         job,
		sourceAsset: &models.OmniChatMediaAsset{ID: sourceID, OwnerUserID: job.OwnerUserID},
	}
	handler := newTwoPhaseHandler(t, store, &twoPhaseProviderFake{}, &twoPhaseStorageFake{})

	require.NoError(t, handler.recordGenerationFailure(context.Background(), job.ID, "provider_failed"))

	require.Empty(t, store.deletedAssets)
}

func (f *twoPhaseStoreFake) AttachLikenessCandidate(context.Context, uuid.UUID, *models.MediaFile, int64, int64, models.OmniChatGenerationProvenance) (*models.OmniChatOmniAILikenessCandidate, error) {
	return nil, errors.New("not expected")
}

func (f *twoPhaseStoreFake) AttachLikenessReference(context.Context, uuid.UUID, *models.MediaFile, int64, int64, models.OmniChatGenerationProvenance) error {
	return errors.New("not expected")
}
