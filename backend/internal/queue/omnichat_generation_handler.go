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

// Progress is reported as one bar across however many provider calls a job
// makes. A video job renders a still and then animates it, and the animation is
// by far the longer half, so the still is only allowed the first stretch --
// otherwise the bar would reach 90 and freeze for the rest of the job.
const (
	firstPhaseProgressFloor   = 5
	videoStillProgressCeiling = 40
	finalPhaseProgressCeiling = 90
)

type RunPodGenerationSpec struct {
	EndpointID string
	Input      map[string]any
}

// providerPhase is one RunPod round trip within a generation job.
//
// Submission, provider-id persistence and progress bounds differ per phase and
// so are supplied by the caller: the image phase of a video job claims a queued
// job, while the animation phase claims an already-running one and cannot use
// the same transition.
type providerPhase struct {
	kind models.OmniChatMediaKind
	spec *RunPodGenerationSpec
	// providerJobID is the request being resumed on entry, and the request that
	// was submitted on exit.
	providerJobID string
	submit        bool
	progressMin   int
	progressMax   int
	// record durably claims the phase. False means another worker got there
	// first and this submission is a duplicate to be cancelled.
	record func(ctx context.Context, jobID uuid.UUID, providerJobID string) (bool, error)
}

type omniChatGenerationJobStore interface {
	GetGenerationJobForProcessing(ctx context.Context, id uuid.UUID) (*models.OmniChatGenerationJob, error)
	GetMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*models.OmniChatMediaAsset, error)
	DeleteMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (bool, error)
	MarkGenerationJobRunning(ctx context.Context, id uuid.UUID, providerJobID string) (bool, error)
	StartGenerationSecondPhase(ctx context.Context, id uuid.UUID, providerJobID string) (bool, error)
	UpdateGenerationProgress(ctx context.Context, id uuid.UUID, progress int) error
	MarkGenerationJobFailed(ctx context.Context, id uuid.UUID, safeCode, providerError string) (bool, error)
	AttachIntermediateAsset(ctx context.Context, jobID uuid.UUID, media *models.MediaFile, asset *models.OmniChatMediaAsset, kind models.OmniChatMediaKind, freeTierBytes, proTierBytes int64, provenance models.OmniChatGenerationProvenance) error
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
	// downloadMedia fetches a finished artifact from the provider. It is a
	// field so the two-phase flow can be exercised without a live HTTPS host:
	// the real implementation refuses loopback addresses by design, which
	// makes an in-process test server unusable. Nil means the real one.
	downloadMedia func(ctx context.Context, rawURL string, kind modelsMediaKind, maxBytes int64, additionalHosts ...string) (*generatedMediaDownload, func(), error)
	billing       interface {
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
	// Before the billing decision, because an unbilled administrator job still
	// leaves a still behind and returns early below.
	if job != nil && job.Status != models.OmniChatGenerationStatusSucceeded {
		h.discardIntermediateAsset(cleanupCtx, job)
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

	// A scene or create video has no still to animate yet. Render one through
	// the image pipeline first, so the clip inherits the identity conditioning
	// and scene fidelity that only the image path provides. An image-to-video
	// request from the Create page already carries its source and skips this.
	twoPhaseVideo := job.Kind == models.OmniChatMediaKindVideo && job.Mode != models.OmniChatGenerationModeImageToVideo
	if twoPhaseVideo && job.SourceAssetID == nil {
		stillURL, stopped, err := h.renderVideoSourceStill(ctx, job, references)
		if err != nil {
			return err
		}
		if stopped {
			return nil
		}
		sourceURL = stillURL
	}

	var spec *RunPodGenerationSpec
	switch job.Kind {
	case models.OmniChatMediaKindImage:
		spec, err = BuildImageSpec(h.config, job, references)
	case models.OmniChatMediaKindVideo:
		spec, err = BuildVideoSpec(h.config, job, sourceURL)
	default:
		err = fmt.Errorf("unsupported generation kind %q", job.Kind)
	}
	if err != nil {
		return providerSpecFailure(err)
	}

	phase := &providerPhase{
		kind:          job.Kind,
		spec:          spec,
		providerJobID: job.ProviderJobID,
		progressMin:   firstPhaseProgressFloor,
		progressMax:   finalPhaseProgressCeiling,
	}
	if twoPhaseVideo {
		phase.progressMin = videoStillProgressCeiling
	}
	switch {
	case job.Status == models.OmniChatGenerationStatusQueued:
		// The job's first provider call, whichever kind it is.
		phase.submit = true
		phase.record = h.jobs.MarkGenerationJobRunning
	case twoPhaseVideo && job.SourceAssetID != nil && job.ProviderJobID == "":
		// Only AttachIntermediateAsset leaves a running job with a source asset
		// and no provider request id, so this is the animation phase.
		//
		// The conditions are spelled out rather than reduced to the empty id
		// alone: any other running job that lost its provider id is corrupt,
		// and must keep failing permanently so it is refunded rather than left
		// running forever.
		phase.submit = true
		phase.record = h.jobs.StartGenerationSecondPhase
	}
	result, err := h.runProviderPhase(ctx, job, phase)
	if err != nil {
		return err
	}
	if result == nil {
		return nil
	}

	_, stopped, err := h.persistGeneratedMedia(ctx, job, job.Kind, phase, result,
		func(media *models.MediaFile, asset *models.OmniChatMediaAsset, provenance models.OmniChatGenerationProvenance) error {
			return h.jobs.CompleteGenerationJob(ctx, job.ID, media, asset, h.configQuotaFree(), h.configQuotaPro(), provenance)
		})
	if err != nil {
		return err
	}
	if stopped {
		return nil
	}
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

// renderVideoSourceStill runs the image phase of a two-phase video job and
// returns a signed URL for the still it stored.
//
// The still is saved as a real gallery asset rather than a scratch file: it is
// the only durable record of what the animation was built from, and it is what
// makes the phase resumable without a dedicated state column.
func (h *OmniChatGenerationHandler) renderVideoSourceStill(ctx context.Context, job *models.OmniChatGenerationJob, references []string) (string, bool, error) {
	spec, err := BuildImageSpec(h.config, job, references)
	if err != nil {
		return "", false, providerSpecFailure(err)
	}
	phase := &providerPhase{
		kind:          models.OmniChatMediaKindImage,
		spec:          spec,
		providerJobID: job.ProviderJobID,
		progressMin:   firstPhaseProgressFloor,
		progressMax:   videoStillProgressCeiling,
	}
	if job.Status == models.OmniChatGenerationStatusQueued {
		phase.submit = true
		phase.record = h.jobs.MarkGenerationJobRunning
	}
	result, err := h.runProviderPhase(ctx, job, phase)
	if err != nil {
		return "", false, err
	}
	if result == nil {
		return "", true, nil
	}
	asset, stopped, err := h.persistGeneratedMedia(ctx, job, models.OmniChatMediaKindImage, phase, result,
		func(media *models.MediaFile, asset *models.OmniChatMediaAsset, provenance models.OmniChatGenerationProvenance) error {
			return h.jobs.AttachIntermediateAsset(ctx, job.ID, media, asset,
				models.OmniChatMediaKindImage, h.configQuotaFree(), h.configQuotaPro(), provenance)
		})
	if err != nil || stopped {
		return "", stopped, err
	}
	// Mirror the row the commit just wrote. The stored provider request id was
	// cleared with it, so the animation phase submits rather than polling a
	// finished image job.
	job.SourceAssetID = &asset.ID
	job.ProviderJobID = ""
	job.Status = models.OmniChatGenerationStatusRunning
	job.Progress = videoStillProgressCeiling

	// Cancelling during the still must not buy a clip.
	cancelled, err := h.stopIfGenerationCancelled(ctx, job.ID, "", "")
	if err != nil {
		return "", false, err
	}
	if cancelled {
		return "", true, nil
	}
	stillURL, err := h.resolveSourceImageURL(ctx, job.OwnerUserID, asset.ID)
	if err != nil {
		return "", false, err
	}
	return stillURL, false, nil
}

// runProviderPhase submits (or resumes) one RunPod request and waits for it.
//
// A nil result with a nil error means the job reached a terminal state while
// this phase was in flight -- cancelled by its owner, or claimed by another
// worker -- and the caller must stop without treating it as a failure.
func (h *OmniChatGenerationHandler) runProviderPhase(ctx context.Context, job *models.OmniChatGenerationJob, phase *providerPhase) (*runpod.Result, error) {
	providerCompleted := false
	defer func() {
		if phase.providerJobID == "" || providerCompleted || ctx.Err() == nil {
			return
		}
		cancelContext, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		if cancelErr := h.provider.Cancel(cancelContext, phase.spec.EndpointID, phase.providerJobID); cancelErr != nil {
			zlog.Warn().Err(cancelErr).Str("job_id", job.ID.String()).Msg("failed to cancel timed-out RunPod media job")
		}
	}()
	if phase.submit {
		// The one server-owned decision that changes what comes back and is
		// invisible afterwards. job.EffectivePrompt is written once at request
		// time and never updated -- deliberately, because a retry reloads it and
		// rebuilds the spec, so writing the amended prompt back would append the
		// directive again on every attempt.
		//
		// The decision is recorded rather than the prompt. A prompt carries
		// somebody's own scene text, and copying that into logs to answer a
		// question about the medium is a poor trade.
		zlog.Info().
			Str("job_id", job.ID.String()).
			Str("render_style", job.IdentityProfile.RenderStyle).
			Str("mode", string(job.Mode)).
			Msg("submitting omnichat media job")
		submitted, err := h.provider.Submit(ctx, phase.spec.EndpointID, phase.spec.Input)
		if errors.Is(err, runpod.ErrNotConfigured) || errors.Is(err, runpod.ErrInvalidConfiguration) {
			return nil, permanentGenerationFailure("provider_unavailable", err)
		}
		if err != nil {
			return nil, fmt.Errorf("submit generation: %w", err)
		}
		if strings.TrimSpace(submitted) == "" {
			// Recording an empty id would store NULL and make the job
			// indistinguishable from one whose next phase has not started.
			return nil, permanentGenerationFailure("provider_result_invalid", errors.New("RunPod accepted a job without returning a request id"))
		}
		phase.providerJobID = submitted
		claimed, err := phase.record(ctx, job.ID, submitted)
		if err != nil {
			h.cancelSubmittedGeneration(ctx, job.ID, phase.spec.EndpointID, submitted)
			return nil, fmt.Errorf("record generation provider request: %w", err)
		}
		if !claimed {
			// A retry or concurrent worker won the database claim, or the user
			// cancelled while Submit was in flight. Its provider request is the
			// authoritative one, so discard this duplicate without retrying.
			h.cancelSubmittedGeneration(ctx, job.ID, phase.spec.EndpointID, submitted)
			return nil, nil
		}
	} else if phase.providerJobID == "" {
		return nil, permanentGenerationFailure("provider_state_invalid", errors.New("running generation is missing provider request id"))
	}

	pollInterval := time.Duration(h.config.PollIntervalSeconds) * time.Second
	if pollInterval < time.Second || pollInterval > 30*time.Second {
		pollInterval = 2 * time.Second
	}
	progress := job.Progress
	if progress < phase.progressMin {
		progress = phase.progressMin
	}
	for {
		cancelled, err := h.stopIfGenerationCancelled(ctx, job.ID, phase.spec.EndpointID, phase.providerJobID)
		if err != nil {
			return nil, err
		}
		if cancelled {
			return nil, nil
		}
		status, err := h.provider.Status(ctx, phase.spec.EndpointID, phase.providerJobID)
		if err != nil {
			if errors.Is(err, runpod.ErrNotConfigured) || errors.Is(err, runpod.ErrEndpointNotConfigured) || errors.Is(err, runpod.ErrInvalidConfiguration) {
				return nil, permanentGenerationFailure("provider_unavailable", err)
			}
			return nil, fmt.Errorf("poll generation: %w", err)
		}
		if status == nil {
			return nil, permanentGenerationFailure("provider_result_invalid", errors.New("RunPod returned no job status"))
		}
		if status.Status == runpod.StatusCompleted {
			providerCompleted = true
			break
		}
		if status.Status == runpod.StatusFailed || status.Status == runpod.StatusError {
			return nil, permanentGenerationFailure("provider_failed", errors.New("RunPod media job failed"))
		}
		if status.Status == runpod.StatusCancelled || status.Status == runpod.StatusCanceled {
			return nil, permanentGenerationFailure("provider_cancelled", errors.New("RunPod media job was cancelled"))
		}
		if status.Status == runpod.StatusTimedOut {
			return nil, permanentGenerationFailure("provider_timed_out", errors.New("RunPod media job timed out"))
		}
		if status.Status == runpod.StatusInProgress || status.Status == runpod.StatusRunning {
			if progress < phase.progressMax {
				progress += 5
				if progress > phase.progressMax {
					progress = phase.progressMax
				}
				if err := h.jobs.UpdateGenerationProgress(ctx, job.ID, progress); err != nil {
					return nil, fmt.Errorf("update generation progress: %w", err)
				}
			}
		}
		timer := time.NewTimer(pollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
	cancelled, err := h.stopIfGenerationCancelled(ctx, job.ID, phase.spec.EndpointID, phase.providerJobID)
	if err != nil {
		return nil, err
	}
	if cancelled {
		return nil, nil
	}

	result, err := h.provider.Result(ctx, phase.spec.EndpointID, phase.providerJobID)
	if err != nil {
		switch {
		case errors.Is(err, runpod.ErrNotConfigured), errors.Is(err, runpod.ErrEndpointNotConfigured), errors.Is(err, runpod.ErrInvalidConfiguration):
			return nil, permanentGenerationFailure("provider_unavailable", err)
		case errors.Is(err, runpod.ErrJobFailed):
			return nil, permanentGenerationFailure("provider_failed", err)
		case errors.Is(err, runpod.ErrJobCancelled):
			return nil, permanentGenerationFailure("provider_cancelled", err)
		case errors.Is(err, runpod.ErrJobTimedOut):
			return nil, permanentGenerationFailure("provider_timed_out", err)
		}
		return nil, fmt.Errorf("fetch generation result: %w", err)
	}
	if result == nil {
		return nil, permanentGenerationFailure("provider_result_invalid", errors.New("RunPod returned no job result"))
	}
	// Surface worker provenance as soon as it arrives. Without it, a template
	// left pointing at an old tag silently invalidates every prompt experiment.
	if strings.TrimSpace(result.WorkerBuild) == "" {
		zlog.Warn().Str("job_id", job.ID.String()).Str("phase", string(phase.kind)).
			Msg("OmniChat worker returned no build stamp; endpoint may be serving a pre-provenance image")
	} else {
		zlog.Info().Str("job_id", job.ID.String()).Str("phase", string(phase.kind)).
			Str("worker_build", result.WorkerBuild).Msg("OmniChat generation rendered")
	}
	return result, nil
}

// persistGeneratedMedia validates, scans and stores one provider artifact, then
// hands it to commit for the database write that makes it durable.
//
// kind is a parameter rather than job.Kind: during the image phase of a video
// job the job says "video" while the bytes on the wire are a PNG, and every
// decision below -- which result field to read, which size cap applies, which
// file extension the storage key gets -- follows the artifact, not the job.
//
// A true "stopped" return means the job went terminal mid-flight; the caller
// must stop without treating it as a failure.
func (h *OmniChatGenerationHandler) persistGeneratedMedia(
	ctx context.Context,
	job *models.OmniChatGenerationJob,
	kind models.OmniChatMediaKind,
	phase *providerPhase,
	result *runpod.Result,
	commit func(*models.MediaFile, *models.OmniChatMediaAsset, models.OmniChatGenerationProvenance) error,
) (*models.OmniChatMediaAsset, bool, error) {
	providerMedia, err := selectRunPodMediaResult(kind, result)
	if err != nil {
		return nil, false, permanentGenerationFailure("provider_result_invalid", err)
	}
	maxBytes := h.config.MaxImageBytes
	if kind == models.OmniChatMediaKindVideo {
		maxBytes = h.config.MaxVideoBytes
	}
	fetch := h.downloadMedia
	if fetch == nil {
		fetch = downloadGeneratedMedia
	}
	download, cleanup, err := fetch(ctx, providerMedia.URL, modelsMediaKind(kind), maxBytes, h.config.RunPodOutputHosts...)
	if err != nil {
		return nil, false, permanentGenerationFailure("provider_result_invalid", err)
	}
	defer cleanup()
	cancelled, err := h.stopIfGenerationCancelled(ctx, job.ID, phase.spec.EndpointID, phase.providerJobID)
	if err != nil {
		return nil, false, err
	}
	if cancelled {
		return nil, true, nil
	}

	if h.scanner == nil {
		if h.failClosed {
			return nil, false, permanentGenerationFailure("scanner_unavailable", errors.New("virus scanner is unavailable"))
		}
	} else {
		scanResult, err := h.scanner.ScanFile(ctx, download.Path)
		if err != nil {
			if h.failClosed {
				return nil, false, fmt.Errorf("scan generated media: %w", err)
			}
		} else if scanResult.Infected {
			return nil, false, permanentGenerationFailure("malware_detected", errors.New("generated media failed security scanning"))
		}
	}

	file, err := os.Open(download.Path)
	if err != nil {
		return nil, false, fmt.Errorf("open generated media for storage: %w", err)
	}
	defer func() { _ = file.Close() }()
	// The extension is what keeps a video job's two artifacts apart: the same
	// job id yields .png for the still and .mp4 for the clip. Do not collapse
	// it into a fixed suffix.
	storageKey := fmt.Sprintf("omnichat/generated/%d/%s%s", job.OwnerUserID, job.ID.String(), download.Extension)
	_, err = h.storage.Upload(ctx, storageKey, file, download.ContentType)
	if err != nil {
		return nil, false, fmt.Errorf("store generated media: %w", err)
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
	if kind == models.OmniChatMediaKindVideo {
		duration := job.DurationSeconds
		if providerMedia.Duration > 0 {
			duration = int(providerMedia.Duration + 0.5)
		}
		media.Duration = &duration
		asset.DurationSeconds = &duration
	}
	provenance := models.OmniChatGenerationProvenance{
		WorkerBuild:      result.WorkerBuild,
		ActualPrompt:     result.ActualPrompt,
		LoadSeconds:      result.LoadSeconds,
		InferenceSeconds: result.InferenceSeconds,
	}
	if err := commit(media, asset, provenance); err != nil {
		if errors.Is(err, models.ErrOmniChatStorageQuotaExceeded) {
			return nil, false, permanentGenerationFailure("storage_quota_exceeded", err)
		}
		return nil, false, fmt.Errorf("persist generated media: %w", err)
	}
	committed = true
	return asset, false, nil
}

func providerSpecFailure(err error) error {
	if errors.Is(err, runpod.ErrEndpointNotConfigured) {
		return permanentGenerationFailure("provider_unavailable", err)
	}
	return permanentGenerationFailure("invalid_provider_request", err)
}

// discardIntermediateAsset removes the still a two-phase video job rendered for
// itself when that job ends without producing its clip.
//
// Failure and cancellation both refund the whole reservation, so keeping the
// still would hand out an unpaid gallery image and charge it against the
// owner's storage quota. Deleting it also clears source_asset_id -- the foreign
// key is ON DELETE SET NULL -- so a failed row stops looking like a job whose
// animation phase is merely pending.
//
// Callers must have established that the job did not succeed.
func (h *OmniChatGenerationHandler) discardIntermediateAsset(ctx context.Context, job *models.OmniChatGenerationJob) {
	if h.jobs == nil || job == nil || job.SourceAssetID == nil {
		return
	}
	// Only a still this job rendered for itself. An image-to-video request
	// animates an asset the user already owns and chose from their gallery,
	// and that must survive the failure untouched.
	if job.Kind != models.OmniChatMediaKindVideo || job.Mode == models.OmniChatGenerationModeImageToVideo {
		return
	}
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
	defer cancel()
	// A best-effort cleanup: the terminal state and the refund are the parts
	// that must not be lost, and the storage object is already tracked by the
	// deletion queue this write feeds.
	if _, err := h.jobs.DeleteMediaAssetOwned(cleanupCtx, *job.SourceAssetID, job.OwnerUserID); err != nil {
		zlog.Warn().Err(err).Str("job_id", job.ID.String()).
			Msg("failed to discard the intermediate still of an unfinished OmniChat video job")
	}
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
	if current != nil && current.Status != models.OmniChatGenerationStatusSucceeded {
		h.discardIntermediateAsset(ctx, current)
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
	if job.Kind == models.OmniChatMediaKindVideo && job.SourceAssetID != nil {
		// Nothing left to condition. The animation phase works from the still,
		// so resolving persona references here would only add a way for an
		// expired avatar to fail a job whose image already rendered correctly.
		signedURL, err := h.resolveSourceImageURL(ctx, job.OwnerUserID, *job.SourceAssetID)
		if err != nil {
			return nil, "", err
		}
		return nil, signedURL, nil
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
	signedURL, err := h.resolveSourceImageURL(ctx, job.OwnerUserID, *job.SourceAssetID)
	if err != nil {
		return nil, "", err
	}
	return references, signedURL, nil
}

// resolveSourceImageURL mints the short-lived URL the video worker fetches its
// initial frame from.
//
// Both callers go through here: a resumed job reads its stored source asset,
// and the image phase passes the still it just created. One implementation
// means one set of checks -- owner scope, image kind, clean scan, and a
// publicly reachable HTTPS host -- rather than a second path that could drift.
func (h *OmniChatGenerationHandler) resolveSourceImageURL(ctx context.Context, ownerUserID int, assetID uuid.UUID) (string, error) {
	sourceAsset, err := h.jobs.GetMediaAssetOwned(ctx, assetID, ownerUserID)
	if err != nil {
		return "", fmt.Errorf("load source asset: %w", err)
	}
	if sourceAsset == nil || sourceAsset.Kind != models.OmniChatMediaKindImage || sourceAsset.ScanStatus != models.MediaScanStatusClean {
		return "", permanentGenerationFailure("source_unavailable", errors.New("source image is unavailable"))
	}
	signedURL, err := h.storage.GetSignedURL(ctx, sourceAsset.StoragePath, 20*time.Minute)
	if err != nil {
		return "", fmt.Errorf("sign source image URL: %w", err)
	}
	if !safeProviderReferenceURL(signedURL) {
		return "", permanentGenerationFailure("source_unreachable", errors.New("source image is not externally reachable over HTTPS"))
	}
	return signedURL, nil
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

// appendDirective adds a server-owned sentence to a prompt.
//
// Contextual prompts are built ending in a full stop, so plain concatenation
// reads correctly today. It is one sentence away from not doing: a prompt
// ending without punctuation would produce "...at the park Render the image
// photorealistically", which is one sentence to a model rather than two.
func appendDirective(prompt, directive string) string {
	prompt = strings.TrimRight(strings.TrimSpace(prompt), " ")
	if prompt == "" {
		return directive
	}
	if last := prompt[len(prompt)-1]; last != '.' && last != '!' && last != '?' {
		prompt += "."
	}
	return prompt + " " + directive
}

// BuildImageSpec is the provider adapter boundary for image renders. Domain
// requests do not leak RunPod endpoint details into handlers, persistence, or
// frontend code. The worker receives this stable input contract and owns
// model/runtime selection inside its endpoint image.
//
// A video job's first phase calls this too, with the same scene, identity
// profile, references and prompt a Scene photo would get. That sharing is the
// whole point of the two-phase design: identity conditioning is written once.
func BuildImageSpec(cfg config.OmniChatMediaConfig, job *models.OmniChatGenerationJob, referenceURLs []string) (*RunPodGenerationSpec, error) {
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
	providerMode := string(job.Mode)
	if providerMode == "" {
		providerMode = string(models.OmniChatGenerationModeCreate)
	}
	// The provider knows three modes and a likeness is not a fourth. It is a
	// plain text-to-image with a server-built prompt, so it goes as create;
	// sending a word the worker has never seen would be a contract change for
	// something that needs no new behaviour from it.
	if providerMode == string(models.OmniChatGenerationModeLikeness) {
		providerMode = string(models.OmniChatGenerationModeCreate)
	}
	if providerMode == string(models.OmniChatGenerationModeImageToVideo) {
		return nil, errors.New("image-to-video is not an image render mode")
	}
	aspectRatio := job.AspectRatio
	if aspectRatio == "" {
		if job.Kind == models.OmniChatMediaKindVideo {
			aspectRatio = "16:9"
		} else {
			aspectRatio = "1:1"
		}
	}

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

		// The medium, stated where the persona is known. The prompt is built
		// when the request arrives and cannot know it: an anime character
		// rendered through a prompt that says "photorealistic" comes back as a
		// photograph, contradicting the answer she was made with.
		//
		// Contextual only. This is a scene of a particular character, and her
		// medium governs it. A Create-mode prompt is somebody's own words --
		// appending this there answered "a watercolour painting of a
		// lighthouse" with "Render the image photorealistically."
		//
		// What is sent therefore differs from job.EffectivePrompt, which is
		// stored. That column is internal (json:"-") and never reaches a
		// client, but somebody reading it to work out why an image came back
		// wrong will not see this sentence in it.
		input["prompt"] = appendDirective(prompt, models.RenderMediumSentence(job.IdentityProfile.RenderStyle))
	}
	for key, value := range identityInput {
		input[key] = value
	}
	if len(referenceURLs) > 0 {
		input["reference_image_urls"] = referenceURLs
	}
	// The image phase is where every explicit pixel is produced, so it is also
	// the only place the content entitlement changes anything.
	endpointID := strings.TrimSpace(cfg.RunPodImageEndpointID)
	if job.AllowNSFW {
		if nsfwEndpointID := strings.TrimSpace(cfg.RunPodNSFWImageEndpointID); nsfwEndpointID != "" {
			endpointID = nsfwEndpointID
		}
	}
	if endpointID == "" {
		return nil, fmt.Errorf("%w: image generation endpoint", runpod.ErrEndpointNotConfigured)
	}
	return &RunPodGenerationSpec{EndpointID: endpointID, Input: input}, nil
}

// BuildVideoSpec animates an existing still. There is no other video path:
// the worker has no text-to-video pipeline, because a clip generated from a
// prompt alone carries no identity conditioning and renders a different person.
//
// Neither references nor the identity profile are sent. Identity is already
// baked into the source frame, and passing a reference photo here is exactly
// how the previous worker ended up animating the persona's avatar in the
// avatar's own setting instead of the requested scene.
func BuildVideoSpec(cfg config.OmniChatMediaConfig, job *models.OmniChatGenerationJob, sourceURL string) (*RunPodGenerationSpec, error) {
	if job == nil {
		return nil, errors.New("generation job is required")
	}
	sourceURL = strings.TrimSpace(sourceURL)
	if sourceURL == "" {
		return nil, errors.New("image-to-video source is unavailable")
	}
	if !safeProviderReferenceURL(sourceURL) {
		return nil, errors.New("provider source image URL is invalid")
	}
	// The still already describes appearance and setting. Repeating either here
	// only gives the video model something to contradict, so the prompt carries
	// motion alone.
	prompt := strings.TrimSpace(services.BuildOmniChatVideoMotionPrompt(job.Mode, job.Prompt, job.Scene))
	if prompt == "" {
		return nil, errors.New("generation prompt is unavailable")
	}
	durationSeconds := job.DurationSeconds
	if durationSeconds == 0 {
		durationSeconds = 5
	}
	// No aspect ratio: the worker derives the frame from the source still's own
	// dimensions. Sending one would invite a mismatch that letterboxes or crops
	// the framing the image phase just produced.
	input := map[string]any{
		"kind":             "video",
		"mode":             string(models.OmniChatGenerationModeImageToVideo),
		"prompt":           prompt,
		"negative_prompt":  strings.TrimSpace(job.NegativePrompt),
		"duration_seconds": durationSeconds,
		"source_image_url": sourceURL,
	}
	endpointID := strings.TrimSpace(cfg.RunPodVideoEndpointID)
	if endpointID == "" {
		return nil, fmt.Errorf("%w: video generation endpoint", runpod.ErrEndpointNotConfigured)
	}
	return &RunPodGenerationSpec{EndpointID: endpointID, Input: input}, nil
}
