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
	"github.com/omninudge/backend/internal/services/runpod"
	"github.com/stretchr/testify/require"
)

type cancelledGenerationStoreFake struct{ job *models.OmniChatGenerationJob }

func (f *cancelledGenerationStoreFake) GetGenerationJobForProcessing(context.Context, uuid.UUID) (*models.OmniChatGenerationJob, error) {
	return f.job, nil
}
func (*cancelledGenerationStoreFake) GetMediaAssetOwned(context.Context, uuid.UUID, int) (*models.OmniChatMediaAsset, error) {
	return nil, nil
}
func (*cancelledGenerationStoreFake) DeleteMediaAssetOwned(context.Context, uuid.UUID, int) (bool, error) {
	return false, nil
}
func (*cancelledGenerationStoreFake) MarkGenerationJobRunning(context.Context, uuid.UUID, string) (bool, error) {
	return false, nil
}
func (*cancelledGenerationStoreFake) UpdateGenerationProgress(context.Context, uuid.UUID, int) error {
	return nil
}
func (*cancelledGenerationStoreFake) MarkGenerationJobFailed(context.Context, uuid.UUID, string, string) (bool, error) {
	return true, nil
}
func (*cancelledGenerationStoreFake) CompleteGenerationJob(context.Context, uuid.UUID, *models.MediaFile, *models.OmniChatMediaAsset, int64, int64, models.OmniChatGenerationProvenance) error {
	return nil
}
func (*cancelledGenerationStoreFake) StartGenerationSecondPhase(context.Context, uuid.UUID, string) (bool, error) {
	return false, nil
}
func (*cancelledGenerationStoreFake) AttachIntermediateAsset(context.Context, uuid.UUID, *models.MediaFile, *models.OmniChatMediaAsset, models.OmniChatMediaKind, int64, int64, models.OmniChatGenerationProvenance) error {
	return nil
}

type cancellableRunPodFake struct{ cancelCalls int }

func (*cancellableRunPodFake) Submit(context.Context, string, any) (string, error) { return "", nil }
func (*cancellableRunPodFake) Status(context.Context, string, string) (*runpod.StatusResponse, error) {
	return &runpod.StatusResponse{Status: runpod.StatusInProgress}, nil
}
func (*cancellableRunPodFake) Result(context.Context, string, string) (*runpod.Result, error) {
	return nil, nil
}
func (f *cancellableRunPodFake) Cancel(context.Context, string, string) error {
	f.cancelCalls++
	return nil
}

type generationBillingFake struct {
	refundUserID      int
	refundOperationID uuid.UUID
	refundCalls       int
	refundContextErr  error
	refundErr         error
}

func (*generationBillingFake) CaptureOwned(context.Context, int, uuid.UUID) error { return nil }
func (f *generationBillingFake) RefundOwned(ctx context.Context, userID int, operationID uuid.UUID) error {
	f.refundUserID = userID
	f.refundOperationID = operationID
	f.refundCalls++
	f.refundContextErr = ctx.Err()
	return f.refundErr
}

type generationClaimStoreFake struct {
	job           *models.OmniChatGenerationJob
	markResult    bool
	markErr       error
	failureCode   string
	failureText   string
	failureCtxErr error
}

func (f *generationClaimStoreFake) GetGenerationJobForProcessing(context.Context, uuid.UUID) (*models.OmniChatGenerationJob, error) {
	return f.job, nil
}
func (*generationClaimStoreFake) GetMediaAssetOwned(context.Context, uuid.UUID, int) (*models.OmniChatMediaAsset, error) {
	return nil, nil
}
func (*generationClaimStoreFake) DeleteMediaAssetOwned(context.Context, uuid.UUID, int) (bool, error) {
	return false, nil
}
func (f *generationClaimStoreFake) MarkGenerationJobRunning(context.Context, uuid.UUID, string) (bool, error) {
	return f.markResult, f.markErr
}
func (*generationClaimStoreFake) UpdateGenerationProgress(context.Context, uuid.UUID, int) error {
	return nil
}
func (f *generationClaimStoreFake) MarkGenerationJobFailed(ctx context.Context, _ uuid.UUID, code, detail string) (bool, error) {
	f.failureCode = code
	f.failureText = detail
	f.failureCtxErr = ctx.Err()
	return f.markErr == nil, f.markErr
}
func (*generationClaimStoreFake) CompleteGenerationJob(context.Context, uuid.UUID, *models.MediaFile, *models.OmniChatMediaAsset, int64, int64, models.OmniChatGenerationProvenance) error {
	return nil
}
func (*generationClaimStoreFake) StartGenerationSecondPhase(context.Context, uuid.UUID, string) (bool, error) {
	return false, nil
}
func (*generationClaimStoreFake) AttachIntermediateAsset(context.Context, uuid.UUID, *models.MediaFile, *models.OmniChatMediaAsset, models.OmniChatMediaKind, int64, int64, models.OmniChatGenerationProvenance) error {
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
		&submittingRunPodFake{}, omniChatMediaTestConfig(), false,
	)
	job := &models.OmniChatGenerationJob{OwnerUserID: 29, PersonaID: 17}

	_, _, err := handler.resolveInputs(context.Background(), job)

	var permanent *permanentGenerationError
	require.ErrorAs(t, err, &permanent)
	require.Equal(t, "persona_not_found", permanent.code)
	require.NotNil(t, reader.viewer)
	require.Equal(t, 29, *reader.viewer)
}

func TestResolveInputsAcceptsConfiguredExternalPersonaMediaURL(t *testing.T) {
	avatar := "https://app.example.test/omnichat/avatars/sadie.png"
	reader := &generationPersonaReaderFake{persona: &models.BotPersona{AvatarURL: &avatar}}
	cfg := omniChatMediaTestConfig()
	cfg.RunPodWorkerBackendURL = "https://app.example.test"
	handler := NewOmniChatGenerationHandler(
		&generationClaimStoreFake{}, reader, &unusedGenerationStorageFake{}, nil,
		&submittingRunPodFake{}, cfg, false,
	)

	references, _, err := handler.resolveInputs(context.Background(), &models.OmniChatGenerationJob{OwnerUserID: 29, PersonaID: 17})
	require.NoError(t, err)
	require.Equal(t, []string{avatar}, references)
}

type generationMediaReferenceFake struct {
	media *models.MediaFile
}

func (f *generationMediaReferenceFake) GetByPublicURL(context.Context, string) (*models.MediaFile, error) {
	return nil, nil
}

func (f *generationMediaReferenceFake) FindByStoragePath(context.Context, string) (*models.MediaFile, error) {
	return f.media, nil
}

type signedGenerationStorageFake struct {
	unusedGenerationStorageFake
	key     string
	signErr error
}

func (f *signedGenerationStorageFake) GetSignedURL(_ context.Context, key string, _ time.Duration) (string, error) {
	f.key = key
	if f.signErr != nil {
		return "", f.signErr
	}
	return "https://storage.example.test/signed-sadie.png?token=one", nil
}

func TestResolveInputsSignsPrivatePersonaUploadForRunPod(t *testing.T) {
	avatar := "/uploads/7/sadie.png"
	reader := &generationPersonaReaderFake{persona: &models.BotPersona{AvatarURL: &avatar}}
	mediaReader := &generationMediaReferenceFake{media: &models.MediaFile{
		StoragePath:      "uploads/7/sadie.png",
		StorageObjectKey: "7/sadie.png",
		FileType:         "image/png",
		ScanStatus:       models.MediaScanStatusClean,
	}}
	storage := &signedGenerationStorageFake{}
	handler := NewOmniChatGenerationHandler(
		&generationClaimStoreFake{}, reader, storage, nil,
		&submittingRunPodFake{}, omniChatMediaTestConfig(), false,
	).SetMediaReferenceReader(mediaReader)

	references, _, err := handler.resolveInputs(context.Background(), &models.OmniChatGenerationJob{OwnerUserID: 29, PersonaID: 17})
	require.NoError(t, err)
	require.Equal(t, []string{"https://storage.example.test/signed-sadie.png?token=one"}, references)
	require.Equal(t, "7/sadie.png", storage.key)
}

func TestResolveInputsUsesSignedReferenceForPlatformPersonaUpload(t *testing.T) {
	avatar := "/uploads/7/sadie.png"
	reader := &generationPersonaReaderFake{persona: &models.BotPersona{AvatarURL: &avatar}}
	mediaReader := &generationMediaReferenceFake{media: &models.MediaFile{
		StoragePath:      "uploads/7/sadie.png",
		StorageObjectKey: "7/sadie.png",
		StorageURL:       "https://cdn.example.test/7/sadie.png",
		FileType:         "image/png",
		ScanStatus:       models.MediaScanStatusClean,
	}}
	storage := &signedGenerationStorageFake{}
	handler := NewOmniChatGenerationHandler(
		&generationClaimStoreFake{}, reader, storage, nil,
		&submittingRunPodFake{}, omniChatMediaTestConfig(), false,
	).SetMediaReferenceReader(mediaReader)

	references, _, err := handler.resolveInputs(context.Background(), &models.OmniChatGenerationJob{OwnerUserID: 29, PersonaID: 17})
	require.NoError(t, err)
	require.Equal(t, []string{"https://storage.example.test/signed-sadie.png?token=one"}, references)
	require.Equal(t, "7/sadie.png", storage.key)
}

func TestResolveInputsUsesPlatformCDNFallbackWhenSigningFails(t *testing.T) {
	avatar := "/uploads/7/sadie.png"
	reader := &generationPersonaReaderFake{persona: &models.BotPersona{AvatarURL: &avatar}}
	mediaReader := &generationMediaReferenceFake{media: &models.MediaFile{
		StoragePath:      "uploads/7/sadie.png",
		StorageObjectKey: "7/sadie.png",
		StorageURL:       "https://cdn.example.test/7/sadie.png",
		FileType:         "image/png",
		ScanStatus:       models.MediaScanStatusClean,
	}}
	storage := &signedGenerationStorageFake{signErr: errors.New("temporary signing failure")}
	handler := NewOmniChatGenerationHandler(
		&generationClaimStoreFake{}, reader, storage, nil,
		&submittingRunPodFake{}, omniChatMediaTestConfig(), false,
	).SetMediaReferenceReader(mediaReader)

	references, _, err := handler.resolveInputs(context.Background(), &models.OmniChatGenerationJob{OwnerUserID: 29, PersonaID: 17})
	require.NoError(t, err)
	require.Equal(t, []string{"https://cdn.example.test/7/sadie.png"}, references)
	require.Equal(t, "7/sadie.png", storage.key)
}

func TestResolveInputsDoesNotUsePlatformCDNFallbackForUserPersona(t *testing.T) {
	avatar := "/uploads/7/sadie.png"
	ownerID := 29
	reader := &generationPersonaReaderFake{persona: &models.BotPersona{OwnerUserID: &ownerID, AvatarURL: &avatar}}
	mediaReader := &generationMediaReferenceFake{media: &models.MediaFile{
		StoragePath:      "uploads/7/sadie.png",
		StorageObjectKey: "7/sadie.png",
		StorageURL:       "https://cdn.example.test/7/sadie.png",
		FileType:         "image/png",
		ScanStatus:       models.MediaScanStatusClean,
	}}
	storage := &signedGenerationStorageFake{signErr: errors.New("temporary signing failure")}
	handler := NewOmniChatGenerationHandler(
		&generationClaimStoreFake{}, reader, storage, nil,
		&submittingRunPodFake{}, omniChatMediaTestConfig(), false,
	).SetMediaReferenceReader(mediaReader)

	_, _, err := handler.resolveInputs(context.Background(), &models.OmniChatGenerationJob{OwnerUserID: ownerID, PersonaID: 17})
	require.Error(t, err)
	require.ErrorContains(t, err, "temporary signing failure")
}

func TestResolveInputsKeepsUserPersonaUploadSigned(t *testing.T) {
	avatar := "/uploads/7/sadie.png"
	ownerID := 29
	reader := &generationPersonaReaderFake{persona: &models.BotPersona{OwnerUserID: &ownerID, AvatarURL: &avatar}}
	mediaReader := &generationMediaReferenceFake{media: &models.MediaFile{
		StoragePath:      "uploads/7/sadie.png",
		StorageObjectKey: "7/sadie.png",
		StorageURL:       "https://cdn.example.test/7/sadie.png",
		FileType:         "image/png",
		ScanStatus:       models.MediaScanStatusClean,
	}}
	storage := &signedGenerationStorageFake{}
	handler := NewOmniChatGenerationHandler(
		&generationClaimStoreFake{}, reader, storage, nil,
		&submittingRunPodFake{}, omniChatMediaTestConfig(), false,
	).SetMediaReferenceReader(mediaReader)

	references, _, err := handler.resolveInputs(context.Background(), &models.OmniChatGenerationJob{OwnerUserID: ownerID, PersonaID: 17})
	require.NoError(t, err)
	require.Equal(t, []string{"https://storage.example.test/signed-sadie.png?token=one"}, references)
	require.Equal(t, "7/sadie.png", storage.key)
}

func TestResolveInputsFailsWhenPersonaUploadCannotBeResolved(t *testing.T) {
	avatar := "/uploads/personas/missing.png"
	reader := &generationPersonaReaderFake{persona: &models.BotPersona{AvatarURL: &avatar}}
	mediaReader := &generationMediaReferenceFake{}
	handler := NewOmniChatGenerationHandler(
		&generationClaimStoreFake{}, reader, &unusedGenerationStorageFake{}, nil,
		&submittingRunPodFake{}, omniChatMediaTestConfig(), false,
	).SetMediaReferenceReader(mediaReader)

	_, _, err := handler.resolveInputs(context.Background(), &models.OmniChatGenerationJob{OwnerUserID: 29, PersonaID: 17})
	var permanent *permanentGenerationError
	require.ErrorAs(t, err, &permanent)
	require.Equal(t, "persona_reference_unavailable", permanent.code)
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

type submittingRunPodFake struct {
	cancellableRunPodFake
	submitCalls int
}

func (f *submittingRunPodFake) Submit(context.Context, string, any) (string, error) {
	f.submitCalls++
	return "provider-job", nil
}

type resultErrorRunPodFake struct{ resultErr error }

func (*resultErrorRunPodFake) Submit(context.Context, string, any) (string, error) {
	return "provider-job", nil
}
func (*resultErrorRunPodFake) Status(context.Context, string, string) (*runpod.StatusResponse, error) {
	return &runpod.StatusResponse{Status: runpod.StatusCompleted}, nil
}
func (f *resultErrorRunPodFake) Result(context.Context, string, string) (*runpod.Result, error) {
	return nil, f.resultErr
}
func (*resultErrorRunPodFake) Cancel(context.Context, string, string) error { return nil }

func newGenerationClaimTestHandler(store *generationClaimStoreFake, provider *submittingRunPodFake) *OmniChatGenerationHandler {
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
		RunPodImageEndpointID: "endpoint-image",
		RunPodVideoEndpointID: "endpoint-video",
	}
}

func TestBuildImageSpecUsesCharacterReferenceForImage(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindImage,
		Mode:            models.OmniChatGenerationModeContextual,
		EffectivePrompt: "Sadie at the park",
		AspectRatio:     "4:5",
		Scene: models.OmniChatSceneState{
			Location:     "the park",
			Activity:     "walking beside the user",
			RecentEvents: []string{"Character: *I step closer.*", "User: *I take her hand.*"},
		},
	}
	spec, err := BuildImageSpec(omniChatMediaTestConfig(), job, []string{"https://cdn.example.test/sadie.png"})

	require.NoError(t, err)
	require.Equal(t, "endpoint-image", spec.EndpointID)
	require.Equal(t, []string{"https://cdn.example.test/sadie.png"}, spec.Input["reference_image_urls"])
	require.Equal(t, "4:5", spec.Input["aspect_ratio"])
	require.Equal(t, "image", spec.Input["kind"])
	require.Equal(t, "reference", spec.Input["identity_mode"])
	require.Equal(t, "ip_adapter", spec.Input["identity_adapter"])
	require.Equal(t, job.Scene, spec.Input["scene"])
}

func TestBuildImageSpecIncludesValidatedLoRAProfile(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindImage,
		EffectivePrompt: "Sadie at the park",
		IdentityProfile: models.OmniChatMediaIdentityProfile{
			Mode:           models.OmniChatMediaIdentityModeLoRA,
			Adapter:        models.OmniChatMediaIdentityAdapterIPAdapter,
			AdapterScale:   0.7,
			ReferenceLimit: 2,
			LoraModelID:    "nickf579/sadie-lora",
			LoraWeightName: "weights.safetensors",
			LoraScale:      0.9,
		},
	}
	spec, err := BuildImageSpec(omniChatMediaTestConfig(), job, []string{
		"https://cdn.example.test/avatar.png", "https://cdn.example.test/park.png", "https://cdn.example.test/extra.png",
	})
	require.NoError(t, err)
	require.Equal(t, "lora", spec.Input["identity_mode"])
	require.Equal(t, "nickf579/sadie-lora", spec.Input["lora_model_id"])
	require.Equal(t, []string{"https://cdn.example.test/avatar.png", "https://cdn.example.test/park.png"}, spec.Input["reference_image_urls"])
}

func TestBuildImageSpecRendersTheStillForAVideoJob(t *testing.T) {
	// The first phase of a video job goes through the image endpoint with the
	// same scene, references and identity profile a Scene photo would get.
	// That is what gives the clip its likeness and setting.
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeContextual,
		EffectivePrompt: "Sadie standing in the park",
		AspectRatio:     "16:9",
		DurationSeconds: 5,
		Scene:           models.OmniChatSceneState{Location: "the park"},
	}
	spec, err := BuildImageSpec(omniChatMediaTestConfig(), job, []string{"https://cdn.example.test/sadie.png"})

	require.NoError(t, err)
	require.Equal(t, "endpoint-image", spec.EndpointID)
	require.Equal(t, "image", spec.Input["kind"])
	require.Equal(t, []string{"https://cdn.example.test/sadie.png"}, spec.Input["reference_image_urls"])
	require.Equal(t, "16:9", spec.Input["aspect_ratio"])
	// duration_seconds is only valid for video and the worker rejects it here.
	require.NotContains(t, spec.Input, "duration_seconds")
}

func TestBuildImageSpecRoutesEntitledJobsToTheNSFWEndpoint(t *testing.T) {
	cfg := omniChatMediaTestConfig()
	cfg.RunPodNSFWImageEndpointID = "endpoint-image-nsfw"
	job := &models.OmniChatGenerationJob{Kind: models.OmniChatMediaKindImage, EffectivePrompt: "A portrait"}

	spec, err := BuildImageSpec(cfg, job, nil)
	require.NoError(t, err)
	require.Equal(t, "endpoint-image", spec.EndpointID)

	job.AllowNSFW = true
	spec, err = BuildImageSpec(cfg, job, nil)
	require.NoError(t, err)
	require.Equal(t, "endpoint-image-nsfw", spec.EndpointID)
}

func TestBuildImageSpecFallsBackWhenNoNSFWEndpointIsConfigured(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind: models.OmniChatMediaKindImage, EffectivePrompt: "A portrait", AllowNSFW: true,
	}
	spec, err := BuildImageSpec(omniChatMediaTestConfig(), job, nil)
	require.NoError(t, err)
	require.Equal(t, "endpoint-image", spec.EndpointID)
}

func TestBuildVideoSpecAnimatesTheRenderedStill(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeImageToVideo,
		Prompt:          "She turns and waves",
		NegativePrompt:  "distorted hands",
		AspectRatio:     "9:16",
		DurationSeconds: 7,
	}
	spec, err := BuildVideoSpec(omniChatMediaTestConfig(), job, "https://signed.example.test/source.png")

	require.NoError(t, err)
	require.Equal(t, "endpoint-video", spec.EndpointID)
	require.Equal(t, "https://signed.example.test/source.png", spec.Input["source_image_url"])
	require.Equal(t, 7, spec.Input["duration_seconds"])
	require.Equal(t, "video", spec.Input["kind"])
	require.Equal(t, "image_to_video", spec.Input["mode"])
	require.Equal(t, "She turns and waves", spec.Input["prompt"])
}

func TestBuildVideoSpecSendsMotionOnlyForASceneClip(t *testing.T) {
	// The still already carries appearance and setting. Sending them again
	// gives the video model something to contradict, which reads as drift.
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeContextual,
		Prompt:          "show me the scene",
		EffectivePrompt: "A long image prompt describing her freckles, the rain, and the neon sign",
		DurationSeconds: 5,
		Scene:           models.OmniChatSceneState{Activity: "leaning on the railing", Mood: "playful"},
	}
	spec, err := BuildVideoSpec(omniChatMediaTestConfig(), job, "https://signed.example.test/source.png")

	require.NoError(t, err)
	prompt, _ := spec.Input["prompt"].(string)
	require.Contains(t, prompt, "leaning on the railing")
	require.Contains(t, prompt, "show me the scene")
	require.NotContains(t, prompt, "freckles")
	require.Equal(t, "image_to_video", spec.Input["mode"])
}

func TestBuildVideoSpecSendsNeitherReferencesNorAspectRatio(t *testing.T) {
	// References are how the old worker ended up animating the avatar photo in
	// the avatar's own setting. The frame comes from the still's dimensions,
	// so an aspect ratio here could only contradict it.
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeImageToVideo,
		Prompt:          "She waves",
		AspectRatio:     "4:5",
		DurationSeconds: 5,
	}
	spec, err := BuildVideoSpec(omniChatMediaTestConfig(), job, "https://signed.example.test/source.png")

	require.NoError(t, err)
	require.NotContains(t, spec.Input, "reference_image_urls")
	require.NotContains(t, spec.Input, "aspect_ratio")
	require.NotContains(t, spec.Input, "identity_mode")
	require.NotContains(t, spec.Input, "scene")
	// The worker never read this. Sending it invited exactly the kind of
	// silent drift the worker_build stamp exists to catch.
	require.NotContains(t, spec.Input, "resolution")
}

func TestBuildVideoSpecRequiresSourceURL(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind:   models.OmniChatMediaKindVideo,
		Mode:   models.OmniChatGenerationModeImageToVideo,
		Prompt: "Wave",
	}
	_, err := BuildVideoSpec(omniChatMediaTestConfig(), job, "")
	require.EqualError(t, err, "image-to-video source is unavailable")
}

func TestBuildImageSpecRequiresConfiguredEndpoint(t *testing.T) {
	job := &models.OmniChatGenerationJob{
		Kind:            models.OmniChatMediaKindImage,
		EffectivePrompt: "A portrait",
	}
	_, err := BuildImageSpec(config.OmniChatMediaConfig{}, job, nil)
	require.ErrorIs(t, err, runpod.ErrEndpointNotConfigured)
}

func TestBuildSpecsRejectUnsafeProviderReferences(t *testing.T) {
	imageJob := &models.OmniChatGenerationJob{
		Kind: models.OmniChatMediaKindImage, EffectivePrompt: "A portrait",
	}
	_, err := BuildImageSpec(omniChatMediaTestConfig(), imageJob, []string{"http://127.0.0.1/private.png"})
	require.EqualError(t, err, "provider reference image URL is invalid")

	videoJob := &models.OmniChatGenerationJob{
		Kind: models.OmniChatMediaKindVideo, Mode: models.OmniChatGenerationModeImageToVideo,
		Prompt: "Wave",
	}
	_, err = BuildVideoSpec(omniChatMediaTestConfig(), videoJob, "https://public.example.test:8443/source.png")
	require.EqualError(t, err, "provider source image URL is invalid")
}

func TestOmniChatGenerationHandlerStopsProviderWorkWhenJobIsCancelled(t *testing.T) {
	provider := &cancellableRunPodFake{}
	jobID := uuid.New()
	operationID := uuid.New()
	billing := &generationBillingFake{}
	handler := &OmniChatGenerationHandler{
		jobs: &cancelledGenerationStoreFake{job: &models.OmniChatGenerationJob{
			ID: jobID, OwnerUserID: 41, Status: models.OmniChatGenerationStatusCancelled,
			BillingOperationID: &operationID,
		}},
		provider: provider,
		billing:  billing,
	}

	cancelled, err := handler.stopIfGenerationCancelled(context.Background(), jobID, "endpoint-image", "provider-job")
	require.NoError(t, err)
	require.True(t, cancelled)
	require.Equal(t, 1, provider.cancelCalls)
	require.Equal(t, 1, billing.refundCalls)
	require.Equal(t, 41, billing.refundUserID)
	require.Equal(t, operationID, billing.refundOperationID)
	require.NoError(t, billing.refundContextErr)
}

func TestOmniChatGenerationHandlerSurfacesCancellationRefundFailure(t *testing.T) {
	operationID := uuid.New()
	refundErr := errors.New("wallet unavailable")
	handler := &OmniChatGenerationHandler{
		jobs: &cancelledGenerationStoreFake{job: &models.OmniChatGenerationJob{
			ID: uuid.New(), OwnerUserID: 41, Status: models.OmniChatGenerationStatusCancelled,
			BillingOperationID: &operationID,
		}},
		provider: &cancellableRunPodFake{},
		billing:  &generationBillingFake{refundErr: refundErr},
	}

	cancelled, err := handler.stopIfGenerationCancelled(context.Background(), handler.jobs.(*cancelledGenerationStoreFake).job.ID, "endpoint-image", "provider-job")
	require.True(t, cancelled)
	require.ErrorIs(t, err, refundErr)
}

func TestOmniChatGenerationHandlerStopsProviderWorkWhenReconciliationFailsJob(t *testing.T) {
	provider := &cancellableRunPodFake{}
	jobID := uuid.New()
	operationID := uuid.New()
	billing := &generationBillingFake{}
	handler := &OmniChatGenerationHandler{
		jobs: &cancelledGenerationStoreFake{job: &models.OmniChatGenerationJob{
			ID: jobID, OwnerUserID: 41, Status: models.OmniChatGenerationStatusFailed,
			BillingOperationID: &operationID,
		}},
		provider: provider,
		billing:  billing,
	}

	stopped, err := handler.stopIfGenerationCancelled(
		context.Background(),
		jobID,
		"endpoint-image",
		"provider-job",
	)
	require.NoError(t, err)
	require.True(t, stopped)
	require.Equal(t, 1, provider.cancelCalls)
	require.Equal(t, 1, billing.refundCalls)
	require.Equal(t, operationID, billing.refundOperationID)
}

func TestOmniChatGenerationHandlerCancelsSubmittedWorkWhenClaimLosesRace(t *testing.T) {
	provider := &submittingRunPodFake{}
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
	provider := &submittingRunPodFake{}
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

func TestOmniChatGenerationHandlerMapsTerminalResultErrorsToPermanentFailures(t *testing.T) {
	for _, test := range []struct {
		name string
		err  error
		code string
	}{
		{name: "failed", err: runpod.ErrJobFailed, code: "provider_failed"},
		{name: "cancelled", err: runpod.ErrJobCancelled, code: "provider_cancelled"},
		{name: "timed out", err: runpod.ErrJobTimedOut, code: "provider_timed_out"},
	} {
		t.Run(test.name, func(t *testing.T) {
			job := &models.OmniChatGenerationJob{
				ID: uuid.New(), PersonaID: 42, Kind: models.OmniChatMediaKindImage,
				Mode: models.OmniChatGenerationModeCreate, Status: models.OmniChatGenerationStatusRunning,
				ProviderJobID: "provider-job", EffectivePrompt: "Sadie at the park",
			}
			handler := NewOmniChatGenerationHandler(
				&generationClaimStoreFake{job: job}, &generationPersonaReaderFake{}, &unusedGenerationStorageFake{}, nil,
				&resultErrorRunPodFake{resultErr: test.err}, omniChatMediaTestConfig(), false,
			)

			err := handler.process(context.Background(), job.ID)
			var permanent *permanentGenerationError
			require.ErrorAs(t, err, &permanent)
			require.Equal(t, test.code, permanent.code)
		})
	}
}

func TestOmniChatGenerationHandlerCancelsRunPodJobWhenRequestDeadlineExpires(t *testing.T) {
	provider := &submittingRunPodFake{}
	job := &models.OmniChatGenerationJob{
		ID: uuid.New(), PersonaID: 42, Kind: models.OmniChatMediaKindImage,
		Mode: models.OmniChatGenerationModeCreate, Status: models.OmniChatGenerationStatusQueued,
		EffectivePrompt: "Sadie at the park",
	}
	store := &generationClaimStoreFake{job: job, markResult: true}
	cfg := omniChatMediaTestConfig()
	cfg.RunPodRequestTimeoutSeconds = 1
	cfg.PollIntervalSeconds = 1
	handler := NewOmniChatGenerationHandler(store, &generationPersonaReaderFake{}, &unusedGenerationStorageFake{}, nil, provider, cfg, false)

	err := handler.process(context.Background(), job.ID)

	require.ErrorIs(t, err, context.DeadlineExceeded)
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

func TestOmniChatGenerationHandlerRecordsFailureWithIndependentContextAndSafeDetail(t *testing.T) {
	store := &generationClaimStoreFake{}
	handler := &OmniChatGenerationHandler{jobs: store}
	requestContext, cancel := context.WithCancel(context.Background())
	cancel()

	err := handler.recordGenerationFailure(requestContext, uuid.New(), "provider_result_invalid")

	require.NoError(t, err)
	require.Equal(t, "provider_result_invalid", store.failureCode)
	require.Equal(t, "generation failed", store.failureText)
	require.NoError(t, store.failureCtxErr)
}

func TestOmniChatGenerationHandlerReturnsPersistenceErrorWhenTerminalFailureCannotBeRecorded(t *testing.T) {
	persistenceErr := errors.New("database unavailable")
	store := &generationClaimStoreFake{markErr: persistenceErr}
	handler := &OmniChatGenerationHandler{jobs: store}

	err := handler.recordGenerationFailure(context.Background(), uuid.New(), "generation_failed")

	require.ErrorIs(t, err, persistenceErr)
}

var _ services.StorageService = (*unusedGenerationStorageFake)(nil)
