package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
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
	require.Len(t, playlists, len(world.DefaultStagePlaylists()))
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

func TestMissingTrackFiles_NamesEachTrackWithoutItsLightFiles(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"complete.mp3", "complete.spectrum", "complete.beats", "no-lights.mp3", "no-beats.mp3", "no-beats.spectrum"} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644))
	}
	playlists := []world.StagePlaylist{
		{ZoneID: world.ZoneMainStage, Entries: []world.PlaylistEntry{{TrackID: "complete"}, {TrackID: "no-lights"}, {TrackID: "no-beats"}}},
		// The same track in a second playlist is reported once.
		{ZoneID: "underground", Entries: []world.PlaylistEntry{{TrackID: "no-lights"}, {TrackID: "not-uploaded"}}},
	}

	warnings := missingTrackFiles(playlists, dir)

	require.Len(t, warnings, 3)
	require.Contains(t, warnings[0], "no-lights in the main_stage playlist is missing no-lights.spectrum, no-lights.beats")
	require.Contains(t, warnings[1], "no-beats in the main_stage playlist is missing no-beats.beats in "+dir)
	require.Contains(t, warnings[2], "not-uploaded in the underground playlist is missing not-uploaded.mp3, not-uploaded.spectrum, not-uploaded.beats")
	require.Contains(t, warnings[0], "scripts/upload-stage-tracks.sh")
}

func TestMissingTrackFiles_SaysNothingWithoutTheAudioFolder(t *testing.T) {
	playlists := []world.StagePlaylist{{ZoneID: world.ZoneMainStage, Entries: []world.PlaylistEntry{{TrackID: "anything"}}}}
	require.Empty(t, missingTrackFiles(playlists, filepath.Join(t.TempDir(), "absent")))
}
