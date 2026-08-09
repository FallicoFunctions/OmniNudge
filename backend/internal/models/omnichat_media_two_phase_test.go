package models_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

type twoPhaseFixture struct {
	db           *database.Database
	repo         *models.OmniChatMediaRepository
	ownerID      int
	conversation int
	job          *models.OmniChatGenerationJob
}

// newTwoPhaseVideoFixture creates a running scene-video job, which is the state
// the queue is in when its image phase finishes.
func newTwoPhaseVideoFixture(t *testing.T, ctx context.Context) *twoPhaseFixture {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "om_two_phase_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, userRepo.Create(ctx, owner))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, visibility, source_format, is_active)
		VALUES ('two-phase-persona', 'Two Phase', 'original', 'Stay in character.', 'public', 'native', TRUE)
		RETURNING id
	`).Scan(&personaID))

	conversationRepo := models.NewBotConversationRepository(db.Pool)
	conversation, err := conversationRepo.Create(ctx, owner.ID, personaID, nil, nil)
	require.NoError(t, err)

	normalized, err := services.NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind:            models.OmniChatMediaKindVideo,
		Mode:            models.OmniChatGenerationModeContextual,
		PersonaID:       personaID,
		ConversationID:  &conversation.ID,
		Prompt:          "show me the scene",
		DurationSeconds: 5,
		Scene:           models.OmniChatSceneState{Location: "the balcony"},
	})
	require.NoError(t, err)

	repo := models.NewOmniChatMediaRepository(db.Pool)
	job, err := repo.CreateGenerationJob(ctx, owner.ID, withGenerationBillingReservation(t, ctx, db.Pool, owner.ID, normalized), "test")
	require.NoError(t, err)
	marked, err := repo.MarkGenerationJobRunning(ctx, job.ID, "image-request")
	require.NoError(t, err)
	require.True(t, marked)

	return &twoPhaseFixture{db: db, repo: repo, ownerID: owner.ID, conversation: conversation.ID, job: job}
}

func generatedMediaFor(ownerID int, jobID uuid.UUID, extension, contentType string) *models.MediaFile {
	return &models.MediaFile{
		UserID: ownerID, Filename: "generated" + extension, OriginalFilename: "generated" + extension,
		FileType: contentType, FileSize: 2048,
		StorageURL:  fmt.Sprintf("/uploads/omnichat/generated/%d/%s%s", ownerID, jobID, extension),
		StoragePath: fmt.Sprintf("omnichat/generated/%d/%s%s", ownerID, jobID, extension),
		ScanStatus:  models.MediaScanStatusClean,
	}
}

func TestAttachIntermediateAssetStoresTheStillWithoutCompletingTheJob(t *testing.T) {
	ctx := context.Background()
	fixture := newTwoPhaseVideoFixture(t, ctx)

	still := &models.OmniChatMediaAsset{}
	require.NoError(t, fixture.repo.AttachIntermediateAsset(
		ctx, fixture.job.ID,
		generatedMediaFor(fixture.ownerID, fixture.job.ID, ".png", "image/png"),
		still, models.OmniChatMediaKindImage, 1<<30, 50<<30,
		models.OmniChatGenerationProvenance{WorkerBuild: "image-v40", ActualPrompt: "the rendered still prompt"},
	))

	// The artifact is an image even though the job is a video. Reading the kind
	// off the job row here would hand the gallery a PNG labelled as a clip.
	require.Equal(t, models.OmniChatMediaKindImage, still.Kind)

	stored, err := fixture.repo.GetGenerationJobOwned(ctx, fixture.job.ID, fixture.ownerID)
	require.NoError(t, err)
	require.Equal(t, models.OmniChatGenerationStatusRunning, stored.Status,
		"the job must stay running so its animation phase can follow")
	require.NotNil(t, stored.SourceAssetID)
	require.Equal(t, still.ID, *stored.SourceAssetID)
	require.Empty(t, stored.ProviderJobID,
		"clearing the provider request is what tells a retry to submit the animation")
	require.Nil(t, stored.OutputAssetID)

	// No chat message: a photo reply to a video request is noise.
	messages, err := models.NewBotMessageRepository(fixture.db.Pool).ListByConversationID(ctx, fixture.conversation, 20)
	require.NoError(t, err)
	require.Empty(t, messages)
}

func TestTwoPhaseJobKeepsBothWorkerBuilds(t *testing.T) {
	ctx := context.Background()
	fixture := newTwoPhaseVideoFixture(t, ctx)

	require.NoError(t, fixture.repo.AttachIntermediateAsset(
		ctx, fixture.job.ID,
		generatedMediaFor(fixture.ownerID, fixture.job.ID, ".png", "image/png"),
		&models.OmniChatMediaAsset{}, models.OmniChatMediaKindImage, 1<<30, 50<<30,
		models.OmniChatGenerationProvenance{WorkerBuild: "image-v40", ActualPrompt: "still prompt"},
	))
	started, err := fixture.repo.StartGenerationSecondPhase(ctx, fixture.job.ID, "video-request")
	require.NoError(t, err)
	require.True(t, started)

	clip := &models.OmniChatMediaAsset{}
	require.NoError(t, fixture.repo.CompleteGenerationJob(
		ctx, fixture.job.ID,
		generatedMediaFor(fixture.ownerID, fixture.job.ID, ".mp4", "video/mp4"),
		clip, 1<<30, 50<<30,
		models.OmniChatGenerationProvenance{WorkerBuild: "video-v1", ActualPrompt: "motion prompt"},
	))

	completed, err := fixture.repo.GetGenerationJobOwned(ctx, fixture.job.ID, fixture.ownerID)
	require.NoError(t, err)
	require.Equal(t, models.OmniChatGenerationStatusSucceeded, completed.Status)
	require.Equal(t, clip.ID, *completed.OutputAssetID)

	// Which image rendered which stage is the whole point of the build stamp.
	// Overwriting provider_metadata would erase the still's.
	var metadata struct {
		WorkerBuild string `json:"worker_build"`
		Source      struct {
			WorkerBuild  string `json:"worker_build"`
			ActualPrompt string `json:"actual_prompt"`
		} `json:"source"`
	}
	require.NoError(t, json.Unmarshal(completed.ProviderMetadata, &metadata))
	require.Equal(t, "video-v1", metadata.WorkerBuild)
	require.Equal(t, "image-v40", metadata.Source.WorkerBuild)
	require.Equal(t, "still prompt", metadata.Source.ActualPrompt)
}

func TestOneJobCanOwnBothAStillAndAClip(t *testing.T) {
	// Migration 137 made generation_job_id UNIQUE, which made the second insert
	// fail outright. This is the constraint 173 removes.
	ctx := context.Background()
	fixture := newTwoPhaseVideoFixture(t, ctx)

	require.NoError(t, fixture.repo.AttachIntermediateAsset(
		ctx, fixture.job.ID,
		generatedMediaFor(fixture.ownerID, fixture.job.ID, ".png", "image/png"),
		&models.OmniChatMediaAsset{}, models.OmniChatMediaKindImage, 1<<30, 50<<30,
		models.OmniChatGenerationProvenance{},
	))
	_, err := fixture.repo.StartGenerationSecondPhase(ctx, fixture.job.ID, "video-request")
	require.NoError(t, err)
	require.NoError(t, fixture.repo.CompleteGenerationJob(
		ctx, fixture.job.ID,
		generatedMediaFor(fixture.ownerID, fixture.job.ID, ".mp4", "video/mp4"),
		&models.OmniChatMediaAsset{}, 1<<30, 50<<30,
		models.OmniChatGenerationProvenance{},
	))

	var kinds []string
	rows, err := fixture.db.Pool.Query(ctx,
		`SELECT kind FROM omnichat_media_assets WHERE generation_job_id = $1 ORDER BY created_at`, fixture.job.ID)
	require.NoError(t, err)
	defer rows.Close()
	for rows.Next() {
		var kind string
		require.NoError(t, rows.Scan(&kind))
		kinds = append(kinds, kind)
	}
	require.NoError(t, rows.Err())
	require.Equal(t, []string{"image", "video"}, kinds)
}

func TestStartGenerationSecondPhaseIsACompareAndSwap(t *testing.T) {
	ctx := context.Background()
	fixture := newTwoPhaseVideoFixture(t, ctx)

	// Nothing to animate yet: the image phase has not committed.
	started, err := fixture.repo.StartGenerationSecondPhase(ctx, fixture.job.ID, "video-request")
	require.NoError(t, err)
	require.False(t, started, "the animation cannot start before the still exists")

	require.NoError(t, fixture.repo.AttachIntermediateAsset(
		ctx, fixture.job.ID,
		generatedMediaFor(fixture.ownerID, fixture.job.ID, ".png", "image/png"),
		&models.OmniChatMediaAsset{}, models.OmniChatMediaKindImage, 1<<30, 50<<30,
		models.OmniChatGenerationProvenance{},
	))

	started, err = fixture.repo.StartGenerationSecondPhase(ctx, fixture.job.ID, "video-request")
	require.NoError(t, err)
	require.True(t, started)

	// A second worker that also submitted must lose and cancel its duplicate,
	// rather than overwrite the request id that is already being polled.
	started, err = fixture.repo.StartGenerationSecondPhase(ctx, fixture.job.ID, "duplicate-request")
	require.NoError(t, err)
	require.False(t, started)

	stored, err := fixture.repo.GetGenerationJobOwned(ctx, fixture.job.ID, fixture.ownerID)
	require.NoError(t, err)
	require.Equal(t, "video-request", stored.ProviderJobID)
}

func TestStartGenerationSecondPhaseRejectsAnEmptyRequestID(t *testing.T) {
	// Storing an empty id writes NULL, which is indistinguishable from "the
	// animation has not started" and would make a retry submit a second render.
	ctx := context.Background()
	fixture := newTwoPhaseVideoFixture(t, ctx)

	_, err := fixture.repo.StartGenerationSecondPhase(ctx, fixture.job.ID, "  ")
	require.EqualError(t, err, "provider request id is required")
}

func TestAttachIntermediateAssetRejectsATerminalJob(t *testing.T) {
	ctx := context.Background()
	fixture := newTwoPhaseVideoFixture(t, ctx)

	cancelled, err := fixture.repo.CancelGenerationJobOwned(ctx, fixture.job.ID, fixture.ownerID)
	require.NoError(t, err)
	require.True(t, cancelled)

	err = fixture.repo.AttachIntermediateAsset(
		ctx, fixture.job.ID,
		generatedMediaFor(fixture.ownerID, fixture.job.ID, ".png", "image/png"),
		&models.OmniChatMediaAsset{}, models.OmniChatMediaKindImage, 1<<30, 50<<30,
		models.OmniChatGenerationProvenance{},
	)
	require.Error(t, err, "a cancelled job must not gain media after the fact")
}

func TestTheIntermediateStillCanBeDiscarded(t *testing.T) {
	// The queue deletes this still when the animation phase never produces a
	// clip. DeleteMediaAssetOwned refuses paths outside the generated prefix
	// and anything shared, so the intermediate has to satisfy both.
	ctx := context.Background()
	fixture := newTwoPhaseVideoFixture(t, ctx)

	still := &models.OmniChatMediaAsset{}
	require.NoError(t, fixture.repo.AttachIntermediateAsset(
		ctx, fixture.job.ID,
		generatedMediaFor(fixture.ownerID, fixture.job.ID, ".png", "image/png"),
		still, models.OmniChatMediaKindImage, 1<<30, 50<<30,
		models.OmniChatGenerationProvenance{},
	))

	deleted, err := fixture.repo.DeleteMediaAssetOwned(ctx, still.ID, fixture.ownerID)
	require.NoError(t, err)
	require.True(t, deleted)

	// The storage object goes through the durable deletion queue rather than
	// being dropped on the floor.
	var queued int
	require.NoError(t, fixture.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path = $1`,
		still.StoragePath).Scan(&queued))
	require.Equal(t, 1, queued)

	// source_asset_id is ON DELETE SET NULL, so the failed row stops looking
	// like a job whose animation phase is merely pending.
	stored, err := fixture.repo.GetGenerationJobOwned(ctx, fixture.job.ID, fixture.ownerID)
	require.NoError(t, err)
	require.Nil(t, stored.SourceAssetID)
}
