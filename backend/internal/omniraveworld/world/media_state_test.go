package world

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestMediaState_JoinerReceivesCurrentStagePlayhead(t *testing.T) {
	state := NewMediaState()
	state.AdvanceTo(ZoneMainStage, "yt123", 3, time.Unix(1000, 0))

	snapshot := state.SnapshotForZone(ZoneMainStage, time.Unix(1012, 0))

	require.Equal(t, ZoneMainStage, snapshot.ZoneID)
	require.Equal(t, "yt123", snapshot.VideoID)
	require.Equal(t, 3, snapshot.Index)
	require.Equal(t, 12*time.Second, snapshot.Playhead)
}

func TestMediaState_AdvancesThroughCuratedPlaylistEntries(t *testing.T) {
	state := NewMediaStateWithPlaylists(
		[]StagePlaylist{
			{
				ZoneID: ZoneMainStage,
				Entries: []PlaylistEntry{
					{VideoID: "main-stage-youtube", Duration: 10 * time.Second},
					{VideoID: "main-stage-youtube-2", Duration: 15 * time.Second},
				},
			},
		},
		time.Unix(1000, 0),
	)

	snapshot := state.SnapshotForZone(ZoneMainStage, time.Unix(1012, 0))

	require.Equal(t, ZoneMainStage, snapshot.ZoneID)
	require.Equal(t, "main-stage-youtube-2", snapshot.VideoID)
	require.Equal(t, 1, snapshot.Index)
	require.Equal(t, 2*time.Second, snapshot.Playhead)
}

func TestMediaState_LoopsCuratedPlaylistEntries(t *testing.T) {
	state := NewMediaStateWithPlaylists(
		[]StagePlaylist{
			{
				ZoneID: ZoneMainStage,
				Entries: []PlaylistEntry{
					{VideoID: "main-stage-youtube", Duration: 10 * time.Second},
					{VideoID: "main-stage-youtube-2", Duration: 15 * time.Second},
				},
			},
		},
		time.Unix(1000, 0),
	)

	snapshot := state.SnapshotForZone(ZoneMainStage, time.Unix(1027, 0))

	require.Equal(t, "main-stage-youtube", snapshot.VideoID)
	require.Equal(t, 0, snapshot.Index)
	require.Equal(t, 2*time.Second, snapshot.Playhead)
}
