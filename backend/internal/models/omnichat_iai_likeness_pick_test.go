package models_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

// fourCandidates renders the whole open choice, as the queue path would.
func fourCandidates(t *testing.T, ctx context.Context, db *database.Database,
	repo *models.OmniChatMediaRepository, ownerID, personaID int) []*models.OmniChatIAILikenessCandidate {
	t.Helper()
	made := make([]*models.OmniChatIAILikenessCandidate, 0, 4)
	for nth := 1; nth <= 4; nth++ {
		job := runningLikenessJob(t, ctx, db, repo, ownerID, personaID, nth)
		candidate, err := repo.AttachLikenessCandidate(ctx, job.ID, likenessMediaFor(ownerID, job),
			1<<30, 50<<30, models.OmniChatGenerationProvenance{})
		require.NoError(t, err)
		made = append(made, candidate)
	}
	return made
}

func TestPickingHerFaceKeepsOneAndDiscardsTheRest(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	chosen := candidates[2]

	asset, err := repo.PickLikeness(ctx, personaID, ownerID, chosen.ID)
	require.NoError(t, err)
	require.Equal(t, chosen.MediaFileID, asset.MediaFileID)

	// She wears it.
	var avatar *string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT avatar_url FROM bot_personas WHERE id = $1`, personaID).Scan(&avatar))
	require.NotNil(t, avatar)
	require.Equal(t, chosen.StorageURL, *avatar)

	// The creator owns it, which is what puts it in their gallery.
	var assets int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_assets WHERE media_file_id = $1 AND owner_user_id = $2`,
		chosen.MediaFileID, ownerID).Scan(&assets))
	require.Equal(t, 1, assets)

	// And the other three stop existing, pictures and all.
	var open int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_iai_likeness_candidates WHERE persona_id = $1`,
		personaID).Scan(&open))
	require.Zero(t, open, "a chosen candidate is not a candidate, and neither are the losers")

	for _, discarded := range candidates {
		if discarded.ID == chosen.ID {
			continue
		}
		var files int
		require.NoError(t, db.Pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM media_files WHERE id = $1`, discarded.MediaFileID).Scan(&files))
		require.Zero(t, files)

		var queued int
		require.NoError(t, db.Pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM omnichat_media_deletion_queue WHERE storage_path = $1`,
			discarded.StoragePath).Scan(&queued))
		require.Equal(t, 1, queued, "and their stored objects go to the retention worker")
	}

	// The picked file survives, because the asset holds it.
	var kept int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM media_files WHERE id = $1`, chosen.MediaFileID).Scan(&kept))
	require.Equal(t, 1, kept)
}

func TestTheChosenPictureBecomesWhatRendersAreConditionedOn(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	chosen := candidates[0]

	_, err := repo.PickLikeness(ctx, personaID, ownerID, chosen.ID)
	require.NoError(t, err)

	var extensions []byte
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT extensions_json FROM bot_personas WHERE id = $1`, personaID).Scan(&extensions))

	var blob struct {
		Media models.OmniChatMediaIdentityProfile `json:"omnichat_media"`
	}
	require.NoError(t, json.Unmarshal(extensions, &blob))
	require.Equal(t, []string{chosen.StorageURL}, blob.Media.ReferenceURLs,
		"the picture somebody chose is the one later renders look like")

	// Everything already written about her is still there. The reference is
	// added to her identity, not written over it.
	require.NotEmpty(t, blob.Media.Appearance)
	require.Equal(t, models.OmniChatRenderStyleAnime, blob.Media.RenderStyle)
}

func TestOnlyHerOwnerCanChooseHerFace(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)

	_, err := repo.PickLikeness(ctx, personaID, ownerID+1000, candidates[0].ID)
	require.ErrorIs(t, err, models.ErrLikenessCandidateNotFound)

	// Nothing moved.
	var open int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_iai_likeness_candidates WHERE persona_id = $1`,
		personaID).Scan(&open))
	require.Equal(t, 4, open)
}

func TestAChoiceIsMadeOnce(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)

	_, err := repo.PickLikeness(ctx, personaID, ownerID, candidates[1].ID)
	require.NoError(t, err)

	// The second press finds nothing open rather than making a second asset out
	// of a picture that has already been discarded.
	_, err = repo.PickLikeness(ctx, personaID, ownerID, candidates[1].ID)
	require.ErrorIs(t, err, models.ErrLikenessCandidateNotFound)

	_, err = repo.PickLikeness(ctx, personaID, ownerID, candidates[3].ID)
	require.ErrorIs(t, err, models.ErrLikenessCandidateNotFound)

	var assets int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_media_assets WHERE persona_id = $1`, personaID).Scan(&assets))
	require.Equal(t, 1, assets)
	_ = services.OmniChatIAILikenessCandidates
}

func TestHerFaceCannotBeDeletedWhileSheIsWearingIt(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)

	asset, err := repo.PickLikeness(ctx, personaID, ownerID, candidates[0].ID)
	require.NoError(t, err)

	// It is in their gallery like any other generated image, and deleting a
	// gallery asset really does destroy the file. Doing it here would take her
	// appearance with it and nothing downstream would know why she had stopped
	// looking like herself, so the refusal that already covers a published
	// asset covers this too.
	_, err = repo.DeleteMediaAssetOwned(ctx, asset.ID, ownerID)
	require.ErrorIs(t, err, models.ErrOmniChatMediaInUse)

	var kept int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM media_files WHERE id = $1`, asset.MediaFileID).Scan(&kept))
	require.Equal(t, 1, kept, "her face is still there")
}

func TestAnOrdinaryPictureIsStillDeletable(t *testing.T) {
	// The control on the control. A refusal that caught everything would pass
	// the test above and break deleting generated media entirely.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)

	job := runningLikenessJob(t, ctx, db, repo, ownerID, personaID, 1)
	candidate, err := repo.AttachLikenessCandidate(ctx, job.ID, likenessMediaFor(ownerID, job),
		1<<30, 50<<30, models.OmniChatGenerationProvenance{})
	require.NoError(t, err)

	asset, err := repo.PickLikeness(ctx, personaID, ownerID, candidate.ID)
	require.NoError(t, err)

	// She stops wearing it, so it is an ordinary picture again.
	_, err = db.Pool.Exec(ctx, `UPDATE bot_personas SET avatar_url = NULL WHERE id = $1`, personaID)
	require.NoError(t, err)

	deleted, err := repo.DeleteMediaAssetOwned(ctx, asset.ID, ownerID)
	require.NoError(t, err)
	require.True(t, deleted)
}
