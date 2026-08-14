package world

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestMediaState_JoinerReceivesCurrentStagePlayhead(t *testing.T) {
	state := NewMediaState()
	state.AdvanceTo(ZoneMainStage, "track-123", 3, time.Unix(1000, 0))

	snapshot := state.SnapshotForZone(ZoneMainStage, time.Unix(1012, 0))

	require.Equal(t, ZoneMainStage, snapshot.ZoneID)
	require.Equal(t, "track-123", snapshot.TrackID)
	require.Equal(t, 3, snapshot.Index)
	require.Equal(t, 12*time.Second, snapshot.Playhead)
}

func TestMediaState_AdvancesThroughCuratedPlaylistEntries(t *testing.T) {
	state := NewMediaStateWithPlaylists(
		[]StagePlaylist{
			{
				ZoneID: ZoneMainStage,
				Entries: []PlaylistEntry{
					{TrackID: "main-stage-set-01", Artist: "Fallico", Title: "Nick's Mix Vol. 13", Duration: 10 * time.Second},
					{TrackID: "main-stage-set-02", Artist: "OmniRave", Title: "Main Stage Set 02", Duration: 15 * time.Second},
				},
			},
		},
		time.Unix(1000, 0),
	)

	snapshot := state.SnapshotForZone(ZoneMainStage, time.Unix(1012, 0))

	require.Equal(t, ZoneMainStage, snapshot.ZoneID)
	require.Equal(t, "main-stage-set-02", snapshot.TrackID)
	require.Equal(t, "OmniRave", snapshot.Artist)
	require.Equal(t, "Main Stage Set 02", snapshot.Title)
	require.Equal(t, 1, snapshot.Index)
	require.Equal(t, 2*time.Second, snapshot.Playhead)
	require.Equal(t, 15*time.Second, snapshot.Duration)
}

func TestMediaState_SnapshotCarriesTrackMetadata(t *testing.T) {
	state := NewMediaStateWithPlaylists(
		[]StagePlaylist{
			{
				ZoneID: ZoneMainStage,
				Entries: []PlaylistEntry{
					{TrackID: "main-stage-set-01", Artist: "Fallico", Title: "Nick's Mix Vol. 13", Duration: 7827 * time.Second},
				},
			},
		},
		time.Unix(1000, 0),
	)

	snapshot := state.SnapshotForZone(ZoneMainStage, time.Unix(1060, 0))

	require.Equal(t, "main-stage-set-01", snapshot.TrackID)
	require.Equal(t, "Fallico", snapshot.Artist)
	require.Equal(t, "Nick's Mix Vol. 13", snapshot.Title)
	require.Equal(t, 60*time.Second, snapshot.Playhead)
	require.Equal(t, 7827*time.Second, snapshot.Duration)
}

func TestDefaultStagePlaylists_CarryArtistTitleAndDuration(t *testing.T) {
	playlists := DefaultStagePlaylists()
	require.Len(t, playlists, 3)

	byZone := make(map[ZoneID]StagePlaylist, len(playlists))
	for _, playlist := range playlists {
		byZone[playlist.ZoneID] = playlist
	}

	mainStage, ok := byZone[ZoneMainStage]
	require.True(t, ok)
	require.Equal(t, "main-stage-set-01", mainStage.Entries[0].TrackID)
	require.Equal(t, "Fallico", mainStage.Entries[0].Artist)
	require.Equal(t, "Nick's Mix Vol. 13", mainStage.Entries[0].Title)
	require.Equal(t, 7827*time.Second, mainStage.Entries[0].Duration)

	for _, playlist := range playlists {
		for _, entry := range playlist.Entries {
			require.NotEmpty(t, entry.Artist, "artist for %s", entry.TrackID)
			require.NotEmpty(t, entry.Title, "title for %s", entry.TrackID)
			require.Positive(t, int64(entry.Duration), "duration for %s", entry.TrackID)
		}
	}
}

func TestMediaState_LoopsCuratedPlaylistEntries(t *testing.T) {
	state := NewMediaStateWithPlaylists(
		[]StagePlaylist{
			{
				ZoneID: ZoneMainStage,
				Entries: []PlaylistEntry{
					{TrackID: "main-stage-set-01", Duration: 10 * time.Second},
					{TrackID: "main-stage-set-02", Duration: 15 * time.Second},
				},
			},
		},
		time.Unix(1000, 0),
	)

	snapshot := state.SnapshotForZone(ZoneMainStage, time.Unix(1027, 0))

	require.Equal(t, "main-stage-set-01", snapshot.TrackID)
	require.Equal(t, 0, snapshot.Index)
	require.Equal(t, 2*time.Second, snapshot.Playhead)
}
