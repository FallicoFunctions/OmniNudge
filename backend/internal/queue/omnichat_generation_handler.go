package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/fal"
	zlog "github.com/rs/zerolog/log"
)

type FalGenerationSpec struct {
	ModelID string
	Input   map[string]any
}

type omniChatGenerationJobStore interface {
	GetGenerationJobForProcessing(ctx context.Context, id uuid.UUID) (*models.OmniChatGenerationJob, error)
	GetMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*models.OmniChatMediaAsset, error)
	MarkGenerationJobRunning(ctx context.Context, id uuid.UUID, providerJobID string) (bool, error)
	UpdateGenerationProgress(ctx context.Context, id uuid.UUID, progress int) error
	MarkGenerationJobFailed(ctx context.Context, id uuid.UUID, safeCode, providerError string) error
	CompleteGenerationJob(ctx context.Context, jobID uuid.UUID, media *models.MediaFile, asset *models.OmniChatMediaAsset, freeTierBytes, proTierBytes int64) error
}

type omniChatPersonaReader interface {
	GetAccessibleByID(ctx context.Context, id int, viewerUserID *int) (*models.BotPersona, error)
}

type falGenerationClient interface {
	Submit(ctx context.Context, modelID string, input any) (string, error)
	Status(ctx context.Context, modelID, requestID string) (*fal.QueueStatus, error)
	Result(ctx context.Context, modelID, requestID string) (*fal.Result, error)
	Cancel(ctx context.Context, modelID, requestID string) error
}

type OmniChatGenerationHandler struct {
	jobs             omniChatGenerationJobStore
	personas         omniChatPersonaReader
	storage          services.StorageService
	scanner          services.VirusScanner
	provider         falGenerationClient
	config           config.OmniChatMediaConfig
	failClosed       bool
	storageQuotaFree int64
	storageQuotaPro  int64
}

func NewOmniChatGenerationHandler(
	jobs omniChatGenerationJobStore,
	personas omniChatPersonaReader,
	storage services.StorageService,
	scanner services.VirusScanner,
	provider falGenerationClient,
	cfg config.OmniChatMediaConfig,
	failClosed bool,
) *OmniChatGenerationHandler {
	return &OmniChatGenerationHandler{
		jobs: jobs, personas: personas, storage: storage, scanner: scanner,
		provider: provider, config: cfg, failClosed: failClosed,
		storageQuotaFree: 1 << 30, storageQuotaPro: 50 << 30,
	}
}

func (h *OmniChatGenerationHandler) SetStorageQuotas(freeTierBytes, proTierBytes int64) *OmniChatGenerationHandler {
	if freeTierBytes > 0 && proTierBytes >= freeTierBytes {
		h.storageQuotaFree = freeTierBytes
		h.storageQuotaPro = proTierBytes
	}
	return h
}

type permanentGenerationError struct {
	code string
	err  error
}

func (e *permanentGenerationError) Error() string { return e.err.Error() }
func (e *permanentGenerationError) Unwrap() error { return e.err }

func permanentGenerationFailure(code string, err error) error {
	return &permanentGenerationError{code: code, err: err}
}

func (h *OmniChatGenerationHandler) Handle(ctx context.Context, task *asynq.Task) error {
	var payload OmniChatGenerationPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("decode omnichat generation payload: %v: %w", err, asynq.SkipRetry)
	}
	jobID, err := uuid.Parse(payload.JobID)
	if err != nil {
		return fmt.Errorf("invalid omnichat generation job id: %w", asynq.SkipRetry)
	}
	err = h.process(ctx, jobID)
	if err == nil {
		return nil
	}
	var permanent *permanentGenerationError
	if errors.As(err, &permanent) {
		_ = h.jobs.MarkGenerationJobFailed(ctx, jobID, permanent.code, permanent.Error())
		return fmt.Errorf("%w: %v", asynq.SkipRetry, err)
	}
	retryCount, _ := asynq.GetRetryCount(ctx)
	maxRetry, _ := asynq.GetMaxRetry(ctx)
	if maxRetry > 0 && retryCount >= maxRetry {
		_ = h.jobs.MarkGenerationJobFailed(ctx, jobID, "generation_failed", err.Error())
		return fmt.Errorf("%w: generation retries exhausted", asynq.SkipRetry)
	}
	return err
}

func (h *OmniChatGenerationHandler) process(ctx context.Context, jobID uuid.UUID) error {
	if h.jobs == nil || h.personas == nil || h.storage == nil || h.provider == nil {
		return permanentGenerationFailure("provider_unavailable", errors.New("generation dependencies are not configured"))
	}
	job, err := h.jobs.GetGenerationJobForProcessing(ctx, jobID)
	if err != nil {
		return fmt.Errorf("load generation job: %w", err)
	}
	if job == nil {
		return permanentGenerationFailure("job_not_found", errors.New("generation job not found"))
	}
	if job.Status == models.OmniChatGenerationStatusSucceeded || job.Status == models.OmniChatGenerationStatusCancelled || job.Status == models.OmniChatGenerationStatusFailed {
		return nil
	}

	references, sourceURL, err := h.resolveInputs(ctx, job)
	if err != nil {
		return err
	}
	spec, err := BuildFalGenerationSpec(h.config, job, references, sourceURL)
	if err != nil {
		return permanentGenerationFailure("invalid_provider_request", err)
	}

	providerJobID := job.ProviderJobID
	if job.Status == models.OmniChatGenerationStatusQueued {
		providerJobID, err = h.provider.Submit(ctx, spec.ModelID, spec.Input)
		if errors.Is(err, fal.ErrNotConfigured) {
			return permanentGenerationFailure("provider_unavailable", err)
		}
		if err != nil {
			return fmt.Errorf("submit generation: %w", err)
		}
		marked, err := h.jobs.MarkGenerationJobRunning(ctx, job.ID, providerJobID)
		if err != nil {
			h.cancelSubmittedGeneration(ctx, job.ID, spec.ModelID, providerJobID)
			return fmt.Errorf("mark generation running: %w", err)
		}
		if !marked {
			// A retry or concurrent worker won the database claim, or the user
			// cancelled while Submit was in flight. Its provider request is the
			// authoritative one, so discard this duplicate without retrying.
			h.cancelSubmittedGeneration(ctx, job.ID, spec.ModelID, providerJobID)
			return nil
		}
	} else if providerJobID == "" {
		return permanentGenerationFailure("provider_state_invalid", errors.New("running generation is missing provider request id"))
	}

	pollInterval := time.Duration(h.config.PollIntervalSeconds) * time.Second
	if pollInterval < time.Second || pollInterval > 30*time.Second {
		pollInterval = 2 * time.Second
	}
	progress := job.Progress
	for {
		cancelled, err := h.stopIfGenerationCancelled(ctx, job.ID, spec.ModelID, providerJobID)
		if err != nil {
			return err
		}
		if cancelled {
			return nil
		}
		status, err := h.provider.Status(ctx, spec.ModelID, providerJobID)
		if err != nil {
			return fmt.Errorf("poll generation: %w", err)
		}
		if status.Status == fal.StatusCompleted {
			break
		}
		if status.Status == fal.StatusInProgress {
			if progress < 90 {
				progress += 5
				if progress < 10 {
					progress = 10
				}
				if err := h.jobs.UpdateGenerationProgress(ctx, job.ID, progress); err != nil {
					return fmt.Errorf("update generation progress: %w", err)
				}
			}
		}
		timer := time.NewTimer(pollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	cancelled, err := h.stopIfGenerationCancelled(ctx, job.ID, spec.ModelID, providerJobID)
	if err != nil {
		return err
	}
	if cancelled {
		return nil
	}

	result, err := h.provider.Result(ctx, spec.ModelID, providerJobID)
	if err != nil {
		return fmt.Errorf("fetch generation result: %w", err)
	}
	for _, flagged := range result.HasNSFWConcepts {
		if flagged {
			return permanentGenerationFailure("safety_rejected", errors.New("generated media was rejected by the safety checker"))
		}
	}
	providerMedia, err := selectFalMediaResult(job.Kind, result)
	if err != nil {
		return permanentGenerationFailure("provider_result_invalid", err)
	}
	maxBytes := h.config.MaxImageBytes
	if job.Kind == models.OmniChatMediaKindVideo {
		maxBytes = h.config.MaxVideoBytes
	}
	download, cleanup, err := downloadGeneratedMedia(ctx, providerMedia.URL, modelsMediaKind(job.Kind), maxBytes)
	if err != nil {
		return permanentGenerationFailure("provider_result_invalid", err)
	}
	defer cleanup()
	cancelled, err = h.stopIfGenerationCancelled(ctx, job.ID, spec.ModelID, providerJobID)
	if err != nil {
		return err
	}
	if cancelled {
		return nil
	}

	if h.scanner == nil {
		if h.failClosed {
			return permanentGenerationFailure("scanner_unavailable", errors.New("virus scanner is unavailable"))
		}
	} else {
		scanResult, err := h.scanner.ScanFile(ctx, download.Path)
		if err != nil {
			if h.failClosed {
				return fmt.Errorf("scan generated media: %w", err)
			}
		} else if scanResult.Infected {
			return permanentGenerationFailure("malware_detected", errors.New("generated media failed security scanning"))
		}
	}

	file, err := os.Open(download.Path)
	if err != nil {
		return fmt.Errorf("open generated media for storage: %w", err)
	}
	defer file.Close()
	storageKey := fmt.Sprintf("omnichat/generated/%d/%s%s", job.OwnerUserID, job.ID.String(), download.Extension)
	storageURL, err := h.storage.Upload(ctx, storageKey, file, download.ContentType)
	if err != nil {
		return fmt.Errorf("store generated media: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			h.deleteGenerationObject(ctx, storageKey)
		}
	}()

	width, height := providerMedia.Width, providerMedia.Height
	media := &models.MediaFile{
		UserID: job.OwnerUserID, Filename: filepath.Base(storageKey),
		OriginalFilename: "omnichat-generated" + download.Extension,
		FileType:         download.ContentType, FileSize: download.Size,
		StorageURL: storageURL, StoragePath: storageKey,
		ScanStatus: models.MediaScanStatusClean,
	}
	if width > 0 {
		media.Width = &width
	}
	if height > 0 {
		media.Height = &height
	}
	asset := &models.OmniChatMediaAsset{Width: media.Width, Height: media.Height}
	if job.Kind == models.OmniChatMediaKindVideo {
		duration := job.DurationSeconds
		if providerMedia.Duration > 0 {
			duration = int(providerMedia.Duration + 0.5)
		}
		media.Duration = &duration
		asset.DurationSeconds = &duration
	}
	if err := h.jobs.CompleteGenerationJob(ctx, job.ID, media, asset, h.configQuotaFree(), h.configQuotaPro()); err != nil {
		if errors.Is(err, models.ErrOmniChatStorageQuotaExceeded) {
			return permanentGenerationFailure("storage_quota_exceeded", err)
		}
		return fmt.Errorf("complete generation job: %w", err)
	}
	committed = true
	return nil
}

func (h *OmniChatGenerationHandler) deleteGenerationObject(ctx context.Context, storageKey string) {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
	defer cancel()
	if err := h.storage.Delete(cleanupCtx, storageKey); err != nil {
		zlog.Warn().Err(err).Str("storage_key", storageKey).Msg("failed to delete orphaned OmniChat generation object")
	}
}

func (h *OmniChatGenerationHandler) cancelSubmittedGeneration(ctx context.Context, jobID uuid.UUID, modelID, providerJobID string) {
	if providerJobID == "" {
		return
	}
	cancelCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	if err := h.provider.Cancel(cancelCtx, modelID, providerJobID); err != nil {
		zlog.Warn().Err(err).Str("job_id", jobID.String()).Msg("failed to cancel unclaimed OmniChat provider job")
	}
}

func (h *OmniChatGenerationHandler) stopIfGenerationCancelled(ctx context.Context, jobID uuid.UUID, modelID, providerJobID string) (bool, error) {
	current, err := h.jobs.GetGenerationJobForProcessing(ctx, jobID)
	if err != nil {
		return false, fmt.Errorf("check generation cancellation: %w", err)
	}
	if current != nil && current.Status != models.OmniChatGenerationStatusCancelled {
		return false, nil
	}
	if providerJobID != "" {
		if err := h.provider.Cancel(ctx, modelID, providerJobID); err != nil {
			// The local cancellation is authoritative. Fal may already have
			// completed, so a provider-side cancellation failure must not revive
			// or retry the local job.
			zlog.Warn().Err(err).Str("job_id", jobID.String()).Msg("failed to cancel OmniChat provider job")
		}
	}
	return true, nil
}

func (h *OmniChatGenerationHandler) configQuotaFree() int64 {
	return h.storageQuotaFree
}

func (h *OmniChatGenerationHandler) configQuotaPro() int64 { return h.storageQuotaPro }

func (h *OmniChatGenerationHandler) resolveInputs(ctx context.Context, job *models.OmniChatGenerationJob) ([]string, string, error) {
	persona, err := h.personas.GetAccessibleByID(ctx, job.PersonaID, &job.OwnerUserID)
	if err != nil {
		return nil, "", fmt.Errorf("load generation persona references: %w", err)
	}
	if persona == nil {
		return nil, "", permanentGenerationFailure("persona_not_found", errors.New("generation persona not found"))
	}
	references := make([]string, 0, 4)
	if persona.AvatarURL != nil && safeProviderReferenceURL(*persona.AvatarURL) {
		references = append(references, *persona.AvatarURL)
	}
	for _, galleryURL := range persona.GalleryURLs {
		if len(references) >= 4 {
			break
		}
		if safeProviderReferenceURL(galleryURL) {
			references = append(references, galleryURL)
		}
	}

	if job.SourceAssetID == nil {
		return references, "", nil
	}
	sourceAsset, err := h.jobs.GetMediaAssetOwned(ctx, *job.SourceAssetID, job.OwnerUserID)
	if err != nil {
		return nil, "", fmt.Errorf("load source asset: %w", err)
	}
	if sourceAsset == nil || sourceAsset.Kind != models.OmniChatMediaKindImage || sourceAsset.ScanStatus != models.MediaScanStatusClean {
		return nil, "", permanentGenerationFailure("source_unavailable", errors.New("source image is unavailable"))
	}
	signedURL, err := h.storage.GetSignedURL(ctx, sourceAsset.StoragePath, 20*time.Minute)
	if err != nil {
		return nil, "", fmt.Errorf("sign source image URL: %w", err)
	}
	if !safeProviderReferenceURL(signedURL) {
		return nil, "", permanentGenerationFailure("source_unreachable", errors.New("source image is not externally reachable over HTTPS"))
	}
	return references, signedURL, nil
}

func safeProviderReferenceURL(rawURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.Fragment != "" {
		return false
	}
	host := strings.ToLower(strings.TrimSuffix(parsed.Hostname(), "."))
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return false
	}
	if ip := net.ParseIP(host); ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast()) {
		return false
	}
	return true
}

func selectFalMediaResult(kind models.OmniChatMediaKind, result *fal.Result) (*fal.MediaFile, error) {
	if result == nil {
		return nil, errors.New("provider returned no result")
	}
	if kind == models.OmniChatMediaKindImage {
		if len(result.Images) == 0 || strings.TrimSpace(result.Images[0].URL) == "" {
			return nil, errors.New("provider returned no image")
		}
		return &result.Images[0], nil
	}
	if kind == models.OmniChatMediaKindVideo {
		if result.Video == nil || strings.TrimSpace(result.Video.URL) == "" {
			return nil, errors.New("provider returned no video")
		}
		return result.Video, nil
	}
	return nil, errors.New("provider result kind is invalid")
}

// BuildFalGenerationSpec is the provider adapter boundary. Domain requests do
// not leak Fal-specific fields into handlers, persistence, or frontend code.
func BuildFalGenerationSpec(cfg config.OmniChatMediaConfig, job *models.OmniChatGenerationJob, referenceURLs []string, sourceURL string) (*FalGenerationSpec, error) {
	if job == nil {
		return nil, errors.New("generation job is required")
	}
	prompt := strings.TrimSpace(job.EffectivePrompt)
	if prompt == "" {
		return nil, errors.New("generation prompt is unavailable")
	}

	switch job.Kind {
	case models.OmniChatMediaKindImage:
		modelID := cfg.FalImageModel
		input := map[string]any{
			"prompt":            prompt,
			"num_images":        1,
			"aspect_ratio":      job.AspectRatio,
			"output_format":     "png",
			"resolution":        "1K",
			"safety_tolerance":  "3",
			"limit_generations": true,
			"enable_web_search": false,
		}
		if job.NegativePrompt != "" {
			input["prompt"] = prompt + " Avoid: " + job.NegativePrompt + "."
		}
		if len(referenceURLs) > 0 {
			modelID = cfg.FalImageEditModel
			if len(referenceURLs) > 14 {
				referenceURLs = referenceURLs[:14]
			}
			input["image_urls"] = referenceURLs
		}
		if strings.TrimSpace(modelID) == "" {
			return nil, errors.New("image generation model is not configured")
		}
		return &FalGenerationSpec{ModelID: modelID, Input: input}, nil

	case models.OmniChatMediaKindVideo:
		input := map[string]any{
			"prompt":                       prompt,
			"negative_prompt":              job.NegativePrompt,
			"aspect_ratio":                 job.AspectRatio,
			"resolution":                   "1080p",
			"duration":                     job.DurationSeconds,
			"enable_safety_checker":        true,
			"enable_output_safety_checker": true,
		}
		modelID := cfg.FalTextVideoModel
		if job.Mode == models.OmniChatGenerationModeImageToVideo {
			if sourceURL == "" {
				return nil, errors.New("image-to-video source is unavailable")
			}
			modelID = cfg.FalImageVideoModel
			input["image_url"] = sourceURL
		}
		if strings.TrimSpace(modelID) == "" {
			return nil, errors.New("video generation model is not configured")
		}
		return &FalGenerationSpec{ModelID: modelID, Input: input}, nil
	default:
		return nil, fmt.Errorf("unsupported generation kind %q", job.Kind)
	}
}
