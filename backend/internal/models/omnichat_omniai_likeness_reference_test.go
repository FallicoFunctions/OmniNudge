package models_test

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

func runningReferenceJob(t *testing.T, ctx context.Context, db *database.Database,
	repo *models.OmniChatMediaRepository, ownerID, personaID, nth int) *models.OmniChatGenerationJob {
	t.Helper()
	normalized, err := services.NormalizeOmniChatReferenceRequest(models.OmniChatGenerationRequest{
		Kind:      models.OmniChatMediaKindImage,
		PersonaID: personaID,
		Prompt:    fmt.Sprintf("Reference image of one person. Variant %d.", nth),
	}, services.OmniAIReferenceVariantKeys()[nth%len(services.OmniAIReferenceVariantKeys())])
	require.NoError(t, err)
	job, err := repo.CreateGenerationJob(ctx, ownerID, normalized, "test")
	require.NoError(t, err)
	marked, err := repo.MarkGenerationJobRunning(ctx, job.ID, fmt.Sprintf("ref-%d", nth))
	require.NoError(t, err)
	require.True(t, marked)
	_ = db
	return job
}

func referencesOf(t *testing.T, ctx context.Context, db *database.Database, personaID int) []string {
	t.Helper()
	var extensions []byte
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT extensions_json FROM bot_personas WHERE id = $1`, personaID).Scan(&extensions))
	var blob struct {
		Media models.OmniChatMediaIdentityProfile `json:"omnichat_media"`
	}
	require.NoError(t, json.Unmarshal(extensions, &blob))
	return blob.Media.ReferenceURLs
}

func TestASupportingReferenceIsNeitherChosenNorOwned(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	job := runningReferenceJob(t, ctx, db, repo, ownerID, personaID, 1)
	media := likenessMediaFor(ownerID, job)
	require.NoError(t, repo.AttachLikenessReference(ctx, job.ID, media,
		1<<30, 50<<30, models.OmniChatGenerationProvenance{}))

	// Nobody chooses it and nobody is shown it: no candidate row, no asset.
	var candidates, assets int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_omniai_likeness_candidates WHERE generation_job_id = $1`,
		job.ID).Scan(&candidates))
	require.Zero(t, candidates)
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_assets WHERE generation_job_id = $1`, job.ID).Scan(&assets))
	require.Zero(t, assets)

	// Its whole life is one entry in what renders are conditioned on.
	require.Equal(t, []string{media.StorageURL}, referencesOf(t, ctx, db, personaID))
}

func TestTheAnchorIsNeverPushedOutByItsOwnSupport(t *testing.T) {
	// The list is mean-pooled, so overrunning it would dilute the picture
	// somebody actually chose out of the character's own identity.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	anchor := candidates[0]
	_, err := repo.PickLikeness(ctx, personaID, ownerID, anchor.ID)
	require.NoError(t, err)

	limit := models.DefaultOmniChatMediaIdentityProfile().ReferenceLimit
	for nth := 1; nth <= limit+3; nth++ {
		job := runningReferenceJob(t, ctx, db, repo, ownerID, personaID, nth)
		require.NoError(t, repo.AttachLikenessReference(ctx, job.ID, likenessMediaFor(ownerID, job),
			1<<30, 50<<30, models.OmniChatGenerationProvenance{}))
	}

	references := referencesOf(t, ctx, db, personaID)
	require.Len(t, references, limit)
	require.Equal(t, anchor.StorageURL, references[0], "the picture somebody chose stays first")
}

func TestFiveReferencesLandingAtOnceAllArrive(t *testing.T) {
	// They render independently and finish in any order, and appending to her
	// reference list is a read-modify-write.
	//
	// This asserts the outcome, not the mechanism: removing the identity row
	// lock does not reproduce a loss, because the storage quota check already
	// takes a row lock on the owner and all five share one. The lock stays
	// anyway -- the invariant belongs to this row rather than to an incidental
	// side effect of counting storage -- but a passing test here is not
	// evidence that it is load-bearing.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	jobs := make([]*models.OmniChatGenerationJob, 0, 5)
	for nth := 1; nth <= 5; nth++ {
		jobs = append(jobs, runningReferenceJob(t, ctx, db, repo, ownerID, personaID, nth))
	}

	var wg sync.WaitGroup
	errs := make([]error, len(jobs))
	start := make(chan struct{})
	for i, job := range jobs {
		wg.Add(1)
		go func(n int, j *models.OmniChatGenerationJob) {
			defer wg.Done()
			<-start
			errs[n] = repo.AttachLikenessReference(ctx, j.ID, likenessMediaFor(ownerID, j),
				1<<30, 50<<30, models.OmniChatGenerationProvenance{})
		}(i, job)
	}
	close(start)
	wg.Wait()

	for i, err := range errs {
		require.NoError(t, err, "reference %d", i)
	}
	require.Len(t, referencesOf(t, ctx, db, personaID), 5, "none of them overwrote another")
}

func TestARetryDoesNotSpendATwiceOnTheSamePicture(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	job := runningReferenceJob(t, ctx, db, repo, ownerID, personaID, 1)
	media := likenessMediaFor(ownerID, job)
	require.NoError(t, repo.AttachLikenessReference(ctx, job.ID, media,
		1<<30, 50<<30, models.OmniChatGenerationProvenance{}))

	// The job is finished, so a second attach is refused outright -- but the
	// duplicate guard is what protects the list if one ever gets through.
	err := repo.AttachLikenessReference(ctx, job.ID, media,
		1<<30, 50<<30, models.OmniChatGenerationProvenance{})
	require.Error(t, err)
	require.Len(t, referencesOf(t, ctx, db, personaID), 1)
}

func TestALikenessCannotBeStoredAsAReference(t *testing.T) {
	// They are told apart by the job row, so the wrong path has to be refused
	// rather than quietly storing a candidate where nobody will ever see it.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	job := runningLikenessJob(t, ctx, db, repo, ownerID, personaID, 1)
	err := repo.AttachLikenessReference(ctx, job.ID, likenessMediaFor(ownerID, job),
		1<<30, 50<<30, models.OmniChatGenerationProvenance{})
	require.Error(t, err)
	require.Contains(t, err.Error(), "not a likeness reference")
	require.Empty(t, referencesOf(t, ctx, db, personaID))
}

func TestAReferenceForAFaceNobodyKeptCannotLand(t *testing.T) {
	// Choosing again is what a re-roll is. Before this, a reference still
	// rendering for the previous choice landed afterwards and appended to the
	// new anchor's list -- so she was conditioned on one picture of the person
	// somebody chose and one of somebody else, silently.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	first := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	_, err := repo.PickLikeness(ctx, personaID, ownerID, first[0].ID)
	require.NoError(t, err)
	stale := runningReferenceJob(t, ctx, db, repo, ownerID, personaID, 1)

	second := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	anchor := second[0]
	_, err = repo.PickLikeness(ctx, personaID, ownerID, anchor.ID)
	require.NoError(t, err)

	// The render for the face nobody kept finally arrives.
	err = repo.AttachLikenessReference(ctx, stale.ID, likenessMediaFor(ownerID, stale),
		1<<30, 50<<30, models.OmniChatGenerationProvenance{})
	require.Error(t, err, "a cancelled render has nothing to attach to")

	require.Equal(t, []string{anchor.StorageURL}, referencesOf(t, ctx, db, personaID),
		"she is conditioned only on the face somebody actually kept")

	var status string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT status FROM omnichat_generation_jobs WHERE id = $1`, stale.ID).Scan(&status))
	require.Equal(t, "cancelled", status)
}

func TestChoosingDoesNotRetireAnotherCharactersReferences(t *testing.T) {
	// The cancellation is scoped to her. A creator with two characters must not
	// lose one's pictures by settling the other's face.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	var otherPersonaID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO bot_personas (slug, name, category, system_prompt, visibility,
			source_format, is_active, owner_user_id, response_style_profile, nursery_home)
		VALUES ('sofia-l', 'Sofia', 'original', '', 'private', 'native', TRUE, $1,
			'direct_message', 'home')
		RETURNING id`, ownerID).Scan(&otherPersonaID))
	otherRender := runningReferenceJob(t, ctx, db, repo, ownerID, otherPersonaID, 1)

	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	_, err := repo.PickLikeness(ctx, personaID, ownerID, candidates[0].ID)
	require.NoError(t, err)

	var status string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT status FROM omnichat_generation_jobs WHERE id = $1`, otherRender.ID).Scan(&status))
	require.Equal(t, "running", status, "the other character's render is untouched")
}

func TestChoosingAgainTakesTheOldSupportingPicturesWithIt(t *testing.T) {
	// A supporting reference is held by nothing but the identity list -- no
	// asset row, no foreign key -- and nothing sweeps unreferenced media files.
	// Replacing the list without removing them stranded five images in storage
	// per re-roll, paid for and unreachable forever.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	first := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	oldAnchor := first[0]
	_, err := repo.PickLikeness(ctx, personaID, ownerID, oldAnchor.ID)
	require.NoError(t, err)

	support := runningReferenceJob(t, ctx, db, repo, ownerID, personaID, 1)
	supportMedia := likenessMediaFor(ownerID, support)
	require.NoError(t, repo.AttachLikenessReference(ctx, support.ID, supportMedia,
		1<<30, 50<<30, models.OmniChatGenerationProvenance{}))
	require.Len(t, referencesOf(t, ctx, db, personaID), 2)

	// Choosing again.
	second := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	_, err = repo.PickLikeness(ctx, personaID, ownerID, second[0].ID)
	require.NoError(t, err)

	var supportFiles int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM media_files WHERE id = $1`, supportMedia.ID).Scan(&supportFiles))
	require.Zero(t, supportFiles, "the orphaned picture is gone")

	var queued int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path = $1`,
		supportMedia.StoragePath).Scan(&queued))
	require.Equal(t, 1, queued, "and its stored object goes to the retention worker")
}

func TestAPictureSomebodyOwnsSurvivesChoosingAgain(t *testing.T) {
	// The previous anchor is in the replaced list too, and it is a picture they
	// chose and can still see in their gallery. Deleting it would take a
	// gallery item away from somebody for changing their mind, and its own
	// foreign key would refuse the delete anyway.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	first := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	oldAnchor := first[0]
	_, err := repo.PickLikeness(ctx, personaID, ownerID, oldAnchor.ID)
	require.NoError(t, err)

	second := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	newAnchor := second[0]
	_, err = repo.PickLikeness(ctx, personaID, ownerID, newAnchor.ID)
	require.NoError(t, err)

	for _, kept := range []int{oldAnchor.MediaFileID, newAnchor.MediaFileID} {
		var files int
		require.NoError(t, db.Pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM media_files WHERE id = $1`, kept).Scan(&files))
		require.Equal(t, 1, files)
	}
	require.Equal(t, []string{newAnchor.StorageURL}, referencesOf(t, ctx, db, personaID))
}
