package models_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

func newLikenessFixture(t *testing.T, ctx context.Context) (*database.Database, *models.OmniChatMediaRepository, int, int) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	users := models.NewUserRepository(db.Pool)
	owner := &models.User{Username: "likeness_owner", PasswordHash: "hash", Role: "user"}
	require.NoError(t, users.Create(ctx, owner))

	var personaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, visibility,
			source_format, is_active, owner_user_id, response_style_profile, nursery_home,
			extensions_json)
		VALUES ('nadia-l', 'Nadia', 'original', '', 'private', 'native', TRUE, $1,
			'direct_message', 'home',
			'{"omnichat_media":{"appearance":"A 27-year-old woman with long black hair.","render_style":"anime"}}'::jsonb)
		RETURNING id`, owner.ID).Scan(&personaID))

	return db, models.NewOmniChatMediaRepository(db.Pool), owner.ID, personaID
}

func runningLikenessJob(t *testing.T, ctx context.Context, db *database.Database,
	repo *models.OmniChatMediaRepository, ownerID, personaID int, nth int) *models.OmniChatGenerationJob {
	t.Helper()
	normalized, err := services.NormalizeOmniChatLikenessRequest(models.OmniChatGenerationRequest{
		Kind:      models.OmniChatMediaKindImage,
		PersonaID: personaID,
		Prompt:    fmt.Sprintf("Full-body reference image of one person. Candidate %d.", nth),
	})
	require.NoError(t, err)
	job, err := repo.CreateGenerationJob(ctx, ownerID, normalized, "test")
	require.NoError(t, err)
	marked, err := repo.MarkGenerationJobRunning(ctx, job.ID, fmt.Sprintf("req-%d", nth))
	require.NoError(t, err)
	require.True(t, marked)
	return job
}

func likenessMediaFor(ownerID int, job *models.OmniChatGenerationJob) *models.MediaFile {
	return &models.MediaFile{
		UserID: ownerID, Filename: "candidate.png", OriginalFilename: "candidate.png",
		FileType: "image/png", FileSize: 2048,
		StorageURL:  fmt.Sprintf("/uploads/omnichat/generated/%d/%s.png", ownerID, job.ID),
		StoragePath: fmt.Sprintf("omnichat/generated/%d/%s.png", ownerID, job.ID),
		ScanStatus:  models.MediaScanStatusClean,
	}
}

func TestACandidateIsNeverAGalleryAsset(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	job := runningLikenessJob(t, ctx, db, repo, ownerID, personaID, 1)
	candidate, err := repo.AttachLikenessCandidate(ctx, job.ID, likenessMediaFor(ownerID, job),
		1<<30, 50<<30, models.OmniChatGenerationProvenance{WorkerBuild: "image-v51"})
	require.NoError(t, err)
	require.NotZero(t, candidate.ID)

	// The whole reason candidates are their own table. Three of four are
	// discarded, and an asset row would put them in the owner's gallery, in the
	// data export, and within reach of publication.
	var assets int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_assets WHERE generation_job_id = $1`, job.ID).Scan(&assets))
	require.Zero(t, assets)

	// The file itself does exist -- it has to, it is a real picture.
	var files int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM media_files WHERE id = $1`, candidate.MediaFileID).Scan(&files))
	require.Equal(t, 1, files)
}

func TestDiscardingACandidateTakesItsPictureWithIt(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	job := runningLikenessJob(t, ctx, db, repo, ownerID, personaID, 1)
	candidate, err := repo.AttachLikenessCandidate(ctx, job.ID, likenessMediaFor(ownerID, job),
		1<<30, 50<<30, models.OmniChatGenerationProvenance{})
	require.NoError(t, err)

	// The candidate row must not hold the file hostage: the foreign key is
	// CASCADE precisely so discarding is one delete of the file.
	_, err = db.Pool.Exec(ctx, `DELETE FROM media_files WHERE id = $1`, candidate.MediaFileID)
	require.NoError(t, err, "the row tracking a candidate must not block the delete that discards it")

	var rows int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_omniai_likeness_candidates WHERE id = $1`, candidate.ID).Scan(&rows))
	require.Zero(t, rows)

	var queued int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path = $1`,
		candidate.StoragePath).Scan(&queued))
	require.Equal(t, 1, queued, "and the stored object goes to the retention worker")
}

func TestHerCandidatesComeBackInTheOrderTheyWereAskedFor(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	var wanted []int64
	for nth := 1; nth <= 4; nth++ {
		job := runningLikenessJob(t, ctx, db, repo, ownerID, personaID, nth)
		candidate, err := repo.AttachLikenessCandidate(ctx, job.ID, likenessMediaFor(ownerID, job),
			1<<30, 50<<30, models.OmniChatGenerationProvenance{})
		require.NoError(t, err)
		wanted = append(wanted, candidate.ID)
	}

	got, err := repo.ListLikenessCandidates(ctx, personaID, ownerID)
	require.NoError(t, err)
	require.Len(t, got, 4)
	for i, one := range got {
		require.Equal(t, wanted[i], one.ID, "renders finish out of order; the choice must not")
		require.NotEmpty(t, one.StorageURL)
	}

	// Scoped to the owner, like everything else about her.
	none, err := repo.ListLikenessCandidates(ctx, personaID, ownerID+1000)
	require.NoError(t, err)
	require.Empty(t, none)
}

func TestASceneRenderCannotBeStoredAsALikeness(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	conversations := models.NewBotConversationRepository(db.Pool)
	conversation, err := conversations.Create(ctx, ownerID, personaID, nil, nil)
	require.NoError(t, err)

	normalized, err := services.NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeContextual,
		PersonaID: personaID, ConversationID: &conversation.ID, Prompt: "her at the park",
	})
	require.NoError(t, err)
	job, err := repo.CreateGenerationJob(ctx, ownerID,
		withGenerationBillingReservation(t, ctx, db.Pool, ownerID, normalized), "test")
	require.NoError(t, err)
	_, err = repo.MarkGenerationJobRunning(ctx, job.ID, "req-scene")
	require.NoError(t, err)

	// Stored here it would be a picture the user paid for and can never see.
	// Refusing says which path was wrong instead of losing it quietly.
	_, err = repo.AttachLikenessCandidate(ctx, job.ID, likenessMediaFor(ownerID, job),
		1<<30, 50<<30, models.OmniChatGenerationProvenance{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "not a likeness")
}

func TestOnlyRendersStillOnTheirWayCountAsPending(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	// Four asked for; two have landed.
	jobs := make([]*models.OmniChatGenerationJob, 0, 4)
	for nth := 1; nth <= 4; nth++ {
		jobs = append(jobs, runningLikenessJob(t, ctx, db, repo, ownerID, personaID, nth))
	}
	for _, job := range jobs[:2] {
		_, err := repo.AttachLikenessCandidate(ctx, job.ID, likenessMediaFor(ownerID, job),
			1<<30, 50<<30, models.OmniChatGenerationProvenance{})
		require.NoError(t, err)
	}

	pending, err := repo.PendingLikenessCount(ctx, personaID, ownerID)
	require.NoError(t, err)
	require.Equal(t, 2, pending, "two are still running")

	// One fails. It is not pending: nothing will ever deliver it, and saying so
	// is what lets the picker stop waiting.
	_, err = db.Pool.Exec(ctx,
		`UPDATE omnichat_generation_jobs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
		jobs[2].ID)
	require.NoError(t, err)

	pending, err = repo.PendingLikenessCount(ctx, personaID, ownerID)
	require.NoError(t, err)
	require.Equal(t, 1, pending)

	// Scoped to her owner, like everything else about her.
	none, err := repo.PendingLikenessCount(ctx, personaID, ownerID+1000)
	require.NoError(t, err)
	require.Zero(t, none)
}

func TestAScenesRenderIsNotOneOfHerPictures(t *testing.T) {
	// The count asks for likeness jobs. A scene generating at the same moment
	// would otherwise read as a picture still on its way and the picker would
	// wait for something that was never going to appear in it.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	conversations := models.NewBotConversationRepository(db.Pool)
	conversation, err := conversations.Create(ctx, ownerID, personaID, nil, nil)
	require.NoError(t, err)

	normalized, err := services.NormalizeOmniChatGenerationRequest(models.OmniChatGenerationRequest{
		Kind: models.OmniChatMediaKindImage, Mode: models.OmniChatGenerationModeContextual,
		PersonaID: personaID, ConversationID: &conversation.ID, Prompt: "her at the park",
	})
	require.NoError(t, err)
	job, err := repo.CreateGenerationJob(ctx, ownerID,
		withGenerationBillingReservation(t, ctx, db.Pool, ownerID, normalized), "test")
	require.NoError(t, err)
	_, err = repo.MarkGenerationJobRunning(ctx, job.ID, "req-scene")
	require.NoError(t, err)

	pending, err := repo.PendingLikenessCount(ctx, personaID, ownerID)
	require.NoError(t, err)
	require.Zero(t, pending)
}
