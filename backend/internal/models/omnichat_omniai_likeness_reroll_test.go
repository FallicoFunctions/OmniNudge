package models_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
)

func candidateCount(t *testing.T, ctx context.Context, db *database.Database, personaID int) int {
	t.Helper()
	var n int
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM omnichat_omniai_likeness_candidates WHERE persona_id = $1`,
		personaID).Scan(&n))
	return n
}

func TestDiscardingAnOpenChoiceTakesItsPicturesWithIt(t *testing.T) {
	// A candidate's file is held by nothing else. Dropping the row and leaving
	// the media_files record would strand four images in storage that the
	// account is charged for and nobody can ever see, because the retention
	// worker is fed by a trigger on that table.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)
	require.Len(t, candidates, 4)

	removed, err := repo.DiscardLikenessCandidates(ctx, personaID, ownerID)
	require.NoError(t, err)
	require.Equal(t, 4, removed)
	require.Zero(t, candidateCount(t, ctx, db, personaID))

	for _, candidate := range candidates {
		var files int
		require.NoError(t, db.Pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM media_files WHERE id = $1`, candidate.MediaFileID).Scan(&files))
		require.Zero(t, files, "the picture goes with the row that held it")
	}
}

func TestHerFaceCannotBeRedrawnOnceSheIsWearingIt(t *testing.T) {
	// The safety property of the whole feature. The chosen face is her avatar,
	// the conditioning for every later render and the 3D pipeline's input, so
	// drawing her again is not a new choice -- it is a different character
	// under an existing relationship.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)

	_, err := repo.PickLikeness(ctx, personaID, ownerID, candidates[0].ID)
	require.NoError(t, err)

	removed, err := repo.DiscardLikenessCandidates(ctx, personaID, ownerID)
	require.ErrorIs(t, err, models.ErrLikenessAlreadyChosen)
	require.Zero(t, removed)
}

func TestAnEditedAvatarUrlDoesNotDisarmTheRefusal(t *testing.T) {
	// avatar_url is writable through UpdateMedia and its storage_url is not one
	// shape, so asking only that question could be silently switched off by an
	// ordinary edit. The identity reference list is written by the pick and by
	// nothing else, and it is what renders are actually conditioned on.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	candidates := fourCandidates(t, ctx, db, repo, ownerID, personaID)

	_, err := repo.PickLikeness(ctx, personaID, ownerID, candidates[0].ID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx,
		`UPDATE bot_personas SET avatar_url = 'https://cdn.example.com/somewhere/else.png' WHERE id = $1`,
		personaID)
	require.NoError(t, err)

	_, err = repo.DiscardLikenessCandidates(ctx, personaID, ownerID)
	require.ErrorIs(t, err, models.ErrLikenessAlreadyChosen,
		"the reference list still says she has been drawn")
}

func TestDiscardingRetiresTheRendersStillInFlight(t *testing.T) {
	// Without this a render from the discarded set lands among the new four:
	// storing a candidate only requires the job to still be running, and a
	// queued one has not started yet.
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	fourCandidates(t, ctx, db, repo, ownerID, personaID)

	inFlight := runningLikenessJob(t, ctx, db, repo, ownerID, personaID, 99)

	_, err := repo.DiscardLikenessCandidates(ctx, personaID, ownerID)
	require.NoError(t, err)

	var status, code string
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT status, COALESCE(error_code, '') FROM omnichat_generation_jobs WHERE id = $1`,
		inFlight.ID).Scan(&status, &code))
	require.Equal(t, "cancelled", status)
	require.Equal(t, "likeness_rerolled", code)

	// And it can no longer land, which is the point of cancelling it: storing a
	// candidate requires the job to still be running.
	_, err = repo.AttachLikenessCandidate(ctx, inFlight.ID, likenessMediaFor(ownerID, inFlight),
		1<<30, 50<<30, models.OmniChatGenerationProvenance{})
	require.Error(t, err, "a render from the discarded set must not join the new four")
}

func TestDiscardingSomebodyElsesChoiceRemovesNothing(t *testing.T) {
	ctx := context.Background()
	db, repo, ownerID, personaID := newLikenessFixture(t, ctx)
	fourCandidates(t, ctx, db, repo, ownerID, personaID)

	removed, err := repo.DiscardLikenessCandidates(ctx, personaID, ownerID+9999)
	require.NoError(t, err)
	require.Zero(t, removed)
	require.Equal(t, 4, candidateCount(t, ctx, db, personaID), "hers are untouched")
}

func TestDiscardingWhenThereIsNothingOpenIsNotAnError(t *testing.T) {
	// The picker asks for another set from a screen that may already be empty
	// -- every render failed, or a previous re-roll cleared it.
	ctx := context.Background()
	_, repo, ownerID, personaID := newLikenessFixture(t, context.Background())

	removed, err := repo.DiscardLikenessCandidates(ctx, personaID, ownerID)
	require.NoError(t, err)
	require.Zero(t, removed)
}
