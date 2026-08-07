package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	pathpkg "path"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/services/runpod"
	zlog "github.com/rs/zerolog/log"
)

// maxProviderReferenceImages must not exceed the worker's MAX_REFERENCE_IMAGES,
// which rejects an over-long list outright rather than truncating it.
const maxProviderReferenceImages = 8

type RunPodGenerationSpec struct {
	EndpointID string
	Input      map[string]any
}

type omniChatGenerationJobStore interface {
	GetGenerationJobForProcessing(ctx context.Context, id uuid.UUID) (*models.OmniChatGenerationJob, error)
	GetMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*models.OmniChatMediaAsset, error)
	MarkGenerationJobRunning(ctx context.Context, id uuid.UUID, providerJobID string) (bool, error)
	UpdateGenerationProgress(ctx context.Context, id uuid.UUID, progress int) error
	MarkGenerationJobFailed(ctx context.Context, id uuid.UUID, safeCode, providerError string) (bool, error)
	CompleteGenerationJob(ctx context.Context, jobID uuid.UUID, media *models.MediaFile, asset *models.OmniChatMediaAsset, freeTierBytes, proTierBytes int64, provenance models.OmniChatGenerationProvenance) error
}

type omniChatPersonaReader interface {
	GetAccessibleByID(ctx context.Context, id int, viewerUserID *int) (*models.BotPersona, error)
}

// mediaReferenceReader resolves persona upload metadata without exposing the
// storage URL as a browser-facing capability. The generation worker uses the
// returned storage object key to mint a short-lived URL for RunPod.
type mediaReferenceReader interface {
	GetByPublicURL(ctx context.Context, publicURL string) (*models.MediaFile, error)
	FindByStoragePath(ctx context.Context, storagePath string) (*models.MediaFile, error)
}

type runPodGenerationClient interface {
	Submit(ctx context.Context, endpointID string, input any) (string, error)
	Status(ctx context.Context, endpointID, jobID string) (*runpod.StatusResponse, error)
	Result(ctx context.Context, endpointID, jobID string) (*runpod.Result, error)
	Cancel(ctx context.Context, endpointID, jobID string) error
}

type OmniChatGenerationHandler struct {
	jobs             omniChatGenerationJobStore
	personas         omniChatPersonaReader
	mediaReferences  mediaReferenceReader
	storage          services.StorageService
	scanner          services.VirusScanner
	provider         runPodGenerationClient
	config           config.OmniChatMediaConfig
	failClosed       bool
	storageQuotaFree int64
	storageQuotaPro  int64
	billing          interface {
		CaptureOwned(context.Context, int, uuid.UUID) error
		RefundOwned(context.Context, int, uuid.UUID) error
	}
}

func (h *OmniChatGenerationHandler) SetBilling(billing interface {
	CaptureOwned(context.Context, int, uuid.UUID) error
	RefundOwned(context.Context, int, uuid.UUID) error
}) *OmniChatGenerationHandler {
	h.billing = billing
	return h
}

func NewOmniChatGenerationHandler(
	jobs omniChatGenerationJobStore,
	personas omniChatPersonaReader,
	storage services.StorageService,
	scanner services.VirusScanner,
	provider runPodGenerationClient,
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

// SetMediaReferenceReader enables private persona uploads to be passed to the
// GPU provider through short-lived object-store URLs. It is optional so unit
// tests and deployments that only use absolute public persona URLs retain the
// existing behavior.
func (h *OmniChatGenerationHandler) SetMediaReferenceReader(reader mediaReferenceReader) *OmniChatGenerationHandler {
	h.mediaReferences = reader
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
		if markErr := h.recordGenerationFailure(ctx, jobID, permanent.code); markErr != nil {
			// Returning the persistence error (without SkipRetry) keeps Asynq
			// retrying until the durable job is terminal instead of silently
			// leaving a queued/running job behind.
			return fmt.Errorf("record terminal generation failure: %w", markErr)
		}
		return fmt.Errorf("%w: %v", asynq.SkipRetry, err)
	}
	retryCount, _ := asynq.GetRetryCount(ctx)
	maxRetry, _ := asynq.GetMaxRetry(ctx)
	if maxRetry > 0 && retryCount >= maxRetry {
		if markErr := h.recordGenerationFailure(ctx, jobID, "generation_failed"); markErr != nil {
			return fmt.Errorf("record exhausted generation failure: %w", markErr)
		}
		return fmt.Errorf("%w: generation retries exhausted", asynq.SkipRetry)
	}
	return err
}

// recordGenerationFailure makes terminal state durable even when the worker
// task context has already been cancelled. It deliberately stores a generic
// detail: provider errors can contain signed URLs or service internals, while
// ErrorCode is the only client-facing failure signal.
func (h *OmniChatGenerationHandler) recordGenerationFailure(ctx context.Context, jobID uuid.UUID, code string) error {
	if h == nil || h.jobs == nil {
		return errors.New("generation job store is not configured")
	}
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	job, err := h.jobs.GetGenerationJobForProcessing(cleanupCtx, jobID)
	if err != nil {
		return err
	}
	marked, err := h.jobs.MarkGenerationJobFailed(cleanupCtx, jobID, code, "generation failed")
	if err != nil {
		return err
	}
	if !marked {
		job, err = h.jobs.GetGenerationJobForProcessing(cleanupCtx, jobID)
		if err != nil {
			return err
		}
	}
	if job == nil || job.BillingOperationID == nil || h.billing == nil {
		return nil
	}
	switch job.Status {
	case models.OmniChatGenerationStatusSucceeded:
		return h.billing.CaptureOwned(cleanupCtx, job.OwnerUserID, *job.BillingOperationID)
	case models.OmniChatGenerationStatusFailed, models.OmniChatGenerationStatusCancelled:
		return h.billing.RefundOwned(cleanupCtx, job.OwnerUserID, *job.BillingOperationID)
	default:
		if marked {
			return h.billing.RefundOwned(cleanupCtx, job.OwnerUserID, *job.BillingOperationID)
		}
		return errors.New("generation terminal transition was not applied")
	}
}

func (h *OmniChatGenerationHandler) process(ctx context.Context, jobID uuid.UUID) error {
	if h.config.RunPodRequestTimeoutSeconds > 0 {
		boundedContext, cancel := context.WithTimeout(ctx, time.Duration(h.config.RunPodRequestTimeoutSeconds)*time.Second)
		defer cancel()
		ctx = boundedContext
	}
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
		if job.BillingOperationID != nil && h.billing != nil {
			if job.Status == models.OmniChatGenerationStatusSucceeded {
				return h.billing.CaptureOwned(ctx, job.OwnerUserID, *job.BillingOperationID)
			}
			return h.billing.RefundOwned(ctx, job.OwnerUserID, *job.BillingOperationID)
		}
		return nil
	}

	references, sourceURL, err := h.resolveInputs(ctx, job)
	if err != nil {
		return err
	}
	spec, err := BuildRunPodGenerationSpec(h.config, job, references, sourceURL)
	if err != nil {
		if errors.Is(err, runpod.ErrEndpointNotConfigured) {
			return permanentGenerationFailure("provider_unavailable", err)
		}
		return permanentGenerationFailure("invalid_provider_request", err)
	}

	providerJobID := job.ProviderJobID
	providerCompleted := false
	defer func() {
		if providerJobID == "" || providerCompleted || ctx.Err() == nil {
			return
		}
		cancelContext, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		if cancelErr := h.provider.Cancel(cancelContext, spec.EndpointID, providerJobID); cancelErr != nil {
			zlog.Warn().Err(cancelErr).Str("job_id", job.ID.String()).Msg("failed to cancel timed-out RunPod media job")
		}
	}()
	if job.Status == models.OmniChatGenerationStatusQueued {
		providerJobID, err = h.provider.Submit(ctx, spec.EndpointID, spec.Input)
		if errors.Is(err, runpod.ErrNotConfigured) || errors.Is(err, runpod.ErrInvalidConfiguration) {
			return permanentGenerationFailure("provider_unavailable", err)
		}
		if err != nil {
			return fmt.Errorf("submit generation: %w", err)
		}
		marked, err := h.jobs.MarkGenerationJobRunning(ctx, job.ID, providerJobID)
		if err != nil {
			h.cancelSubmittedGeneration(ctx, job.ID, spec.EndpointID, providerJobID)
			return fmt.Errorf("mark generation running: %w", err)
		}
		if !marked {
			// A retry or concurrent worker won the database claim, or the user
			// cancelled while Submit was in flight. Its provider request is the
			// authoritative one, so discard this duplicate without retrying.
			h.cancelSubmittedGeneration(ctx, job.ID, spec.EndpointID, providerJobID)
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
		cancelled, err := h.stopIfGenerationCancelled(ctx, job.ID, spec.EndpointID, providerJobID)
		if err != nil {
			return err
		}
		if cancelled {
			return nil
		}
		status, err := h.provider.Status(ctx, spec.EndpointID, providerJobID)
		if err != nil {
			if errors.Is(err, runpod.ErrNotConfigured) || errors.Is(err, runpod.ErrEndpointNotConfigured) || errors.Is(err, runpod.ErrInvalidConfiguration) {
				return permanentGenerationFailure("provider_unavailable", err)
			}
			return fmt.Errorf("poll generation: %w", err)
		}
		if status == nil {
			return permanentGenerationFailure("provider_result_invalid", errors.New("RunPod returned no job status"))
		}
		if status.Status == runpod.StatusCompleted {
			providerCompleted = true
			break
		}
		if status.Status == runpod.StatusFailed || status.Status == runpod.StatusError {
			return permanentGenerationFailure("provider_failed", errors.New("RunPod media job failed"))
		}
		if status.Status == runpod.StatusCancelled || status.Status == runpod.StatusCanceled {
			return permanentGenerationFailure("provider_cancelled", errors.New("RunPod media job was cancelled"))
		}
		if status.Status == runpod.StatusTimedOut {
			return permanentGenerationFailure("provider_timed_out", errors.New("RunPod media job timed out"))
		}
		if status.Status == runpod.StatusInProgress || status.Status == runpod.StatusRunning {
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
	cancelled, err := h.stopIfGenerationCancelled(ctx, job.ID, spec.EndpointID, providerJobID)
	if err != nil {
		return err
	}
	if cancelled {
		return nil
	}

	result, err := h.provider.Result(ctx, spec.EndpointID, providerJobID)
	if err != nil {
		switch {
		case errors.Is(err, runpod.ErrNotConfigured), errors.Is(err, runpod.ErrEndpointNotConfigured), errors.Is(err, runpod.ErrInvalidConfiguration):
			return permanentGenerationFailure("provider_unavailable", err)
		case errors.Is(err, runpod.ErrJobFailed):
			return permanentGenerationFailure("provider_failed", err)
		case errors.Is(err, runpod.ErrJobCancelled):
			return permanentGenerationFailure("provider_cancelled", err)
		case errors.Is(err, runpod.ErrJobTimedOut):
			return permanentGenerationFailure("provider_timed_out", err)
		}
		return fmt.Errorf("fetch generation result: %w", err)
	}
	// Surface worker provenance as soon as it arrives. Without it, a template
	// left pointing at an old tag silently invalidates every prompt experiment.
	if strings.TrimSpace(result.WorkerBuild) == "" {
		zlog.Warn().Str("job_id", job.ID.String()).Msg("OmniChat worker returned no build stamp; endpoint may be serving a pre-provenance image")
	} else {
		zlog.Info().Str("job_id", job.ID.String()).Str("worker_build", result.WorkerBuild).Msg("OmniChat generation rendered")
	}
	providerMedia, err := selectRunPodMediaResult(job.Kind, result)
	if err != nil {
		return permanentGenerationFailure("provider_result_invalid", err)
	}
	maxBytes := h.config.MaxImageBytes
	if job.Kind == models.OmniChatMediaKindVideo {
		maxBytes = h.config.MaxVideoBytes
	}
	download, cleanup, err := downloadGeneratedMedia(ctx, providerMedia.URL, modelsMediaKind(job.Kind), maxBytes, h.config.RunPodOutputHosts...)
	if err != nil {
		return permanentGenerationFailure("provider_result_invalid", err)
	}
	defer cleanup()
	cancelled, err = h.stopIfGenerationCancelled(ctx, job.ID, spec.EndpointID, providerJobID)
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
	_, err = h.storage.Upload(ctx, storageKey, file, download.ContentType)
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
		// Generated assets are private by default. Never persist a direct
		// storage/CDN URL that could bypass the owner/publication access gates.
		StorageURL: "/uploads/" + storageKey, StoragePath: storageKey,
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
	provenance := models.OmniChatGenerationProvenance{
		WorkerBuild:  result.WorkerBuild,
		ActualPrompt: result.ActualPrompt,
	}
	if err := h.jobs.CompleteGenerationJob(ctx, job.ID, media, asset, h.configQuotaFree(), h.configQuotaPro(), provenance); err != nil {
		if errors.Is(err, models.ErrOmniChatStorageQuotaExceeded) {
			return permanentGenerationFailure("storage_quota_exceeded", err)
		}
		return fmt.Errorf("complete generation job: %w", err)
	}
	committed = true
	if job.BillingOperationID != nil {
		if h.billing == nil {
			return errors.New("generation billing is not configured")
		}
		if err := h.billing.CaptureOwned(ctx, job.OwnerUserID, *job.BillingOperationID); err != nil {
			return fmt.Errorf("capture generation credits: %w", err)
		}
	}
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
	if current != nil &&
		current.Status != models.OmniChatGenerationStatusCancelled &&
		current.Status != models.OmniChatGenerationStatusFailed &&
		current.Status != models.OmniChatGenerationStatusSucceeded {
		return false, nil
	}
	if providerJobID != "" {
		cancelCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		err := h.provider.Cancel(cancelCtx, modelID, providerJobID)
		cancel()
		if err != nil {
			// The local cancellation is authoritative. RunPod may already have
			// completed, so a provider-side cancellation failure must not revive
			// or retry the local job.
			zlog.Warn().Err(err).Str("job_id", jobID.String()).Msg("failed to cancel OmniChat provider job")
		}
	}
	if current != nil &&
		current.Status != models.OmniChatGenerationStatusSucceeded &&
		current.BillingOperationID != nil &&
		h.billing != nil {
		refundCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		err := h.billing.RefundOwned(refundCtx, current.OwnerUserID, *current.BillingOperationID)
		cancel()
		if err != nil {
			return true, fmt.Errorf("refund cancelled generation reservation: %w", err)
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
	job.IdentityProfile = services.ResolveOmniChatMediaIdentityProfile(persona)
	// The persona's stable look is resolved here, not carried on the job's
	// scene snapshot, so an edited persona description applies to new renders
	// without rewriting stored scenes.
	if job.Scene.SubjectAppearance == "" {
		job.Scene.SubjectAppearance = job.IdentityProfile.Appearance
	}
	references := make([]string, 0, job.IdentityProfile.ReferenceLimit)
	seen := make(map[string]struct{}, job.IdentityProfile.ReferenceLimit)
	preferPublicReference := persona.OwnerUserID == nil
	appendReference := func(rawURL string) error {
		if len(references) >= job.IdentityProfile.ReferenceLimit {
			return nil
		}
		normalized, err := h.resolvePersonaReferenceURL(ctx, rawURL, preferPublicReference)
		if err != nil {
			return err
		}
		if normalized == "" {
			return nil
		}
		if _, ok := seen[normalized]; ok {
			return nil
		}
		seen[normalized] = struct{}{}
		references = append(references, normalized)
		return nil
	}
	if persona.AvatarURL != nil {
		if err := appendReference(*persona.AvatarURL); err != nil {
			return nil, "", fmt.Errorf("resolve persona avatar reference: %w", err)
		}
	}
	// Private identity references win over the public gallery. gallery_urls is
	// serialized on every persona response and rendered in the UI, so curated
	// body references are configured out of band and must not be displayed.
	extraReferences := job.IdentityProfile.ReferenceURLs
	if len(extraReferences) == 0 {
		extraReferences = persona.GalleryURLs
	}
	for _, referenceURL := range extraReferences {
		if len(references) >= job.IdentityProfile.ReferenceLimit {
			break
		}
		if err := appendReference(referenceURL); err != nil {
			return nil, "", fmt.Errorf("resolve persona gallery reference: %w", err)
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

func (h *OmniChatGenerationHandler) resolvePersonaReferenceURL(ctx context.Context, rawURL string, preferPublicReference bool) (string, error) {
	trimmed := strings.TrimSpace(rawURL)
	if strings.HasPrefix(trimmed, "/uploads/") {
		// Upload paths can point at private user media. Always resolve them
		// through tracked metadata and sign the object for the GPU worker;
		// publishing the backend URL directly would either leak a private asset
		// or produce an unrelated image when the worker cannot fetch it.
		if h.mediaReferences == nil {
			return "", permanentGenerationFailure("persona_reference_unavailable", errors.New("persona media repository is not configured"))
		}
		media, err := h.mediaReferences.GetByPublicURL(ctx, trimmed)
		if err != nil {
			return "", err
		}
		if media == nil {
			media, err = h.mediaReferences.FindByStoragePath(ctx, strings.TrimPrefix(trimmed, "/"))
			if err != nil {
				return "", err
			}
		}
		if media == nil {
			return "", permanentGenerationFailure("persona_reference_unavailable", errors.New("persona media record was not found"))
		}
		if media.ScanStatus != models.MediaScanStatusClean || !services.IsImageType(media.FileType) {
			return "", permanentGenerationFailure("persona_reference_unavailable", errors.New("persona media is not a clean image"))
		}
		objectKey := strings.TrimSpace(media.StorageObjectKey)
		if objectKey == "" {
			objectKey = strings.TrimPrefix(filepath.ToSlash(strings.TrimSpace(media.StoragePath)), "uploads/")
		}
		if objectKey == "" || strings.HasPrefix(objectKey, "/") || strings.Contains(objectKey, "..") {
			return "", permanentGenerationFailure("persona_reference_unavailable", errors.New("persona media storage key is invalid"))
		}
		signedURL, signErr := h.storage.GetSignedURL(ctx, objectKey, 20*time.Minute)
		if signErr == nil && safeProviderReferenceURL(signedURL) {
			return signedURL, nil
		}
		// A platform-owned avatar may still have a public CDN URL when object
		// signing is temporarily unavailable. Keep that as a narrow fallback;
		// user-owned personas must never fall back to a public URL.
		if preferPublicReference {
			if normalized := normalizeProviderReferenceURL(media.StorageURL, h.config.RunPodWorkerBackendURL); normalized != "" {
				return normalized, nil
			}
		}
		if signErr != nil {
			return "", signErr
		}
		return "", permanentGenerationFailure("persona_reference_unavailable", errors.New("persona media is not externally reachable over HTTPS"))
	}
	if normalized := normalizeProviderReferenceURL(trimmed, h.config.RunPodWorkerBackendURL); normalized != "" {
		return normalized, nil
	}
	return "", nil
}

func normalizeProviderReferenceURL(rawURL, backendURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if strings.HasPrefix(trimmed, "/") {
		if pathpkg.Clean(trimmed) != trimmed || !strings.HasPrefix(trimmed, "/uploads/") {
			return ""
		}
		base, err := url.Parse(strings.TrimSpace(backendURL))
		if err != nil || base.Scheme != "https" || base.Hostname() == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
			return ""
		}
		base.Path = strings.TrimRight(base.Path, "/")
		resolved := base.ResolveReference(&url.URL{Path: trimmed})
		trimmed = resolved.String()
	}
	if !safeProviderReferenceURL(trimmed) {
		return ""
	}
	return trimmed
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
	if port := parsed.Port(); port != "" && port != "443" {
		return false
	}
	if ip := net.ParseIP(host); ip != nil && (!ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast()) {
		return false
	}
	return true
}

func selectRunPodMediaResult(kind models.OmniChatMediaKind, result *runpod.Result) (*runpod.MediaFile, error) {
	if result == nil {
		return nil, errors.New("provider returned no result")
	}
	if kind == models.OmniChatMediaKindImage {
		if len(result.Images) == 0 && result.Image != nil {
			result.Images = []runpod.MediaFile{*result.Image}
		}
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

// BuildRunPodGenerationSpec is the provider adapter boundary. Domain requests
// do not leak RunPod endpoint details into handlers, persistence, or frontend
// code. The worker receives this stable input contract and owns model/runtime
// selection inside its endpoint image.
func BuildRunPodGenerationSpec(cfg config.OmniChatMediaConfig, job *models.OmniChatGenerationJob, referenceURLs []string, sourceURL string) (*RunPodGenerationSpec, error) {
	if job == nil {
		return nil, errors.New("generation job is required")
	}
	prompt := strings.TrimSpace(job.EffectivePrompt)
	if prompt == "" {
		return nil, errors.New("generation prompt is unavailable")
	}
	normalizedReferences := make([]string, 0, len(referenceURLs))
	for _, rawURL := range referenceURLs {
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" || !safeProviderReferenceURL(rawURL) {
			return nil, errors.New("provider reference image URL is invalid")
		}
		normalizedReferences = append(normalizedReferences, rawURL)
	}
	if len(normalizedReferences) > maxProviderReferenceImages {
		normalizedReferences = normalizedReferences[:maxProviderReferenceImages]
	}
	referenceURLs = normalizedReferences
	profile := models.NormalizeOmniChatMediaIdentityProfile(job.IdentityProfile)
	if profile.Mode != models.OmniChatMediaIdentityModeLoRA {
		profile.Mode = models.OmniChatMediaIdentityModeReference
		profile.LoraModelID = ""
		profile.LoraWeightName = ""
	}
	if profile.ReferenceLimit < len(referenceURLs) {
		referenceURLs = referenceURLs[:profile.ReferenceLimit]
	}
	identityInput := map[string]any{
		"identity_mode":          string(profile.Mode),
		"identity_adapter":       profile.Adapter,
		"identity_adapter_scale": profile.AdapterScale,
	}
	if profile.Mode == models.OmniChatMediaIdentityModeLoRA {
		identityInput["lora_model_id"] = profile.LoraModelID
		identityInput["lora_weight_name"] = profile.LoraWeightName
		identityInput["lora_scale"] = profile.LoraScale
	}
	sourceURL = strings.TrimSpace(sourceURL)
	if sourceURL != "" && !safeProviderReferenceURL(sourceURL) {
		return nil, errors.New("provider source image URL is invalid")
	}
	providerMode := string(job.Mode)
	if providerMode == "" {
		providerMode = string(models.OmniChatGenerationModeCreate)
	}
	aspectRatio := job.AspectRatio
	if aspectRatio == "" {
		if job.Kind == models.OmniChatMediaKindVideo {
			aspectRatio = "16:9"
		} else {
			aspectRatio = "1:1"
		}
	}
	durationSeconds := job.DurationSeconds
	if job.Kind == models.OmniChatMediaKindVideo && durationSeconds == 0 {
		durationSeconds = 5
	}

	switch job.Kind {
	case models.OmniChatMediaKindImage:
		endpointID := strings.TrimSpace(cfg.RunPodImageEndpointID)
		input := map[string]any{
			"kind":            "image",
			"mode":            providerMode,
			"prompt":          prompt,
			"negative_prompt": strings.TrimSpace(job.NegativePrompt),
			"num_images":      1,
			"aspect_ratio":    aspectRatio,
			"output_format":   "png",
		}
		if providerMode == string(models.OmniChatGenerationModeContextual) {
			// Keep structured scene state separate from the prose prompt so the
			// worker can use the latest physical events without parsing/truncation.
			input["scene"] = job.Scene
		}
		for key, value := range identityInput {
			input[key] = value
		}
		if len(referenceURLs) > 0 {
			input["reference_image_urls"] = referenceURLs
		}
		if strings.TrimSpace(endpointID) == "" {
			return nil, fmt.Errorf("%w: image generation endpoint", runpod.ErrEndpointNotConfigured)
		}
		return &RunPodGenerationSpec{EndpointID: endpointID, Input: input}, nil

	case models.OmniChatMediaKindVideo:
		input := map[string]any{
			"kind":             "video",
			"mode":             providerMode,
			"prompt":           prompt,
			"negative_prompt":  strings.TrimSpace(job.NegativePrompt),
			"resolution":       "1080p",
			"duration_seconds": durationSeconds,
			"aspect_ratio":     runPodVideoAspectRatio(aspectRatio),
		}
		if providerMode == string(models.OmniChatGenerationModeContextual) {
			input["scene"] = job.Scene
		}
		for key, value := range identityInput {
			input[key] = value
		}
		if len(referenceURLs) > 0 {
			input["reference_image_urls"] = referenceURLs
		}
		endpointID := strings.TrimSpace(cfg.RunPodVideoEndpointID)
		if job.Mode == models.OmniChatGenerationModeImageToVideo {
			if sourceURL == "" {
				return nil, errors.New("image-to-video source is unavailable")
			}
			input["source_image_url"] = sourceURL
		}
		if strings.TrimSpace(endpointID) == "" {
			return nil, fmt.Errorf("%w: video generation endpoint", runpod.ErrEndpointNotConfigured)
		}
		return &RunPodGenerationSpec{EndpointID: endpointID, Input: input}, nil
	default:
		return nil, fmt.Errorf("unsupported generation kind %q", job.Kind)
	}
}

func runPodVideoAspectRatio(aspectRatio string) string {
	switch aspectRatio {
	case "4:5":
		return "3:4"
	case "5:4":
		return "4:3"
	default:
		return aspectRatio
	}
}
