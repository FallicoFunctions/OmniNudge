package repository

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/stretchr/testify/require"
)

func TestPostgresStagePlaylistRepository_LoadActiveStagePlaylists(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresStagePlaylistRepository(db.Pool)

	playlists, err := repo.LoadActiveStagePlaylists(ctx)
	require.NoError(t, err)
	require.Len(t, playlists, 3)

	require.Equal(t, world.ZoneMainStage, playlists[0].ZoneID)
	require.Len(t, playlists[0].Entries, 2)
	require.Equal(t, "main-stage-youtube", playlists[0].Entries[0].VideoID)
	require.Equal(t, "main-stage-youtube-2", playlists[0].Entries[1].VideoID)

	require.Equal(t, world.ZoneTechnoRoom, playlists[1].ZoneID)
	require.Equal(t, "techno-room-youtube", playlists[1].Entries[0].VideoID)

	require.Equal(t, world.ZoneNeonRoom, playlists[2].ZoneID)
	require.Equal(t, "neon-room-youtube", playlists[2].Entries[0].VideoID)
}

func TestPostgresStagePlaylistRepository_IgnoresInactiveSetlists(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO omnirave_stage_setlists (zone_id, name, is_active)
		VALUES ('main_stage', 'inactive-archive', false)
	`)
	require.NoError(t, err)

	repo := NewPostgresStagePlaylistRepository(db.Pool)

	playlists, err := repo.LoadActiveStagePlaylists(ctx)
	require.NoError(t, err)
	require.Len(t, playlists, 3)
	require.Equal(t, "main-stage-youtube", playlists[0].Entries[0].VideoID)
}
