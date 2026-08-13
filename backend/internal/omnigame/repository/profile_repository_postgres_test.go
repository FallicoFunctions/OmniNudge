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
