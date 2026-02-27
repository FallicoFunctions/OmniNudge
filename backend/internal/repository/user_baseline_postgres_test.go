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

func TestPostgresUserBaselineRepository_CreateOrUpdateAndGet(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserBaselineRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ub_u")

	baseline := &domain.UserBaseline{
		UserID:              user.ID,
		AvgPostVotesPerHour: 1.5,
		TotalPosts:          3,
	}

	err := repo.CreateOrUpdate(ctx, baseline)
	require.NoError(t, err)

	got, err := repo.GetByUserID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, user.ID, got.UserID)
}

func TestPostgresUserBaselineRepository_IsNewUser(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserBaselineRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ub_new_u")

	// No baseline yet — should be considered new.
	isNew, err := repo.IsNewUser(ctx, user.ID)
	require.NoError(t, err)
	assert.True(t, isNew)

	_ = repo.CreateOrUpdate(ctx, &domain.UserBaseline{UserID: user.ID, TotalPosts: 10})

	isNew2, err := repo.IsNewUser(ctx, user.ID)
	require.NoError(t, err)
	assert.False(t, isNew2)
}

func TestPostgresUserBaselineRepository_GetAllStaleBaselines(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresUserBaselineRepository(db.Pool)
	ctx := context.Background()

	baselines, err := repo.GetAllStaleBaselines(ctx)
	require.NoError(t, err)
	_ = baselines // May be empty in test DB.
}
