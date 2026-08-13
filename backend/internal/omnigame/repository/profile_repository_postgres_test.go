package repository

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/stretchr/testify/require"
)

func TestPostgresProfileRepository_UpsertAndGetProfile(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresProfileRepository(db.Pool)

	err = repo.UpsertProfile(ctx, model.OmniRaveProfile{
		UserID: 42,
		Loadout: map[string]string{
			"hair": "buzz",
			"top":  "black_mesh",
		},
		ReturnPoint: &model.SavedPoint{X: 12, Y: 0, Z: 8},
		LastVenue:   "underground",
		Settings: model.OmniRaveSettings{
			UITheme:       "Luminous Panels",
			GraphicsMode:  "auto",
			DisplayNames:  true,
			ChatCollapsed: false,
			CrouchMode:    "hold",
			CameraFollow:  "free",
		},
	})
	require.NoError(t, err)

	profile, err := repo.GetProfile(ctx, 42)
	require.NoError(t, err)
	require.NotNil(t, profile)
	require.Equal(t, "buzz", profile.Loadout["hair"])
	require.Equal(t, "black_mesh", profile.Loadout["top"])
	require.NotNil(t, profile.ReturnPoint)
	require.Equal(t, 12.0, profile.ReturnPoint.X)
	require.Equal(t, 8.0, profile.ReturnPoint.Z)
	require.Equal(t, "underground", profile.LastVenue)
	require.Equal(t, "Luminous Panels", profile.Settings.UITheme)
	require.Equal(t, "auto", profile.Settings.GraphicsMode)
	require.True(t, profile.Settings.DisplayNames)
	require.False(t, profile.Settings.ChatCollapsed)
	require.Equal(t, "hold", profile.Settings.CrouchMode)
	require.Equal(t, "free", profile.Settings.CameraFollow)
}

func TestPostgresProfileRepository_AccountSubjectMatchesLegacyMethods(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresProfileRepository(db.Pool)
	subject := model.ResidentRef{Kind: model.SubjectKindAccount, ID: 77}

	require.NoError(t, repo.UpsertProfile(ctx, model.OmniRaveProfile{
		UserID:    77,
		Loadout:   map[string]string{"top": "black_mesh"},
		LastVenue: "underground",
	}))

	bySubject, err := repo.GetProfileBySubject(ctx, subject)
	require.NoError(t, err)
	require.NotNil(t, bySubject)
	require.Equal(t, subject, bySubject.Subject)
	require.Equal(t, 77, bySubject.UserID)
	require.Equal(t, "underground", bySubject.LastVenue)

	byUser, err := repo.GetProfile(ctx, 77)
	require.NoError(t, err)
	require.NotNil(t, byUser)
	require.Equal(t, bySubject, byUser)

	// A write through the new method has to land on the same row the old
	// reader sees, or the two APIs would diverge on the same resident.
	require.NoError(t, repo.UpsertProfileBySubject(ctx, model.OmniRaveProfile{
		Subject:   subject,
		UserID:    77,
		Loadout:   map[string]string{"top": "white_tee"},
		LastVenue: "main_stage",
	}))

	byUser, err = repo.GetProfile(ctx, 77)
	require.NoError(t, err)
	require.NotNil(t, byUser)
	require.Equal(t, "white_tee", byUser.Loadout["top"])
	require.Equal(t, "main_stage", byUser.LastVenue)
}

func TestPostgresProfileRepository_PersonaProfileHasNoUser(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresProfileRepository(db.Pool)
	subject := model.ResidentRef{Kind: model.SubjectKindPersona, ID: 31}

	require.NoError(t, repo.UpsertProfileBySubject(ctx, model.OmniRaveProfile{
		Subject:     subject,
		Loadout:     map[string]string{"hair": "buzz"},
		ReturnPoint: &model.SavedPoint{X: 1, Y: 2, Z: 3},
		LastVenue:   "underground",
	}))

	profile, err := repo.GetProfileBySubject(ctx, subject)
	require.NoError(t, err)
	require.NotNil(t, profile)
	require.Equal(t, subject, profile.Subject)
	require.Equal(t, 0, profile.UserID)
	require.Equal(t, "buzz", profile.Loadout["hair"])
	require.NotNil(t, profile.ReturnPoint)
	require.Equal(t, 3.0, profile.ReturnPoint.Z)
	require.Equal(t, "underground", profile.LastVenue)

	var userIDIsNull bool
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT user_id IS NULL
		FROM omnirave_profiles
		WHERE subject_kind = 'persona' AND subject_id = $1
	`, subject.ID).Scan(&userIDIsNull))
	require.True(t, userIDIsNull)
}

func TestPostgresProfileRepository_SameIDDifferentKindsAreSeparateRows(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresProfileRepository(db.Pool)
	account := model.ResidentRef{Kind: model.SubjectKindAccount, ID: 5}
	persona := model.ResidentRef{Kind: model.SubjectKindPersona, ID: 5}

	require.NoError(t, repo.UpsertProfileBySubject(ctx, model.OmniRaveProfile{
		Subject:   account,
		UserID:    5,
		LastVenue: "main_stage",
	}))
	require.NoError(t, repo.UpsertProfileBySubject(ctx, model.OmniRaveProfile{
		Subject:   persona,
		LastVenue: "underground",
	}))

	accountProfile, err := repo.GetProfileBySubject(ctx, account)
	require.NoError(t, err)
	require.NotNil(t, accountProfile)
	require.Equal(t, "main_stage", accountProfile.LastVenue)
	require.Equal(t, 5, accountProfile.UserID)

	personaProfile, err := repo.GetProfileBySubject(ctx, persona)
	require.NoError(t, err)
	require.NotNil(t, personaProfile)
	require.Equal(t, "underground", personaProfile.LastVenue)
	require.Equal(t, 0, personaProfile.UserID)

	var rows int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT count(*) FROM omnirave_profiles WHERE subject_id = 5
	`).Scan(&rows))
	require.Equal(t, 2, rows)
}

func TestPostgresProfileRepository_RejectsInvalidResidentRef(t *testing.T) {
	// No database: an invalid ref must be refused before any SQL is issued, so
	// a nil pool is the assertion that none was.
	repo := NewPostgresProfileRepository(nil)
	ctx := context.Background()

	invalid := []model.ResidentRef{
		{Kind: model.SubjectKindPersona, ID: 0},
		{Kind: "", ID: 7},
		{Kind: model.SubjectKind("robot"), ID: 7},
	}

	for _, subject := range invalid {
		profile, err := repo.GetProfileBySubject(ctx, subject)
		require.ErrorIs(t, err, ErrInvalidResidentRef)
		require.Nil(t, profile)

		err = repo.UpsertProfileBySubject(ctx, model.OmniRaveProfile{Subject: subject})
		require.ErrorIs(t, err, ErrInvalidResidentRef)
	}
}

func TestPostgresProfileRepository_GetProfileReturnsNilWhenMissing(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresProfileRepository(db.Pool)

	profile, err := repo.GetProfile(ctx, 999999)
	require.NoError(t, err)
	require.Nil(t, profile)
}
