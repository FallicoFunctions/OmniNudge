package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/omniraveworld/world"
)

type PostgresStagePlaylistRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresStagePlaylistRepository(pool *pgxpool.Pool) *PostgresStagePlaylistRepository {
	return &PostgresStagePlaylistRepository{pool: pool}
}

func (r *PostgresStagePlaylistRepository) LoadActiveStagePlaylists(ctx context.Context) ([]world.StagePlaylist, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT s.zone_id, s.activated_at, e.position, e.video_id, e.duration_seconds
		FROM omnirave_stage_setlists s
		JOIN omnirave_stage_setlist_entries e ON e.setlist_id = s.id
		WHERE s.is_active = true
		ORDER BY
			CASE s.zone_id
				WHEN 'main_stage' THEN 0
				WHEN 'underground' THEN 1
				WHEN 'plurr_partay' THEN 2
				ELSE 99
			END,
			e.position ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	grouped := map[world.ZoneID]*world.StagePlaylist{}
	for rows.Next() {
		var zoneID string
		var activatedAt time.Time
		var position int
		var trackID string
		var durationSeconds int
		if err := rows.Scan(&zoneID, &activatedAt, &position, &trackID, &durationSeconds); err != nil {
			return nil, err
		}

		playlist, ok := grouped[world.ZoneID(zoneID)]
		if !ok {
			playlist = &world.StagePlaylist{ZoneID: world.ZoneID(zoneID), StartedAt: activatedAt}
			grouped[world.ZoneID(zoneID)] = playlist
		}

		playlist.Entries = append(playlist.Entries, world.PlaylistEntry{
			TrackID:  trackID,
			Duration: time.Duration(durationSeconds) * time.Second,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	playlists := make([]world.StagePlaylist, 0, len(grouped))
	for _, zoneID := range []world.ZoneID{world.ZoneMainStage, world.ZoneUnderground, world.ZonePlurrPartay} {
		if playlist, ok := grouped[zoneID]; ok {
			playlists = append(playlists, *playlist)
		}
	}
	return playlists, nil
}
