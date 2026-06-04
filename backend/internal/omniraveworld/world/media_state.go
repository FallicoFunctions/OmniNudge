package world

import (
	"sync"
	"time"
)

type PlaylistEntry struct {
	VideoID  string
	Duration time.Duration
}

type StagePlaylist struct {
	ZoneID    ZoneID
	Entries   []PlaylistEntry
	StartedAt time.Time
}

type ZoneMediaSnapshot struct {
	ZoneID    ZoneID
	VideoID   string
	Index     int
	StartedAt time.Time
	Playhead  time.Duration
}

type zoneMediaState struct {
	ZoneID    ZoneID
	VideoID   string
	Index     int
	StartedAt time.Time
}

type MediaState struct {
	mu        sync.RWMutex
	zones     map[ZoneID]zoneMediaState
	playlists map[ZoneID]StagePlaylist
}

func NewMediaState() *MediaState {
	return NewMediaStateWithPlaylists(DefaultStagePlaylists(), time.Now().UTC())
}

func NewMediaStateWithPlaylists(playlists []StagePlaylist, startedAt time.Time) *MediaState {
	state := &MediaState{
		zones:     make(map[ZoneID]zoneMediaState, len(playlists)),
		playlists: make(map[ZoneID]StagePlaylist, len(playlists)),
	}

	for _, playlist := range playlists {
		if len(playlist.Entries) == 0 {
			continue
		}

		entry := playlist.Entries[0]
		zoneStartedAt := startedAt
		if !playlist.StartedAt.IsZero() {
			zoneStartedAt = playlist.StartedAt
		}
		state.playlists[playlist.ZoneID] = playlist
		state.zones[playlist.ZoneID] = zoneMediaState{
			ZoneID:    playlist.ZoneID,
			VideoID:   entry.VideoID,
			Index:     0,
			StartedAt: zoneStartedAt,
		}
	}

	return state
}

func (m *MediaState) AdvanceTo(zone ZoneID, videoID string, index int, startedAt time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.zones[zone] = zoneMediaState{
		ZoneID:    zone,
		VideoID:   videoID,
		Index:     index,
		StartedAt: startedAt,
	}
}

func (m *MediaState) SnapshotForZone(zone ZoneID, now time.Time) ZoneMediaSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	current := m.zones[zone]
	if resolved, ok := resolvePlaylistState(current, m.playlists[zone], now); ok {
		return resolved
	}
	return ZoneMediaSnapshot{
		ZoneID:    zone,
		VideoID:   current.VideoID,
		Index:     current.Index,
		StartedAt: current.StartedAt,
		Playhead:  now.Sub(current.StartedAt),
	}
}

func (m *MediaState) Snapshots(now time.Time) []ZoneMediaSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	snapshots := make([]ZoneMediaSnapshot, 0, len(m.zones))
	for _, zone := range []ZoneID{ZoneMainStage, ZoneUnderground, ZonePlurrPartay} {
		current := m.zones[zone]
		if resolved, ok := resolvePlaylistState(current, m.playlists[zone], now); ok {
			snapshots = append(snapshots, resolved)
			continue
		}

		snapshots = append(snapshots, ZoneMediaSnapshot{
			ZoneID:    zone,
			VideoID:   current.VideoID,
			Index:     current.Index,
			StartedAt: current.StartedAt,
			Playhead:  now.Sub(current.StartedAt),
		})
	}
	return snapshots
}

func resolvePlaylistState(current zoneMediaState, playlist StagePlaylist, now time.Time) (ZoneMediaSnapshot, bool) {
	if len(playlist.Entries) == 0 || current.Index < 0 || current.Index >= len(playlist.Entries) {
		return ZoneMediaSnapshot{}, false
	}

	elapsed := now.Sub(current.StartedAt)
	if elapsed < 0 {
		elapsed = 0
	}

	index := current.Index
	for {
		entry := playlist.Entries[index]
		if entry.Duration <= 0 || elapsed < entry.Duration {
			return ZoneMediaSnapshot{
				ZoneID:    current.ZoneID,
				VideoID:   entry.VideoID,
				Index:     index,
				StartedAt: current.StartedAt,
				Playhead:  elapsed,
			}, true
		}

		elapsed -= entry.Duration
		index = (index + 1) % len(playlist.Entries)
	}
}

func DefaultStagePlaylists() []StagePlaylist {
	return []StagePlaylist{
		{
			ZoneID: ZoneMainStage,
			Entries: []PlaylistEntry{
				{VideoID: "main-stage-youtube", Duration: 30 * time.Minute},
				{VideoID: "main-stage-youtube-2", Duration: 28 * time.Minute},
			},
		},
		{
			ZoneID: ZoneUnderground,
			Entries: []PlaylistEntry{
				{VideoID: "techno-room-youtube", Duration: 24 * time.Minute},
				{VideoID: "techno-room-youtube-2", Duration: 26 * time.Minute},
			},
		},
		{
			ZoneID: ZonePlurrPartay,
			Entries: []PlaylistEntry{
				{VideoID: "neon-room-youtube", Duration: 22 * time.Minute},
				{VideoID: "neon-room-youtube-2", Duration: 25 * time.Minute},
			},
		},
	}
}
