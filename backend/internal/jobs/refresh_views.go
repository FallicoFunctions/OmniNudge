package jobs

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// RefreshMaterializedViews refreshes all materialized views in the database.
// This should be called periodically (e.g., every 5 minutes) to keep analytics fresh.
type RefreshMaterializedViewsJob struct {
	pool   *pgxpool.Pool
	logger zerolog.Logger
}

func NewRefreshMaterializedViewsJob(pool *pgxpool.Pool, logger zerolog.Logger) *RefreshMaterializedViewsJob {
	return &RefreshMaterializedViewsJob{pool: pool, logger: logger}
}

var materializedViews = []string{
	"user_post_stats",
	"hub_activity_stats",
}

// refreshMu prevents overlapping runs of the materialized view refresh job.
// BUG-18: Use TryLock to skip if a run is already in progress.
var refreshMu sync.Mutex

func (j *RefreshMaterializedViewsJob) Run(ctx context.Context) error {
	// BUG-18: Skip run if one is already in progress.
	if !refreshMu.TryLock() {
		j.logger.Warn().Msg("view refresh already in progress, skipping")
		return nil
	}
	defer refreshMu.Unlock()

	// BUG-17: Allowlist check — only refresh known materialized views to prevent SQL injection.
	allowed := map[string]bool{
		"user_post_stats":   true,
		"hub_activity_stats": true,
	}

	for _, view := range materializedViews {
		if !allowed[view] {
			j.logger.Error().Str("view", view).Msg("refusing to refresh unknown materialized view")
			continue
		}

		start := time.Now()
		// CONCURRENTLY allows reads during refresh (non-blocking)
		query := fmt.Sprintf("REFRESH MATERIALIZED VIEW CONCURRENTLY %s", view)

		// BUG-18: Per-view context with a 4-minute timeout to prevent indefinite blocking.
		refreshCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
		_, err := j.pool.Exec(refreshCtx, query)
		cancel()

		if err != nil {
			j.logger.Warn().Err(err).Str("view", view).Msg("failed to refresh materialized view (view may not exist yet)")
			continue // Don't fail entire job if one view missing
		}
		j.logger.Debug().Str("view", view).Dur("duration", time.Since(start)).Msg("refreshed materialized view")
	}
	return nil
}
