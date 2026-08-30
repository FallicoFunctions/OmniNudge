package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OmniChatMediaKind string

const (
	OmniChatMediaKindImage OmniChatMediaKind = "image"
	OmniChatMediaKindVideo OmniChatMediaKind = "video"
)

type OmniChatGenerationMode string

const (
	OmniChatGenerationModeCreate       OmniChatGenerationMode = "create"
	OmniChatGenerationModeContextual   OmniChatGenerationMode = "contextual"
	OmniChatGenerationModeImageToVideo OmniChatGenerationMode = "image_to_video"

	// OmniChatGenerationModeLikeness is her first picture: one of the four a
	// creator chooses her face from.
	//
	// Its own mode because nothing else about it is like a scene. There is no
	// conversation, no scene state and no prompt of somebody's own -- the whole
	// instruction is built by the server from her description -- and it must not
	// produce a gallery asset, because three of the four are discarded.
	//
	// The provider is never told this word. It knows create, contextual and
	// image_to_video, and a likeness is a plain text-to-image, so it is sent as
	// create. This mode is how *this* system tells its own paths apart.
	OmniChatGenerationModeLikeness OmniChatGenerationMode = "likeness"
)

type OmniChatGenerationStatus string

const (
	OmniChatGenerationStatusQueued    OmniChatGenerationStatus = "queued"
	OmniChatGenerationStatusRunning   OmniChatGenerationStatus = "running"
	OmniChatGenerationStatusSucceeded OmniChatGenerationStatus = "succeeded"
	OmniChatGenerationStatusFailed    OmniChatGenerationStatus = "failed"
	OmniChatGenerationStatusCancelled OmniChatGenerationStatus = "cancelled"
)

type OmniChatAssetVisibility string

const (
	OmniChatAssetVisibilityPrivate OmniChatAssetVisibility = "private"
	OmniChatAssetVisibilityPublic  OmniChatAssetVisibility = "public"
)

// OmniChatSceneState is the structured, provider-neutral description of the
// current role-play scene. A copy is stored on every generation job so media
// remains reproducible even after the conversation moves on.
type OmniChatSceneState struct {
	Location        string   `json:"location,omitempty"`
	TimeOfDay       string   `json:"time_of_day,omitempty"`
	Weather         string   `json:"weather,omitempty"`
	Lighting        string   `json:"lighting,omitempty"`
	Activity        string   `json:"activity,omitempty"`
	Outfit          string   `json:"outfit,omitempty"`
	Accessories     []string `json:"accessories,omitempty"`
	Pose            string   `json:"pose,omitempty"`
	Expression      string   `json:"expression,omitempty"`
	Mood            string   `json:"mood,omitempty"`
	CameraDirection string   `json:"camera_direction,omitempty"`
	// ViewerPosition is where the user's body is in the scene. The image is shot
	// from the user's point of view, so this decides what is in the foreground:
	// a user lying on the bed must see the bed, not the character standing in
	// front of it with the bed behind her.
	ViewerPosition string `json:"viewer_position,omitempty"`
	// SubjectAppearance is the persona's stable physical description, resolved
	// from the persona rather than from conversation state.
	SubjectAppearance string   `json:"subject_appearance,omitempty"`
	OtherCharacters   []string `json:"other_characters,omitempty"`
	RecentEvents      []string `json:"recent_events,omitempty"`
	// IncludeUserBody is server-derived, never client-supplied. Scene images
	// are shot from the user's point of view and show the persona alone unless
	// the tracked interaction actually puts the user's body in frame.
	IncludeUserBody bool `json:"include_user_body,omitempty"`
}

// OmniChatGenerationRequest is accepted by both contextual chat generation
// and the dedicated Create experience. EffectivePrompt is server-computed and
// never accepted from a client.
type OmniChatGenerationRequest struct {
	Kind               OmniChatMediaKind      `json:"kind"`
	Mode               OmniChatGenerationMode `json:"mode"`
	PersonaID          int                    `json:"persona_id"`
	ConversationID     *int                   `json:"conversation_id,omitempty"`
	SourceMessageID    *int                   `json:"source_message_id,omitempty"`
	SourceAssetID      *uuid.UUID             `json:"source_asset_id,omitempty"`
	Prompt             string                 `json:"prompt"`
	NegativePrompt     string                 `json:"negative_prompt,omitempty"`
	AspectRatio        string                 `json:"aspect_ratio,omitempty"`
	DurationSeconds    int                    `json:"duration_seconds,omitempty"`
	Scene              OmniChatSceneState     `json:"scene,omitempty"`
	RequestID          uuid.UUID              `json:"request_id,omitempty"`
	EffectivePrompt    string                 `json:"-"`
	BillingOperationID *uuid.UUID             `json:"-"`
	// BillingRequired is server-owned. Normal media jobs must carry a durable
	// OmniCredits reservation; only the persisted administrator entitlement may
	// explicitly set this false.
	BillingRequired *bool `json:"-"`
	// AllowNSFW is server-owned and resolved from the caller's plan. It is not
	// a client-settable field: a browser must never be able to select the
	// explicit-content endpoint by adding a key to its request body.
	AllowNSFW bool `json:"-"`
}

// OmniChatMediaCommandRequest is the narrow request accepted by the chat
// media-command endpoint. The conversation and persona are resolved from the
// authenticated route; callers cannot choose either one in this payload.
type OmniChatMediaCommandRequest struct {
	RequestID       uuid.UUID         `json:"request_id"`
	Kind            OmniChatMediaKind `json:"kind"`
	Prompt          string            `json:"prompt"`
	AspectRatio     string            `json:"aspect_ratio,omitempty"`
	DurationSeconds int               `json:"duration_seconds,omitempty"`
}

// OmniChatGenerationJob is an asynchronous image/video generation request.
// Provider error details are kept internal; ErrorCode is safe for clients.
type OmniChatGenerationJob struct {
	ID                 uuid.UUID                `json:"id"`
	OwnerUserID        int                      `json:"owner_user_id"`
	PersonaID          int                      `json:"persona_id"`
	ConversationID     *int                     `json:"conversation_id,omitempty"`
	SourceMessageID    *int                     `json:"source_message_id,omitempty"`
	SourceAssetID      *uuid.UUID               `json:"source_asset_id,omitempty"`
	OutputAssetID      *uuid.UUID               `json:"output_asset_id,omitempty"`
	OutputMessageID    *int                     `json:"output_message_id,omitempty"`
	Kind               OmniChatMediaKind        `json:"kind"`
	Mode               OmniChatGenerationMode   `json:"mode"`
	Status             OmniChatGenerationStatus `json:"status"`
	Prompt             string                   `json:"prompt"`
	NegativePrompt     string                   `json:"negative_prompt,omitempty"`
	EffectivePrompt    string                   `json:"-"`
	AspectRatio        string                   `json:"aspect_ratio"`
	DurationSeconds    int                      `json:"duration_seconds,omitempty"`
	Scene              OmniChatSceneState       `json:"scene"`
	Provider           string                   `json:"provider,omitempty"`
	ProviderJobID      string                   `json:"-"`
	Progress           int                      `json:"progress"`
	ErrorCode          string                   `json:"error_code,omitempty"`
	ProviderMetadata   json.RawMessage          `json:"-"`
	BillingOperationID *uuid.UUID               `json:"-"`
	CreatedAt          time.Time                `json:"created_at"`
	StartedAt          *time.Time               `json:"started_at,omitempty"`
	CompletedAt        *time.Time               `json:"completed_at,omitempty"`
	BillingRequired    bool                     `json:"-"`
	// AllowNSFW is the explicit-content entitlement resolved when the job was
	// created. The queue worker has no user context and must read the decision
	// off the row rather than re-deriving it.
	AllowNSFW bool `json:"-"`
	// IdentityProfile is resolved from the persona immediately before provider
	// submission. It is intentionally transient: generation jobs retain the
	// scene/prompt snapshot, while deployable model paths remain server config.
	IdentityProfile OmniChatMediaIdentityProfile `json:"-"`
}

type OmniChatMediaCursor struct {
	CreatedAt time.Time
	ID        uuid.UUID
}

// OmniChatMediaAsset is a private-by-default gallery item backed by a media
// file. Storage paths are deliberately omitted from its JSON representation.
type OmniChatMediaAsset struct {
	ID              uuid.UUID               `json:"id"`
	OwnerUserID     int                     `json:"owner_user_id"`
	PersonaID       int                     `json:"persona_id"`
	ConversationID  *int                    `json:"conversation_id,omitempty"`
	SourceMessageID *int                    `json:"source_message_id,omitempty"`
	GenerationJobID uuid.UUID               `json:"generation_job_id"`
	MediaFileID     int                     `json:"-"`
	Kind            OmniChatMediaKind       `json:"kind"`
	Visibility      OmniChatAssetVisibility `json:"visibility"`
	Prompt          string                  `json:"prompt"`
	Scene           OmniChatSceneState      `json:"scene"`
	Width           *int                    `json:"width,omitempty"`
	Height          *int                    `json:"height,omitempty"`
	DurationSeconds *int                    `json:"duration_seconds,omitempty"`
	ThumbnailURL    *string                 `json:"thumbnail_url,omitempty"`
	ContentURL      string                  `json:"content_url,omitempty"`
	StoragePath     string                  `json:"-"`
	StorageURL      string                  `json:"-"`
	FileType        string                  `json:"file_type"`
	ScanStatus      string                  `json:"-"`
	CreatedAt       time.Time               `json:"created_at"`
}

// OmniChatMessageMediaAsset is the deliberately minimal attachment shape
// returned with chat messages. Full gallery assets contain private prompts,
// scene history, and generation provenance that must not cross into a
// continued public-chat reader's private conversation.
type OmniChatMessageMediaAsset struct {
	ID              uuid.UUID               `json:"id"`
	OwnerUserID     int                     `json:"-"`
	Kind            OmniChatMediaKind       `json:"kind"`
	Visibility      OmniChatAssetVisibility `json:"visibility"`
	Width           *int                    `json:"width,omitempty"`
	Height          *int                    `json:"height,omitempty"`
	DurationSeconds *int                    `json:"duration_seconds,omitempty"`
	ThumbnailURL    *string                 `json:"thumbnail_url,omitempty"`
	ContentURL      string                  `json:"content_url,omitempty"`
	FileType        string                  `json:"file_type"`
	CreatedAt       time.Time               `json:"created_at"`
}

// OmniChatMediaRepository owns generated jobs/assets and keeps every read
// ownership-scoped unless a method explicitly says Accessible.
type OmniChatMediaRepository struct {
	pool *pgxpool.Pool
}

var (
	ErrOmniChatStorageQuotaExceeded = errors.New("omnichat storage quota exceeded")
	ErrOmniChatMediaInUse           = errors.New("omnichat media is used by shared content")
)

func NewOmniChatMediaRepository(pool *pgxpool.Pool) *OmniChatMediaRepository {
	return &OmniChatMediaRepository{pool: pool}
}

func (r *OmniChatMediaRepository) CreateGenerationJob(ctx context.Context, ownerUserID int, request OmniChatGenerationRequest, provider string) (*OmniChatGenerationJob, error) {
	sceneJSON, err := json.Marshal(request.Scene)
	if err != nil {
		return nil, fmt.Errorf("marshal scene: %w", err)
	}
	job := &OmniChatGenerationJob{
		ID:              uuid.New(),
		OwnerUserID:     ownerUserID,
		PersonaID:       request.PersonaID,
		ConversationID:  request.ConversationID,
		SourceMessageID: request.SourceMessageID,
		SourceAssetID:   request.SourceAssetID,
		Kind:            request.Kind,
		Mode:            request.Mode,
		Status:          OmniChatGenerationStatusQueued,
		Prompt:          request.Prompt,
		NegativePrompt:  request.NegativePrompt,
		EffectivePrompt: request.EffectivePrompt,
		AspectRatio:     request.AspectRatio,
		DurationSeconds: request.DurationSeconds,
		Scene:           request.Scene,
		Provider:        provider,
	}
	billingRequired := true
	if request.BillingRequired != nil {
		billingRequired = *request.BillingRequired
	}
	job.BillingRequired = billingRequired
	job.AllowNSFW = request.AllowNSFW
	var duration any
	if request.DurationSeconds > 0 {
		duration = request.DurationSeconds
	}
	query := `
		INSERT INTO omnichat_generation_jobs (
			id, owner_user_id, persona_id, conversation_id, source_message_id,
			source_asset_id, kind, mode, prompt, negative_prompt, effective_prompt,
			aspect_ratio, duration_seconds, scene_snapshot, provider, billing_operation_id, billing_required,
			allow_nsfw
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NULLIF($15, ''), $16, $17, $18)
		RETURNING created_at, progress
	`
	if request.RequestID == uuid.Nil {
		err = r.pool.QueryRow(ctx, query, job.ID, ownerUserID, request.PersonaID, request.ConversationID, request.SourceMessageID,
			request.SourceAssetID, request.Kind, request.Mode, request.Prompt, request.NegativePrompt,
			request.EffectivePrompt, request.AspectRatio, duration, sceneJSON, provider, request.BillingOperationID, billingRequired,
			request.AllowNSFW,
		).Scan(&job.CreatedAt, &job.Progress)
	} else {
		tx, beginErr := r.pool.BeginTx(ctx, pgx.TxOptions{})
		if beginErr != nil {
			return nil, beginErr
		}
		defer func() { _ = tx.Rollback(ctx) }()
		err = tx.QueryRow(ctx, query, job.ID, ownerUserID, request.PersonaID, request.ConversationID, request.SourceMessageID,
			request.SourceAssetID, request.Kind, request.Mode, request.Prompt, request.NegativePrompt,
			request.EffectivePrompt, request.AspectRatio, duration, sceneJSON, provider, request.BillingOperationID, billingRequired,
			request.AllowNSFW,
		).Scan(&job.CreatedAt, &job.Progress)
		if err == nil {
			err = completeOmniChatRequestInTx(ctx, tx, OmniChatRequestCompletion{UserID: ownerUserID, RequestID: request.RequestID}, job)
		}
		if err == nil {
			err = tx.Commit(ctx)
		}
	}
	if err != nil {
		return nil, err
	}
	return job, nil
}

const omniChatGenerationJobSelect = `
	id, owner_user_id, persona_id, conversation_id, source_message_id,
	source_asset_id, output_asset_id, output_message_id, kind, mode, status, prompt,
	negative_prompt, effective_prompt, aspect_ratio,
	COALESCE(duration_seconds, 0), scene_snapshot, COALESCE(provider, ''),
	COALESCE(provider_job_id, ''), progress, COALESCE(error_code, ''),
	provider_metadata, created_at, started_at, completed_at
	,billing_operation_id, billing_required, allow_nsfw
`

func scanOmniChatGenerationJob(scanner interface{ Scan(...any) error }) (*OmniChatGenerationJob, error) {
	job := &OmniChatGenerationJob{}
	var sceneJSON []byte
	err := scanner.Scan(
		&job.ID, &job.OwnerUserID, &job.PersonaID, &job.ConversationID, &job.SourceMessageID,
		&job.SourceAssetID, &job.OutputAssetID, &job.OutputMessageID, &job.Kind, &job.Mode, &job.Status, &job.Prompt,
		&job.NegativePrompt, &job.EffectivePrompt, &job.AspectRatio, &job.DurationSeconds,
		&sceneJSON, &job.Provider, &job.ProviderJobID, &job.Progress, &job.ErrorCode,
		&job.ProviderMetadata, &job.CreatedAt, &job.StartedAt, &job.CompletedAt, &job.BillingOperationID,
		&job.BillingRequired, &job.AllowNSFW,
	)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(sceneJSON, &job.Scene); err != nil {
		return nil, fmt.Errorf("decode job scene: %w", err)
	}
	return job, nil
}

func (r *OmniChatMediaRepository) GetGenerationJobOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*OmniChatGenerationJob, error) {
	job, err := scanOmniChatGenerationJob(r.pool.QueryRow(ctx, `
		SELECT `+omniChatGenerationJobSelect+`
		FROM omnichat_generation_jobs
		WHERE id = $1 AND owner_user_id = $2
	`, id, ownerUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return job, err
}

func (r *OmniChatMediaRepository) GetGenerationJobForProcessing(ctx context.Context, id uuid.UUID) (*OmniChatGenerationJob, error) {
	job, err := scanOmniChatGenerationJob(r.pool.QueryRow(ctx, `
		SELECT `+omniChatGenerationJobSelect+`
		FROM omnichat_generation_jobs
		WHERE id = $1
	`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return job, err
}

// GetGenerationJobForSourceMessageOwned finds the provider job created for a
// persisted direct media command. Source messages are owner-scoped so this
// lookup can safely recover an accepted job after a response/idempotency write
// was interrupted.
func (r *OmniChatMediaRepository) GetGenerationJobForSourceMessageOwned(ctx context.Context, ownerUserID, sourceMessageID int) (*OmniChatGenerationJob, error) {
	if ownerUserID <= 0 || sourceMessageID <= 0 {
		return nil, errors.New("generation source lookup requires positive identifiers")
	}
	job, err := scanOmniChatGenerationJob(r.pool.QueryRow(ctx, `
		SELECT `+omniChatGenerationJobSelect+`
		FROM omnichat_generation_jobs
		WHERE owner_user_id = $1 AND source_message_id = $2
		ORDER BY created_at DESC, id DESC
		LIMIT 1
	`, ownerUserID, sourceMessageID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return job, err
}

func (r *OmniChatMediaRepository) ListGenerationJobsOwned(ctx context.Context, ownerUserID, limit int) ([]*OmniChatGenerationJob, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+omniChatGenerationJobSelect+`
		FROM omnichat_generation_jobs
		WHERE owner_user_id = $1
		ORDER BY created_at DESC, id DESC
		LIMIT $2
	`, ownerUserID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	jobs := make([]*OmniChatGenerationJob, 0)
	for rows.Next() {
		job, err := scanOmniChatGenerationJob(rows)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (r *OmniChatMediaRepository) MarkGenerationJobRunning(ctx context.Context, id uuid.UUID, providerJobID string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		SET status = 'running', progress = GREATEST(progress, 1),
		    provider_job_id = NULLIF($2, ''), started_at = COALESCE(started_at, NOW()),
		    last_activity_at=NOW()
		WHERE id = $1 AND status = 'queued'
	`, id, providerJobID)
	return tag.RowsAffected() > 0, err
}

func (r *OmniChatMediaRepository) UpdateGenerationProgress(ctx context.Context, id uuid.UUID, progress int) error {
	if progress < 1 || progress > 99 {
		return errors.New("generation progress must be between 1 and 99")
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		SET progress = GREATEST(progress, $2),last_activity_at=NOW()
		WHERE id = $1 AND status = 'running'
	`, id, progress)
	return err
}

func (r *OmniChatMediaRepository) MarkGenerationJobFailed(ctx context.Context, id uuid.UUID, safeCode, providerError string) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		SET status = 'failed', error_code = $2, provider_error = $3,
		    completed_at = NOW(),last_activity_at=NOW()
		WHERE id = $1 AND status IN ('queued', 'running')
	`, id, safeCode, providerError)
	return tag.RowsAffected() > 0, err
}

func (r *OmniChatMediaRepository) CancelGenerationJobOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		SET status = 'cancelled', cancelled_at = NOW(), completed_at = NOW(),last_activity_at=NOW()
		WHERE id = $1 AND owner_user_id = $2 AND status IN ('queued', 'running')
	`, id, ownerUserID)
	return tag.RowsAffected() > 0, err
}

// CompleteGenerationJob atomically creates the media file and private gallery
// asset, then links the job output. Callers must persist/scan the bytes first.
// OmniChatGenerationProvenance records what actually rendered an asset. The
// worker build is the only reliable way to tell which GPU image served a job:
// a RunPod template can be pointed at a stale tag, which makes prompt changes
// look ineffective when they were simply never deployed.
type OmniChatGenerationProvenance struct {
	WorkerBuild  string `json:"worker_build,omitempty"`
	ActualPrompt string `json:"actual_prompt,omitempty"`
	// LoadSeconds and InferenceSeconds separate model load from sampling, so a
	// slow render can be attributed after the fact. RunPod's own logs have
	// rotated away long before anyone asks why a clip took fifteen minutes.
	LoadSeconds      float64 `json:"load_seconds,omitempty"`
	InferenceSeconds float64 `json:"inference_seconds,omitempty"`
}

const (
	omniChatProvenanceMaxBuildRunes  = 128
	omniChatProvenanceMaxPromptRunes = 4000
)

// encode bounds provider-supplied text before it is stored. The worker is
// trusted infrastructure, but its output still ends up in a JSONB column and
// must not be able to grow a row without limit.
func (p OmniChatGenerationProvenance) encode() ([]byte, error) {
	p.WorkerBuild = boundProvenanceText(p.WorkerBuild, omniChatProvenanceMaxBuildRunes)
	p.ActualPrompt = boundProvenanceText(p.ActualPrompt, omniChatProvenanceMaxPromptRunes)
	return json.Marshal(p)
}

func boundProvenanceText(value string, maximum int) string {
	value = strings.Join(strings.Fields(value), " ")
	if utf8.RuneCountInString(value) <= maximum {
		return value
	}
	return string([]rune(value)[:maximum])
}

// omniChatGenerationJobRow is the job state shared by both persistence paths.
// A video job produces two assets -- an intermediate still and the finished
// clip -- and each write needs the same owner, persona, conversation and scene
// snapshot off the locked job row.
type omniChatGenerationJobRow struct {
	OwnerUserID     int
	PersonaID       int
	ConversationID  *int
	SourceMessageID *int
	Kind            OmniChatMediaKind
	Mode            string
	Prompt          string
	SceneJSON       []byte
}

// lockRunningGenerationJob claims the job for the duration of the transaction.
// Only a running job can gain an asset: a cancelled or already-completed job
// must not have media attached to it after the fact.
func lockRunningGenerationJob(ctx context.Context, tx pgx.Tx, jobID uuid.UUID) (*omniChatGenerationJobRow, error) {
	job := &omniChatGenerationJobRow{}
	err := tx.QueryRow(ctx, `
		SELECT owner_user_id, persona_id, conversation_id, source_message_id, kind, mode, prompt, scene_snapshot
		FROM omnichat_generation_jobs
		WHERE id = $1 AND status = 'running'
		FOR UPDATE
	`, jobID).Scan(&job.OwnerUserID, &job.PersonaID, &job.ConversationID, &job.SourceMessageID,
		&job.Kind, &job.Mode, &job.Prompt, &job.SceneJSON)
	if err != nil {
		return nil, err
	}
	return job, nil
}

// insertGeneratedAsset writes the media file and the private gallery asset.
//
// kind is a parameter rather than the job's own kind because the intermediate
// still of a video job is an image. Reading it off the job row would label the
// PNG a video and hand the gallery an asset the player cannot open.
// insertGeneratedMediaFile charges the render against the owner's storage quota
// and records the file.
//
// Split out because a likeness candidate needs exactly this and nothing after
// it: three of the four are discarded, so a candidate has no asset row and
// never reaches the gallery. The quota still applies -- four renders occupy
// four files' worth of storage whatever becomes of them.
func insertGeneratedMediaFile(
	ctx context.Context,
	tx pgx.Tx,
	job *omniChatGenerationJobRow,
	media *MediaFile,
	freeTierBytes, proTierBytes int64,
) error {
	if media.UserID != job.OwnerUserID {
		return errors.New("media owner does not match generation job owner")
	}
	if freeTierBytes <= 0 || proTierBytes < freeTierBytes {
		return errors.New("invalid media storage quota configuration")
	}
	var storageUsed int64
	var plan, role string
	var planExpiresAt *time.Time
	err := tx.QueryRow(ctx, `
		SELECT COALESCE(storage_used_bytes, 0), plan, plan_expires_at, role
		FROM users
		WHERE id = $1
		FOR UPDATE
	`, job.OwnerUserID).Scan(&storageUsed, &plan, &planExpiresAt, &role)
	if err != nil {
		return err
	}
	storageLimit := freeTierBytes
	paidActive := (plan == PlanPlus || plan == PlanPremium) && (planExpiresAt == nil || planExpiresAt.After(time.Now()))
	if paidActive || role == "admin" || role == "moderator" {
		storageLimit = proTierBytes
	}
	if media.FileSize > storageLimit || storageUsed > storageLimit-media.FileSize {
		return ErrOmniChatStorageQuotaExceeded
	}

	if media.ScanStatus == "" {
		media.ScanStatus = MediaScanStatusPending
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO media_files (
			user_id, filename, original_filename, file_type, file_size,
			storage_url, thumbnail_url, storage_path, width, height, duration,
			used_in_message_id, scan_status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id, uploaded_at, scan_status
	`, media.UserID, media.Filename, media.OriginalFilename, media.FileType, media.FileSize,
		media.StorageURL, media.ThumbnailURL, media.StoragePath, media.Width, media.Height,
		media.Duration, media.UsedInMessageID, media.ScanStatus,
	).Scan(&media.ID, &media.UploadedAt, &media.ScanStatus)
	if err != nil {
		return err
	}

	return nil
}

func insertGeneratedAsset(
	ctx context.Context,
	tx pgx.Tx,
	jobID uuid.UUID,
	job *omniChatGenerationJobRow,
	media *MediaFile,
	asset *OmniChatMediaAsset,
	kind OmniChatMediaKind,
	freeTierBytes, proTierBytes int64,
) error {
	if err := insertGeneratedMediaFile(ctx, tx, job, media, freeTierBytes, proTierBytes); err != nil {
		return err
	}

	asset.ID = uuid.New()
	asset.OwnerUserID = job.OwnerUserID
	asset.PersonaID = job.PersonaID
	asset.ConversationID = job.ConversationID
	asset.SourceMessageID = job.SourceMessageID
	asset.GenerationJobID = jobID
	asset.MediaFileID = media.ID
	asset.Kind = kind
	asset.Visibility = OmniChatAssetVisibilityPrivate
	asset.Prompt = job.Prompt
	asset.StoragePath = media.StoragePath
	asset.StorageURL = media.StorageURL
	asset.FileType = media.FileType
	asset.ScanStatus = media.ScanStatus
	if err := json.Unmarshal(job.SceneJSON, &asset.Scene); err != nil {
		return fmt.Errorf("decode asset scene: %w", err)
	}
	return tx.QueryRow(ctx, `
		INSERT INTO omnichat_media_assets (
			id, owner_user_id, persona_id, conversation_id, source_message_id,
			generation_job_id, media_file_id, kind, visibility, prompt,
			scene_snapshot, width, height, duration_seconds, safety_status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'private',$9,$10,$11,$12,$13,'approved')
		RETURNING created_at
	`, asset.ID, job.OwnerUserID, job.PersonaID, job.ConversationID, job.SourceMessageID,
		jobID, media.ID, kind, job.Prompt, job.SceneJSON, asset.Width, asset.Height, asset.DurationSeconds,
	).Scan(&asset.CreatedAt)
}

// AttachIntermediateAsset stores the still rendered by the first phase of a
// two-phase video job and records it as the job's source image.
//
// It deliberately does not reuse CompleteGenerationJob: that reads the kind off
// the job row (which says video), posts a chat message (a photo message for a
// video request is noise), and marks the job succeeded. Here the job stays
// running so the second phase can animate what was just stored.
func (r *OmniChatMediaRepository) AttachIntermediateAsset(ctx context.Context, jobID uuid.UUID, media *MediaFile, asset *OmniChatMediaAsset, kind OmniChatMediaKind, freeTierBytes, proTierBytes int64, provenance OmniChatGenerationProvenance) error {
	if media == nil || asset == nil {
		return errors.New("generated media metadata is required")
	}
	if media.FileSize <= 0 {
		return errors.New("generated media file size must be positive")
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	job, err := lockRunningGenerationJob(ctx, tx, jobID)
	if err != nil {
		return err
	}
	if err := insertGeneratedAsset(ctx, tx, jobID, job, media, asset, kind, freeTierBytes, proTierBytes); err != nil {
		return err
	}
	provenanceJSON, err := provenance.encode()
	if err != nil {
		return fmt.Errorf("encode generation provenance: %w", err)
	}
	// provider_job_id is cleared in the same statement that sets
	// source_asset_id. Together they are the resume signal: source set with no
	// provider id means the first phase landed and the second has not been
	// submitted, so a retry submits it instead of polling a finished job.
	tag, err := tx.Exec(ctx, `
		UPDATE omnichat_generation_jobs
			SET source_asset_id = $2, provider_job_id = NULL,
			    provider_metadata = COALESCE(provider_metadata, '{}'::jsonb)
			                        || jsonb_build_object('source', $3::jsonb),
			    last_activity_at = NOW()
		WHERE id = $1 AND status = 'running'
	`, jobID, asset.ID, provenanceJSON)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("generation job changed while attaching its source image")
	}
	return tx.Commit(ctx)
}

// StartGenerationSecondPhase records the provider request for the animation
// phase of a two-phase video job.
//
// MarkGenerationJobRunning cannot do this: it only matches a queued job, so it
// would silently no-op here and leave the first phase's provider id on the row
// for a retry to poll. The provider_job_id IS NULL predicate makes this a
// compare-and-swap, so a concurrent worker that already claimed the phase
// causes this one to report false and cancel its duplicate submission.
func (r *OmniChatMediaRepository) StartGenerationSecondPhase(ctx context.Context, id uuid.UUID, providerJobID string) (bool, error) {
	if strings.TrimSpace(providerJobID) == "" {
		return false, errors.New("provider request id is required")
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		SET provider_job_id = $2, last_activity_at = NOW()
		WHERE id = $1 AND status = 'running'
		  AND source_asset_id IS NOT NULL
		  AND provider_job_id IS NULL
	`, id, providerJobID)
	return tag.RowsAffected() > 0, err
}

func (r *OmniChatMediaRepository) CompleteGenerationJob(ctx context.Context, jobID uuid.UUID, media *MediaFile, asset *OmniChatMediaAsset, freeTierBytes, proTierBytes int64, provenance OmniChatGenerationProvenance) error {
	if media == nil || asset == nil {
		return errors.New("generated media metadata is required")
	}
	if media.FileSize <= 0 {
		return errors.New("generated media file size must be positive")
	}
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	job, err := lockRunningGenerationJob(ctx, tx, jobID)
	if err != nil {
		return err
	}
	conversationID := job.ConversationID
	if err := insertGeneratedAsset(ctx, tx, jobID, job, media, asset, job.Kind, freeTierBytes, proTierBytes); err != nil {
		return err
	}

	var outputMessageID *int
	if conversationID != nil {
		createdMessageID := 0
		err = tx.QueryRow(ctx, `
			INSERT INTO bot_messages (conversation_id, role, content, failed, media_only)
			VALUES ($1, $2, '', FALSE, TRUE)
			RETURNING id
		`, *conversationID, BotMessageRoleAssistant).Scan(&createdMessageID)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO bot_message_attachments (message_id, asset_id, position)
			VALUES ($1, $2, 0)
		`, createdMessageID, asset.ID)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			UPDATE bot_conversations SET last_message_at = NOW() WHERE id = $1
		`, *conversationID)
		if err != nil {
			return err
		}
		outputMessageID = &createdMessageID
	}

	provenanceJSON, err := provenance.encode()
	if err != nil {
		return fmt.Errorf("encode generation provenance: %w", err)
	}
	// Merged, not replaced. A two-phase video job already recorded the still's
	// worker build under "source", and that is the only way to tell which image
	// rendered which stage. Merging into '{}' leaves a single-phase job with
	// exactly the object it wrote before.
	tag, err := tx.Exec(ctx, `
		UPDATE omnichat_generation_jobs
			SET status = 'succeeded', progress = 100, output_asset_id = $2,
			    output_message_id = $3,
			    provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) || $4::jsonb,
			    completed_at = NOW(), provider_error = NULL,last_activity_at=NOW()
		WHERE id = $1 AND status = 'running'
	`, jobID, asset.ID, outputMessageID, provenanceJSON)
	if err != nil {
		return err
	}
	if tag.RowsAffected() != 1 {
		return errors.New("generation job changed while completing")
	}
	return tx.Commit(ctx)
}

const omniChatAssetSelect = `
	a.id, a.owner_user_id, a.persona_id, a.conversation_id, a.source_message_id,
	a.generation_job_id, a.media_file_id, a.kind, a.visibility, a.prompt,
	a.scene_snapshot, a.width, a.height, a.duration_seconds, mf.thumbnail_url,
	mf.storage_path, mf.storage_url, mf.file_type, mf.scan_status, a.created_at
`

func scanOmniChatMediaAsset(scanner interface{ Scan(...any) error }) (*OmniChatMediaAsset, error) {
	asset := &OmniChatMediaAsset{}
	var sceneJSON []byte
	err := scanner.Scan(
		&asset.ID, &asset.OwnerUserID, &asset.PersonaID, &asset.ConversationID,
		&asset.SourceMessageID, &asset.GenerationJobID, &asset.MediaFileID,
		&asset.Kind, &asset.Visibility, &asset.Prompt, &sceneJSON, &asset.Width,
		&asset.Height, &asset.DurationSeconds, &asset.ThumbnailURL,
		&asset.StoragePath, &asset.StorageURL, &asset.FileType, &asset.ScanStatus, &asset.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(sceneJSON, &asset.Scene); err != nil {
		return nil, fmt.Errorf("decode asset scene: %w", err)
	}
	return asset, nil
}

func (r *OmniChatMediaRepository) GetMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (*OmniChatMediaAsset, error) {
	asset, err := scanOmniChatMediaAsset(r.pool.QueryRow(ctx, `
		SELECT `+omniChatAssetSelect+`
		FROM omnichat_media_assets a
		JOIN media_files mf ON mf.id = a.media_file_id
		WHERE a.id = $1 AND a.owner_user_id = $2 AND a.deleted_at IS NULL
	`, id, ownerUserID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return asset, err
}

// DeleteMediaAssetOwned removes a private generated asset and its tracked
// media row in one transaction, while placing the backing object in a durable
// deletion outbox. Shared snapshots/publications remain immutable, so assets
// referenced by either must be unpublished and no longer referenced before
// deletion.
func (r *OmniChatMediaRepository) DeleteMediaAssetOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var mediaFileID int
	var storagePath string
	err = tx.QueryRow(ctx, `
		SELECT media_file_id, mf.storage_path
		FROM omnichat_media_assets a
		JOIN media_files mf
		  ON mf.id = a.media_file_id
		 AND mf.user_id = a.owner_user_id
		WHERE a.id = $1 AND a.owner_user_id = $2 AND a.deleted_at IS NULL
		FOR UPDATE OF a, mf
	`, id, ownerUserID).Scan(&mediaFileID, &storagePath)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !IsOmniChatGeneratedStoragePathForOwner(storagePath, ownerUserID) {
		return false, errors.New("refusing to delete media with an invalid storage path")
	}

	var shared bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM omnichat_publications
			WHERE asset_id = $1 AND status <> 'removed'
			UNION ALL
			SELECT 1
			FROM omnichat_chat_snapshot_attachments attachment
			JOIN omnichat_publications publication
			  ON publication.snapshot_id = attachment.snapshot_id
			 AND publication.status <> 'removed'
			WHERE attachment.asset_id = $1
			UNION ALL
			SELECT 1
			FROM omnichat_group_message_attachments
			WHERE asset_id = $1
			UNION ALL
			-- Her face. A likeness is a picture in the gallery like any other
			-- and can be deleted like any other, right up until it is the one
			-- every later render is conditioned on: removing it would take the
			-- character's appearance with it, and nothing downstream would know
			-- why she had stopped looking like herself.
			--
			-- Two ways of asking, because avatar_url alone is not enough to
			-- trust. It is writable through UpdateMedia, and storage_url is not
			-- one shape -- some rows hold /uploads/... and others an absolute
			-- CDN address -- so an edit that changed its form would silently
			-- disarm this and let her face be deleted. The identity reference
			-- list is written by the pick and by nothing else, and it is what
			-- renders are actually conditioned on.
			SELECT 1
			FROM omnichat_media_assets a
			JOIN media_files mf ON mf.id = a.media_file_id
			JOIN bot_personas p ON p.id = a.persona_id
			WHERE a.id = $1
			  AND (
			    p.avatar_url = mf.storage_url
			    OR COALESCE(p.extensions_json #> '{omnichat_media,reference_urls}', '[]'::jsonb)
			         @> to_jsonb(mf.storage_url)
			  )
		)
	`, id).Scan(&shared)
	if err != nil {
		return false, err
	}
	if shared {
		return false, ErrOmniChatMediaInUse
	}

	// Once every public reference has been removed, prune the immutable public
	// copies before deleting their private backing asset. Removed publications
	// are no longer user-visible and retaining them would make deletion
	// impossible because their foreign keys intentionally use RESTRICT.
	if _, err = tx.Exec(ctx, `
		DELETE FROM omnichat_publications
		WHERE asset_id = $1 AND status = 'removed'
	`, id); err != nil {
		return false, err
	}
	if _, err = tx.Exec(ctx, `
		DELETE FROM omnichat_publications
		WHERE snapshot_id IN (
			SELECT snapshot_id
			FROM omnichat_chat_snapshot_attachments
			WHERE asset_id = $1
		) AND status = 'removed'
	`, id); err != nil {
		return false, err
	}
	if _, err = tx.Exec(ctx, `
		DELETE FROM omnichat_chat_snapshots snapshot
		WHERE EXISTS (
			SELECT 1 FROM omnichat_chat_snapshot_attachments attachment
			WHERE attachment.snapshot_id = snapshot.id AND attachment.asset_id = $1
		)
		  AND NOT EXISTS (
			SELECT 1 FROM omnichat_publications publication
			WHERE publication.snapshot_id = snapshot.id
		)
	`, id); err != nil {
		return false, err
	}

	if _, err = tx.Exec(ctx, `
		INSERT INTO omnichat_media_deletion_queue(storage_path, owner_user_id)
		VALUES ($1, $2)
		ON CONFLICT (storage_path) DO NOTHING
	`, storagePath, ownerUserID); err != nil {
		return false, err
	}
	// Media replies are represented by an empty assistant message whose only
	// visible content is the generated asset. Remove that shell when this was
	// its last attachment; otherwise deleting a gallery item would leave an
	// empty turn in the conversation. Messages with text or other attachments
	// remain intact.
	if _, err = tx.Exec(ctx, `
		DELETE FROM bot_messages m
		WHERE m.media_only = TRUE
		  AND m.role = $1
		  AND char_length(m.content) = 0
		  AND EXISTS (
			SELECT 1
			FROM bot_message_attachments target
			WHERE target.message_id = m.id AND target.asset_id = $2
		  )
		  AND NOT EXISTS (
			SELECT 1
			FROM bot_message_attachments remaining
			WHERE remaining.message_id = m.id AND remaining.asset_id <> $2
		  )
	`, BotMessageRoleAssistant, id); err != nil {
		return false, err
	}
	if _, err = tx.Exec(ctx, `DELETE FROM bot_message_attachments WHERE asset_id = $1`, id); err != nil {
		return false, err
	}
	// Keep the conversation ordering metadata accurate after removing a
	// generated reply. The asset still exists at this point, so its original
	// conversation can be used safely; NULL conversation assets need no update.
	//
	// COALESCE to the conversation's own creation time: last_message_at is NOT
	// NULL, and MAX() over no rows is NULL. That happens whenever the asset had
	// no chat message of its own to remove and the conversation has none
	// either -- the intermediate still of a video job deliberately posts no
	// message, so discarding one would otherwise fail on the constraint.
	if _, err = tx.Exec(ctx, `
		UPDATE bot_conversations c
		SET last_message_at = COALESCE(
			(SELECT MAX(m.created_at) FROM bot_messages m WHERE m.conversation_id = c.id),
			c.created_at
		)
		WHERE c.id = (
			SELECT conversation_id FROM omnichat_media_assets WHERE id = $1
		)
	`, id); err != nil {
		return false, err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM omnichat_media_assets WHERE id = $1 AND owner_user_id = $2`, id, ownerUserID)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() != 1 {
		return false, nil
	}
	if _, err = tx.Exec(ctx, `DELETE FROM media_files WHERE id = $1 AND user_id = $2`, mediaFileID, ownerUserID); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func IsOmniChatGeneratedStoragePath(storagePath string) bool {
	if storagePath == "" || strings.Contains(storagePath, `\`) {
		return false
	}
	cleaned := path.Clean(storagePath)
	if cleaned != storagePath {
		return false
	}
	parts := strings.Split(cleaned, "/")
	if len(parts) != 4 || parts[0] != "omnichat" || parts[1] != "generated" {
		return false
	}
	ownerUserID, err := strconv.Atoi(parts[2])
	if err != nil || ownerUserID <= 0 {
		return false
	}
	extension := path.Ext(parts[3])
	switch extension {
	case ".png", ".jpg", ".jpeg", ".webp", ".mp4":
	default:
		return false
	}
	_, err = uuid.Parse(strings.TrimSuffix(parts[3], extension))
	return err == nil
}

func IsOmniChatGeneratedStoragePathForOwner(storagePath string, ownerUserID int) bool {
	if ownerUserID <= 0 || !IsOmniChatGeneratedStoragePath(storagePath) {
		return false
	}
	parts := strings.Split(storagePath, "/")
	pathOwnerUserID, err := strconv.Atoi(parts[2])
	return err == nil && pathOwnerUserID == ownerUserID
}

func (r *OmniChatMediaRepository) ListMediaAssetsOwned(ctx context.Context, ownerUserID int, kind *OmniChatMediaKind, before *OmniChatMediaCursor, limit int) ([]*OmniChatMediaAsset, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	var beforeTime *time.Time
	var beforeID *uuid.UUID
	if before != nil {
		beforeTime = &before.CreatedAt
		beforeID = &before.ID
	}
	rows, err := r.pool.Query(ctx, `
		SELECT `+omniChatAssetSelect+`
		FROM omnichat_media_assets a
		JOIN media_files mf ON mf.id = a.media_file_id
		WHERE a.owner_user_id = $1 AND a.deleted_at IS NULL
		  AND ($2::VARCHAR IS NULL OR a.kind = $2)
		  AND ($3::timestamptz IS NULL OR (a.created_at, a.id) < ($3, $4))
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT $5
	`, ownerUserID, kind, beforeTime, beforeID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	assets := make([]*OmniChatMediaAsset, 0)
	for rows.Next() {
		asset, err := scanOmniChatMediaAsset(rows)
		if err != nil {
			return nil, err
		}
		assets = append(assets, asset)
	}
	return assets, rows.Err()
}

func (r *OmniChatMediaRepository) SetConversationSceneOwned(ctx context.Context, conversationID, ownerUserID int, scene OmniChatSceneState) (bool, error) {
	sceneJSON, err := json.Marshal(scene)
	if err != nil {
		return false, err
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE bot_conversations SET scene_state = $3
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, conversationID, ownerUserID, sceneJSON)
	return tag.RowsAffected() > 0, err
}

func (r *OmniChatMediaRepository) GetConversationSceneOwned(ctx context.Context, conversationID, ownerUserID int) (*OmniChatSceneState, error) {
	var sceneJSON []byte
	var continuityJSON []byte
	err := r.pool.QueryRow(ctx, `
		SELECT c.scene_state, COALESCE(s.state, '{}'::jsonb)
		FROM bot_conversations c
		LEFT JOIN omnichat_conversation_scene_states s
			ON s.conversation_id = c.id AND s.owner_user_id = c.user_id
		WHERE c.id = $1 AND c.user_id = $2 AND c.archived_at IS NULL
	`, conversationID, ownerUserID).Scan(&sceneJSON, &continuityJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	scene := &OmniChatSceneState{}
	if err := json.Unmarshal(sceneJSON, scene); err != nil {
		return nil, err
	}
	if len(continuityJSON) > 0 && string(continuityJSON) != "{}" {
		var continuity OmniChatConversationSceneState
		if err := json.Unmarshal(continuityJSON, &continuity); err == nil {
			mergeConversationContinuityIntoMediaScene(scene, continuity)
		}
	}
	return scene, nil
}

// mergeConversationContinuityIntoMediaScene bridges the newer server-owned
// scene-state record into the provider-neutral media scene contract. Legacy
// per-conversation scene fields remain authoritative when present; continuity
// fills only missing visual facts so older callers and dedicated Create-page
// requests remain backwards compatible.
func mergeConversationContinuityIntoMediaScene(scene *OmniChatSceneState, continuity OmniChatConversationSceneState) {
	if scene == nil {
		return
	}
	fill := func(target *string, values ...string) {
		if *target != "" {
			return
		}
		for _, value := range values {
			if strings.TrimSpace(value) != "" {
				*target = value
				return
			}
		}
	}
	// A physical room description beats a bare place name: an image model can
	// draw "stone walls, iron rings, a single caged bulb" but not "dungeon".
	fill(&scene.Location, continuity.Setting.Description, continuity.Setting.Place, continuity.Location)
	fill(&scene.Activity, continuity.Event.Action)
	fill(&scene.TimeOfDay, continuity.Setting.TimeOfDay)
	fill(&scene.Lighting, continuity.Setting.Lighting)
	fill(&scene.Pose, continuity.Staging.PersonaPose)
	fill(&scene.Expression, continuity.Staging.PersonaExpression)
	fill(&scene.Mood, continuity.Staging.Mood)
	fill(&scene.CameraDirection, continuity.Staging.Proximity)

	persona := continuity.actor(OmniChatSceneActorPersona)
	if persona != nil {
		// Outfit must stay clothing-only. Appending body state to it produced
		// "black latex bodysuit with red lace trim; standing in front of the bed
		// with dirty blonde hair", which is not something a renderer can dress
		// a character in and wastes a scarce prompt-token budget.
		fill(&scene.Outfit, persona.Appearance.Outfit)
		fill(&scene.Pose, persona.Appearance.BodyState)
		if len(scene.Accessories) == 0 {
			scene.Accessories = append(scene.Accessories, persona.Appearance.Accessories...)
		}
	}

	// The shot is from the user's point of view, so their tracked position is a
	// camera fact even when their body is not in frame.
	if viewer := continuity.actor(OmniChatSceneActorUser); viewer != nil {
		fill(&scene.ViewerPosition, viewer.Appearance.BodyState)
	}

	if len(scene.OtherCharacters) == 0 {
		for _, actor := range continuity.Actors {
			if actor.Kind == OmniChatSceneActorNPC && actor.Label != "" {
				scene.OtherCharacters = append(scene.OtherCharacters, actor.Label)
			}
		}
	}
	scene.IncludeUserBody = continuity.UserBodyIsVisible()
}

func (s OmniChatConversationSceneState) actor(kind OmniChatSceneActorKind) *OmniChatSceneActor {
	for index := range s.Actors {
		if s.Actors[index].Kind == kind {
			return &s.Actors[index]
		}
	}
	return nil
}

// GetRecentConversationEventsOwned returns a compact chronological transcript
// for scene grounding. Ownership is enforced in SQL and content is bounded
// before it can enter a provider prompt.
func (r *OmniChatMediaRepository) GetRecentConversationEventsOwned(ctx context.Context, conversationID, ownerUserID, limit int) ([]string, error) {
	if limit < 1 || limit > 10 {
		limit = 5
	}
	rows, err := r.pool.Query(ctx, `
		SELECT role, LEFT(content, 145)
		FROM (
			SELECT m.id, m.role, m.content
			FROM bot_messages m
			JOIN bot_conversations c ON c.id = m.conversation_id
			WHERE m.conversation_id = $1 AND c.user_id = $2
			ORDER BY m.id DESC
			LIMIT $3
		) recent
		ORDER BY id ASC
	`, conversationID, ownerUserID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]string, 0, limit)
	for rows.Next() {
		var role string
		var content string
		if err := rows.Scan(&role, &content); err != nil {
			return nil, err
		}
		label := "User"
		if role == BotMessageRoleAssistant {
			label = "Character"
		}
		events = append(events, label+": "+content)
	}
	return events, rows.Err()
}

func (r *OmniChatMediaRepository) MessageBelongsToConversation(ctx context.Context, messageID, conversationID int) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM bot_messages WHERE id = $1 AND conversation_id = $2
		)
	`, messageID, conversationID).Scan(&exists)
	return exists, err
}

func (r *OmniChatMediaRepository) AttachAssetToMessageOwned(ctx context.Context, messageID int, assetID uuid.UUID, ownerUserID int) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// The next attachment position is derived from existing rows. Serialize
	// writers for this message so concurrent attaches cannot collide on the
	// (message_id, position) uniqueness constraint.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(68422, $1)`, messageID); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO bot_message_attachments (message_id, asset_id, position)
		SELECT m.id, a.id,
		       COALESCE((SELECT MAX(position) + 1 FROM bot_message_attachments WHERE message_id = m.id), 0)
		FROM bot_messages m
		JOIN bot_conversations c ON c.id = m.conversation_id
		JOIN omnichat_media_assets a ON a.id = $2 AND a.owner_user_id = $3 AND a.deleted_at IS NULL
		WHERE m.id = $1 AND c.user_id = $3
		  AND (a.conversation_id IS NULL OR a.conversation_id = c.id)
		ON CONFLICT (message_id, asset_id) DO NOTHING
	`, messageID, assetID, ownerUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return tx.Commit(ctx)
}
