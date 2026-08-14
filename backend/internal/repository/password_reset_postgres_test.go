package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresPasswordResetRepository_GenerateToken(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPasswordResetRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("pwreset_u")

	pr, err := repo.GenerateToken(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, pr)
	assert.NotEmpty(t, pr.Token)
	assert.Equal(t, user.ID, pr.UserID)
}

func TestPostgresPasswordResetRepository_GetByToken(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPasswordResetRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("pwgettoken_u")
	pr, err := repo.GenerateToken(ctx, user.ID)
	require.NoError(t, err)

	// Valid token — should return the record.
	got, err := repo.GetByToken(ctx, pr.Token)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Empty(t, got.Token, "stored token digests must not leave the repository boundary")

	// Non-existent token — repo returns (nil, nil).
	got2, err2 := repo.GetByToken(ctx, "no-such-token-xyz")
	require.NoError(t, err2)
	assert.Nil(t, got2)
}

func TestPostgresPasswordResetRepository_IsValid(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPasswordResetRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("pwvalid_u")
	pr, err := repo.GenerateToken(ctx, user.ID)
	require.NoError(t, err)

	valid, userID, err := repo.IsValid(ctx, pr.Token)
	require.NoError(t, err)
	assert.True(t, valid)
	assert.Equal(t, user.ID, userID)

	// Non-existent token — repo returns error.
	_, _, err = repo.IsValid(ctx, "no-such-token")
	assert.Error(t, err)
}

func TestPostgresPasswordResetRepository_MarkAsUsed(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPasswordResetRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("pwused_u")
	pr, err := repo.GenerateToken(ctx, user.ID)
	require.NoError(t, err)

	err = repo.MarkAsUsed(ctx, pr.Token)
	require.NoError(t, err)

	// After marking as used, IsValid returns error "token already used".
	_, _, err = repo.IsValid(ctx, pr.Token)
	assert.Error(t, err)
}

func TestPostgresPasswordResetRepository_InvalidateUserTokens(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPasswordResetRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("pwinvalidate_u")
	_, err := repo.GenerateToken(ctx, user.ID)
	require.NoError(t, err)
	_, err = repo.GenerateToken(ctx, user.ID)
	require.NoError(t, err)

	err = repo.InvalidateUserTokens(ctx, user.ID)
	require.NoError(t, err)
}

func TestPostgresPasswordResetRepository_DeleteOldTokens(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresPasswordResetRepository(db.Pool)
	ctx := context.Background()

	deleted, err := repo.DeleteOldTokens(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, deleted, int64(0))
}
