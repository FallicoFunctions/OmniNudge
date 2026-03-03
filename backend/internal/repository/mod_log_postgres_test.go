package repository_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresModLogRepository_Log(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresModLogRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("modlog_mod")
	target := fx.CreateUniqueUser("modlog_target")
	hub := fx.CreateHub(fmt.Sprintf("modlog_%d", time.Now().UnixNano()), mod.ID)

	entry, err := repo.Log(ctx, hub.ID, mod.ID, "remove_post", "user", target.ID, domain.JSONB{})
	require.NoError(t, err)
	require.NotNil(t, entry)
	assert.NotZero(t, entry.ID)
}

func TestPostgresModLogRepository_GetByHub(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresModLogRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("mlhub_mod")
	target := fx.CreateUniqueUser("mlhub_target")
	hub := fx.CreateHub(fmt.Sprintf("mlhub_%d", time.Now().UnixNano()), mod.ID)

	entry, _ := repo.Log(ctx, hub.ID, mod.ID, "ban_user", "user", target.ID, domain.JSONB{})

	logs, err := repo.GetByHub(ctx, hub.ID, 10, 0)
	require.NoError(t, err)

	ids := make([]int, len(logs))
	for i, l := range logs {
		ids[i] = l.ID
	}
	assert.Contains(t, ids, entry.ID)
}

func TestPostgresModLogRepository_GetByModerator(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresModLogRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("mlmod_mod")
	target := fx.CreateUniqueUser("mlmod_target")
	hub := fx.CreateHub(fmt.Sprintf("mlmod_%d", time.Now().UnixNano()), mod.ID)

	entry, _ := repo.Log(ctx, hub.ID, mod.ID, "ban_user", "user", target.ID, domain.JSONB{})

	logs, err := repo.GetByModerator(ctx, mod.ID, 10, 0)
	require.NoError(t, err)

	ids := make([]int, len(logs))
	for i, l := range logs {
		ids[i] = l.ID
	}
	assert.Contains(t, ids, entry.ID)
}

func TestPostgresModLogRepository_GetByAction(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresModLogRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	mod := fx.CreateUniqueUser("mlaction_mod")
	target := fx.CreateUniqueUser("mlaction_target")
	hub := fx.CreateHub(fmt.Sprintf("mlaction_%d", time.Now().UnixNano()), mod.ID)

	entry, _ := repo.Log(ctx, hub.ID, mod.ID, "approve_post", "user", target.ID, domain.JSONB{})

	logs, err := repo.GetByAction(ctx, hub.ID, "approve_post", 10, 0)
	require.NoError(t, err)

	ids := make([]int, len(logs))
	for i, l := range logs {
		ids[i] = l.ID
	}
	assert.Contains(t, ids, entry.ID)
}
