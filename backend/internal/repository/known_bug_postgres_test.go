package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresKnownBugRepository_CreateAndGetAll(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresKnownBugRepository(db.Pool)
	ctx := context.Background()

	bug := &domain.KnownBug{
		Title:       "Known crash on login",
		Description: "Users see a 500 on login",
		Status:   "investigating",
		Severity: "low",
	}

	err := repo.Create(ctx, bug)
	require.NoError(t, err)
	assert.NotZero(t, bug.ID)

	status := "investigating"
	bugs, err := repo.GetAll(ctx, &status)
	require.NoError(t, err)

	ids := make([]int, len(bugs))
	for i, b := range bugs {
		ids[i] = b.ID
	}
	assert.Contains(t, ids, bug.ID)
}

func TestPostgresKnownBugRepository_Update(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresKnownBugRepository(db.Pool)
	ctx := context.Background()

	bug := &domain.KnownBug{Title: "Bug", Description: "desc", Status: "investigating", Severity: "low"}
	_ = repo.Create(ctx, bug)

	bug.Status = "fixed"
	err := repo.Update(ctx, bug)
	require.NoError(t, err)

	status := "fixed"
	bugs, err := repo.GetAll(ctx, &status)
	require.NoError(t, err)

	ids := make([]int, len(bugs))
	for i, b := range bugs {
		ids[i] = b.ID
	}
	assert.Contains(t, ids, bug.ID)
}

func TestPostgresKnownBugRepository_Delete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresKnownBugRepository(db.Pool)
	ctx := context.Background()

	bug := &domain.KnownBug{Title: "Delete me", Description: "desc", Status: "investigating", Severity: "low"}
	_ = repo.Create(ctx, bug)

	err := repo.Delete(ctx, bug.ID)
	require.NoError(t, err)

	bugs, err := repo.GetAll(ctx, nil)
	require.NoError(t, err)

	for _, b := range bugs {
		assert.NotEqual(t, bug.ID, b.ID)
	}
}
