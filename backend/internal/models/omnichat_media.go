package models

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

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
	Pose            string   `json:"pose,omitempty"`
	Expression      string   `json:"expression,omitempty"`
	Mood            string   `json:"mood,omitempty"`
	CameraDirection string   `json:"camera_direction,omitempty"`
	OtherCharacters []string `json:"other_characters,omitempty"`
	RecentEvents    []string `json:"recent_events,omitempty"`
}

// OmniChatGenerationRequest is accepted by both contextual chat generation
// and the dedicated Create experience. EffectivePrompt is server-computed and
// never accepted from a client.
type OmniChatGenerationRequest struct {
	Kind            OmniChatMediaKind      `json:"kind"`
	Mode            OmniChatGenerationMode `json:"mode"`
	PersonaID       int                    `json:"persona_id"`
	ConversationID  *int                   `json:"conversation_id,omitempty"`
	SourceMessageID *int                   `json:"source_message_id,omitempty"`
	SourceAssetID   *uuid.UUID             `json:"source_asset_id,omitempty"`
	Prompt          string                 `json:"prompt"`
	NegativePrompt  string                 `json:"negative_prompt,omitempty"`
	AspectRatio     string                 `json:"aspect_ratio,omitempty"`
	DurationSeconds int                    `json:"duration_seconds,omitempty"`
	Scene           OmniChatSceneState     `json:"scene,omitempty"`
	EffectivePrompt string                 `json:"-"`
}

// OmniChatGenerationJob is an asynchronous image/video generation request.
// Provider error details are kept internal; ErrorCode is safe for clients.
type OmniChatGenerationJob struct {
	ID               uuid.UUID                `json:"id"`
	OwnerUserID      int                      `json:"owner_user_id"`
	PersonaID        int                      `json:"persona_id"`
	ConversationID   *int                     `json:"conversation_id,omitempty"`
	SourceMessageID  *int                     `json:"source_message_id,omitempty"`
	SourceAssetID    *uuid.UUID               `json:"source_asset_id,omitempty"`
	OutputAssetID    *uuid.UUID               `json:"output_asset_id,omitempty"`
	OutputMessageID  *int                     `json:"output_message_id,omitempty"`
	Kind             OmniChatMediaKind        `json:"kind"`
	Mode             OmniChatGenerationMode   `json:"mode"`
	Status           OmniChatGenerationStatus `json:"status"`
	Prompt           string                   `json:"prompt"`
	NegativePrompt   string                   `json:"negative_prompt,omitempty"`
	EffectivePrompt  string                   `json:"-"`
	AspectRatio      string                   `json:"aspect_ratio"`
	DurationSeconds  int                      `json:"duration_seconds,omitempty"`
	Scene            OmniChatSceneState       `json:"scene"`
	Provider         string                   `json:"provider,omitempty"`
	ProviderJobID    string                   `json:"-"`
	Progress         int                      `json:"progress"`
	ErrorCode        string                   `json:"error_code,omitempty"`
	ProviderMetadata json.RawMessage          `json:"-"`
	CreatedAt        time.Time                `json:"created_at"`
	StartedAt        *time.Time               `json:"started_at,omitempty"`
	CompletedAt      *time.Time               `json:"completed_at,omitempty"`
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

var ErrOmniChatStorageQuotaExceeded = errors.New("omnichat storage quota exceeded")

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
	var duration any
	if request.DurationSeconds > 0 {
		duration = request.DurationSeconds
	}
	err = r.pool.QueryRow(ctx, `
		INSERT INTO omnichat_generation_jobs (
			id, owner_user_id, persona_id, conversation_id, source_message_id,
			source_asset_id, kind, mode, prompt, negative_prompt, effective_prompt,
			aspect_ratio, duration_seconds, scene_snapshot, provider
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NULLIF($15, ''))
		RETURNING created_at, progress
	`, job.ID, ownerUserID, request.PersonaID, request.ConversationID, request.SourceMessageID,
		request.SourceAssetID, request.Kind, request.Mode, request.Prompt, request.NegativePrompt,
		request.EffectivePrompt, request.AspectRatio, duration, sceneJSON, provider,
	).Scan(&job.CreatedAt, &job.Progress)
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
`

func scanOmniChatGenerationJob(scanner interface{ Scan(...any) error }) (*OmniChatGenerationJob, error) {
	job := &OmniChatGenerationJob{}
	var sceneJSON []byte
	err := scanner.Scan(
		&job.ID, &job.OwnerUserID, &job.PersonaID, &job.ConversationID, &job.SourceMessageID,
		&job.SourceAssetID, &job.OutputAssetID, &job.OutputMessageID, &job.Kind, &job.Mode, &job.Status, &job.Prompt,
		&job.NegativePrompt, &job.EffectivePrompt, &job.AspectRatio, &job.DurationSeconds,
		&sceneJSON, &job.Provider, &job.ProviderJobID, &job.Progress, &job.ErrorCode,
		&job.ProviderMetadata, &job.CreatedAt, &job.StartedAt, &job.CompletedAt,
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
		    provider_job_id = NULLIF($2, ''), started_at = COALESCE(started_at, NOW())
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
		SET progress = GREATEST(progress, $2)
		WHERE id = $1 AND status = 'running'
	`, id, progress)
	return err
}

func (r *OmniChatMediaRepository) MarkGenerationJobFailed(ctx context.Context, id uuid.UUID, safeCode, providerError string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		SET status = 'failed', error_code = $2, provider_error = $3,
		    completed_at = NOW()
		WHERE id = $1 AND status IN ('queued', 'running')
	`, id, safeCode, providerError)
	return err
}

func (r *OmniChatMediaRepository) CancelGenerationJobOwned(ctx context.Context, id uuid.UUID, ownerUserID int) (bool, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		SET status = 'cancelled', cancelled_at = NOW(), completed_at = NOW()
		WHERE id = $1 AND owner_user_id = $2 AND status IN ('queued', 'running')
	`, id, ownerUserID)
	return tag.RowsAffected() > 0, err
}

// CompleteGenerationJob atomically creates the media file and private gallery
// asset, then links the job output. Callers must persist/scan the bytes first.
func (r *OmniChatMediaRepository) CompleteGenerationJob(ctx context.Context, jobID uuid.UUID, media *MediaFile, asset *OmniChatMediaAsset, freeTierBytes, proTierBytes int64) error {
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

	var ownerUserID, personaID int
	var conversationID, sourceMessageID *int
	var kind OmniChatMediaKind
	var prompt string
	var sceneJSON []byte
	err = tx.QueryRow(ctx, `
		SELECT owner_user_id, persona_id, conversation_id, source_message_id, kind, prompt, scene_snapshot
		FROM omnichat_generation_jobs
		WHERE id = $1 AND status = 'running'
		FOR UPDATE
	`, jobID).Scan(&ownerUserID, &personaID, &conversationID, &sourceMessageID, &kind, &prompt, &sceneJSON)
	if err != nil {
		return err
	}
	if media.UserID != ownerUserID {
		return errors.New("media owner does not match generation job owner")
	}
	if freeTierBytes <= 0 || proTierBytes < freeTierBytes {
		return errors.New("invalid media storage quota configuration")
	}
	var storageUsed int64
	var plan, role string
	var planExpiresAt *time.Time
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(storage_used_bytes, 0), plan, plan_expires_at, role
		FROM users
		WHERE id = $1
		FOR UPDATE
	`, ownerUserID).Scan(&storageUsed, &plan, &planExpiresAt, &role)
	if err != nil {
		return err
	}
	storageLimit := freeTierBytes
	paidActive := plan == "paid" && (planExpiresAt == nil || planExpiresAt.After(time.Now()))
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

	asset.ID = uuid.New()
	asset.OwnerUserID = ownerUserID
	asset.PersonaID = personaID
	asset.ConversationID = conversationID
	asset.SourceMessageID = sourceMessageID
	asset.GenerationJobID = jobID
	asset.MediaFileID = media.ID
	asset.Kind = kind
	asset.Visibility = OmniChatAssetVisibilityPrivate
	asset.Prompt = prompt
	asset.StoragePath = media.StoragePath
	asset.StorageURL = media.StorageURL
	asset.FileType = media.FileType
	asset.ScanStatus = media.ScanStatus
	if err := json.Unmarshal(sceneJSON, &asset.Scene); err != nil {
		return fmt.Errorf("decode asset scene: %w", err)
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO omnichat_media_assets (
			id, owner_user_id, persona_id, conversation_id, source_message_id,
			generation_job_id, media_file_id, kind, visibility, prompt,
			scene_snapshot, width, height, duration_seconds, safety_status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'private',$9,$10,$11,$12,$13,'approved')
		RETURNING created_at
	`, asset.ID, ownerUserID, personaID, conversationID, sourceMessageID,
		jobID, media.ID, kind, prompt, sceneJSON, asset.Width, asset.Height, asset.DurationSeconds,
	).Scan(&asset.CreatedAt)
	if err != nil {
		return err
	}

	var outputMessageID *int
	if conversationID != nil {
		messageText := "Here is the scene you asked for."
		if kind == OmniChatMediaKindVideo {
			messageText = "Here is the scene in motion."
		}
		createdMessageID := 0
		err = tx.QueryRow(ctx, `
			INSERT INTO bot_messages (conversation_id, role, content, failed)
			VALUES ($1, $2, $3, FALSE)
			RETURNING id
		`, *conversationID, BotMessageRoleAssistant, messageText).Scan(&createdMessageID)
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

	tag, err := tx.Exec(ctx, `
		UPDATE omnichat_generation_jobs
		SET status = 'succeeded', progress = 100, output_asset_id = $2,
		    output_message_id = $3,
		    completed_at = NOW(), provider_error = NULL
		WHERE id = $1 AND status = 'running'
	`, jobID, asset.ID, outputMessageID)
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
	err := r.pool.QueryRow(ctx, `
		SELECT scene_state FROM bot_conversations
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, conversationID, ownerUserID).Scan(&sceneJSON)
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
	return scene, nil
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
