package main

import (
	"context"
	"errors"
	"testing"
	"time"

	omniraveworld "github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/stretchr/testify/require"
)

func TestLoadStagePlaylists_UsesRepositoryPlaylistsWhenPresent(t *testing.T) {
	playlists, err := loadStagePlaylists(context.Background(), fakeStagePlaylistRepository{
		playlists: []omniraveworld.StagePlaylist{
			{
				ZoneID: omniraveworld.ZoneMainStage,
				Entries: []omniraveworld.PlaylistEntry{
					{VideoID: "custom-main-stage", Duration: time.Minute},
				},
			},
		},
	})
	require.NoError(t, err)
	require.Len(t, playlists, 1)
	require.Equal(t, "custom-main-stage", playlists[0].Entries[0].VideoID)
}

func TestLoadStagePlaylists_FallsBackToDefaultsWhenRepositoryIsEmpty(t *testing.T) {
	playlists, err := loadStagePlaylists(context.Background(), fakeStagePlaylistRepository{})
	require.NoError(t, err)
	require.Len(t, playlists, 3)
	require.Equal(t, "main-stage-youtube", playlists[0].Entries[0].VideoID)
}

func TestLoadStagePlaylists_ReturnsRepositoryErrors(t *testing.T) {
	_, err := loadStagePlaylists(context.Background(), fakeStagePlaylistRepository{
		err: errors.New("db offline"),
	})
	require.ErrorContains(t, err, "db offline")
}

type fakeStagePlaylistRepository struct {
	playlists []omniraveworld.StagePlaylist
	err       error
}

func (f fakeStagePlaylistRepository) LoadActiveStagePlaylists(context.Context) ([]omniraveworld.StagePlaylist, error) {
	return f.playlists, f.err
}
