package repository

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/stretchr/testify/require"
)

// The in-memory repository stands in for postgres in most of the packages
// above it, so a write it accepts and postgres refuses is a divergence that
// only shows up in production. It must refuse a malformed subject on the same
// terms, and for the same reason: the stated subject is read as stated.
func TestInMemoryProfileRepository_RejectsInvalidResidentRef(t *testing.T) {
	repo := NewInMemoryProfileRepository()
	ctx := context.Background()

	invalid := []model.ResidentRef{
		{Kind: model.SubjectKindPersona, ID: 0},
		{Kind: "", ID: 7},
		{Kind: model.SubjectKind("robot"), ID: 7},
	}

	for _, subject := range invalid {
		err := repo.UpsertProfileBySubject(ctx, model.OmniRaveProfile{Subject: subject, UserID: 5})
		require.ErrorIs(t, err, ErrInvalidResidentRef)
	}

	// The user id in those rejected writes must not have been used as a
	// subject of its own. Had the write fallen back to deriving one, user 5
	// would now hold a profile it never asked for.
	stored, err := repo.GetProfile(ctx, 5)
	require.NoError(t, err)
	require.Nil(t, stored, "a refused write must not have landed on the derived account")
}

// The legacy user-keyed wrapper still works, and still writes an account
// subject regardless of anything left in Subject.
func TestInMemoryProfileRepository_UpsertProfileKeysOnTheAccount(t *testing.T) {
	repo := NewInMemoryProfileRepository()
	ctx := context.Background()

	profile := model.DefaultOmniRaveProfile(5)
	profile.LastVenue = "underground"
	profile.Subject = model.ResidentRef{Kind: model.SubjectKindPersona, ID: 9}
	require.NoError(t, repo.UpsertProfile(ctx, profile))

	stored, err := repo.GetProfile(ctx, 5)
	require.NoError(t, err)
	require.NotNil(t, stored)
	require.Equal(t, "underground", stored.LastVenue)
	require.Equal(t, model.ResidentRef{Kind: model.SubjectKindAccount, ID: 5}, stored.Subject)

	persona, err := repo.GetProfileBySubject(ctx, model.ResidentRef{Kind: model.SubjectKindPersona, ID: 9})
	require.NoError(t, err)
	require.Nil(t, persona, "a user-keyed write must never land on a persona")
}
