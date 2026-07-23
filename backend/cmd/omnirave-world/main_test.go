package main

import (
	"context"
	"errors"
	"testing"

	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/stretchr/testify/require"
)

func TestLoadStagePlaylists_UsesRepositoryPlaylistsWhenPresent(t *testing.T) {
	playlists, err := loadStagePlaylists(context.Background(), fakeStagePlaylistRepository{
		playlists: []world.StagePlaylist{
			{
				ZoneID: world.ZoneMainStage,
				Entries: []world.PlaylistEntry{
					{TrackID: "custom-main-stage", Duration: 60},
				},
			},
		},
	})
	require.NoError(t, err)
	require.Len(t, playlists, 1)
	require.Equal(t, "custom-main-stage", playlists[0].Entries[0].TrackID)
}

func TestLoadStagePlaylists_FallsBackToDefaultsWhenRepositoryIsEmpty(t *testing.T) {
	playlists, err := loadStagePlaylists(context.Background(), fakeStagePlaylistRepository{})
	require.NoError(t, err)
	require.Len(t, playlists, 3)
	require.Equal(t, "main-stage-set-01", playlists[0].Entries[0].TrackID)
}

func TestLoadStagePlaylists_ReturnsRepositoryErrors(t *testing.T) {
	_, err := loadStagePlaylists(context.Background(), fakeStagePlaylistRepository{
		err: errors.New("db offline"),
	})
	require.ErrorContains(t, err, "db offline")
}

type fakeStagePlaylistRepository struct {
	playlists []world.StagePlaylist
	err       error
}

func (f fakeStagePlaylistRepository) LoadActiveStagePlaylists(context.Context) ([]world.StagePlaylist, error) {
	return f.playlists, f.err
}
