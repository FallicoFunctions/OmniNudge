package repository

import (
	"context"
	"testing"
	"time"

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
	// Placeholder tracks without audio are gone (migration 222): only the
	// Main Stage has a track, so the stages without one load no playlist.
	require.Len(t, playlists, 1)

	require.Equal(t, world.ZoneMainStage, playlists[0].ZoneID)
	require.Len(t, playlists[0].Entries, 1)
	require.Equal(t, "main-stage-set-01", playlists[0].Entries[0].TrackID)
	require.Equal(t, "Fallico", playlists[0].Entries[0].Artist)
	require.Equal(t, "Nick's Mix Vol. 13", playlists[0].Entries[0].Title)
	require.Equal(t, 7827*time.Second, playlists[0].Entries[0].Duration)

	for _, playlist := range playlists {
		for _, entry := range playlist.Entries {
			require.NotEmpty(t, entry.Artist, "artist for %s", entry.TrackID)
			require.NotEmpty(t, entry.Title, "title for %s", entry.TrackID)
			require.Positive(t, int64(entry.Duration), "duration for %s", entry.TrackID)
		}
	}
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
	require.Len(t, playlists, 1)
	require.Equal(t, "main-stage-set-01", playlists[0].Entries[0].TrackID)
}

func TestPostgresStagePlaylistRepository_UpgradeRenamesLegacyZoneIDs(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	_, err = db.Pool.Exec(ctx, `
		UPDATE omnirave_stage_setlists
		SET zone_id = CASE
			WHEN zone_id = 'underground' THEN 'techno_room'
			WHEN zone_id = 'plurr_partay' THEN 'neon_room'
			ELSE zone_id
		END
	`)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		DELETE FROM public.schema_migrations
		WHERE version = '108_omnirave_stage_zone_id_rename'
	`)
	require.NoError(t, err)

	require.NoError(t, db.Migrate(ctx))

	// Read the setlists directly: since migration 222 only the Main Stage
	// has tracks, so the playlist loader returns no other zone.
	rows, err := db.Pool.Query(ctx, `
		SELECT zone_id FROM omnirave_stage_setlists
		WHERE name = 'launch-default'
		ORDER BY zone_id
	`)
	require.NoError(t, err)
	var zones []string
	for rows.Next() {
		var zone string
		require.NoError(t, rows.Scan(&zone))
		zones = append(zones, zone)
	}
	rows.Close()
	require.NoError(t, rows.Err())
	require.Equal(t, []string{string(world.ZoneMainStage), string(world.ZonePlurrPartay), string(world.ZoneUnderground)}, zones)
}
