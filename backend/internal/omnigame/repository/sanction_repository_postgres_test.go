package repository

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func TestPostgresSanctionRepository_BlocksActiveBootstrap(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresSanctionRepository(db.Pool)
	require.NoError(t, repo.BlockBootstrap(ctx, "bootstrap-1", "ip-hash-1", "mute", time.Now().Add(30*time.Minute)))

	blocked, err := repo.IsBootstrapBlocked(ctx, "bootstrap-1", "ip-hash-1")
	require.NoError(t, err)
	require.True(t, blocked)
}

func TestPostgresSanctionRepository_IgnoresExpiredBootstrap(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresSanctionRepository(db.Pool)
	require.NoError(t, repo.BlockBootstrap(ctx, "bootstrap-2", "ip-hash-2", "mute", time.Now().Add(-30*time.Minute)))

	blocked, err := repo.IsBootstrapBlocked(ctx, "bootstrap-2", "ip-hash-2")
	require.NoError(t, err)
	require.False(t, blocked)
}

func TestPostgresSanctionRepository_BlocksMatchingNetworkHashAcrossFreshBootstrap(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresSanctionRepository(db.Pool)
	require.NoError(t, repo.BlockBootstrap(ctx, "bootstrap-3", "ip-hash-3", "mute", time.Now().Add(30*time.Minute)))

	blocked, err := repo.IsBootstrapBlocked(ctx, "fresh-bootstrap-3", "ip-hash-3")
	require.NoError(t, err)
	require.True(t, blocked)
}

func TestPostgresSanctionRepository_StoresUnresolvedIdentityAsNull(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresSanctionRepository(db.Pool)
	require.NoError(t, repo.BlockBootstrap(ctx, "bootstrap-4", "", "mute", time.Now().Add(30*time.Minute)))

	var ipHash sql.NullString
	err = db.Pool.QueryRow(ctx, `
		SELECT ip_hash
		FROM omnirave_guest_sanctions
		WHERE bootstrap_id = $1
		ORDER BY id DESC
		LIMIT 1
	`, "bootstrap-4").Scan(&ipHash)
	require.NoError(t, err)
	require.False(t, ipHash.Valid)
}

func TestPostgresSanctionRepository_NullNetworkIdentityDoesNotBlockFreshUnresolvedBootstrap(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, database.DropSchema(ctx, db))
	require.NoError(t, db.Migrate(ctx))

	repo := NewPostgresSanctionRepository(db.Pool)
	require.NoError(t, repo.BlockBootstrap(ctx, "bootstrap-5", "", "mute", time.Now().Add(30*time.Minute)))

	blocked, err := repo.IsBootstrapBlocked(ctx, "fresh-bootstrap-5", "")
	require.NoError(t, err)
	require.False(t, blocked)
}
