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

func TestPostgresDeviceTokenRepository_Upsert(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresDeviceTokenRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("dt_upsert_u")
	token := fmt.Sprintf("tok_%d", time.Now().UnixNano())

	dt := &domain.DeviceToken{
		UserID:     user.ID,
		Token:      token,
		DeviceType: "web",
		DeviceName: "Chrome",
	}

	err := repo.Upsert(ctx, dt)
	require.NoError(t, err)

	// Upsert again — should not error.
	err = repo.Upsert(ctx, dt)
	require.NoError(t, err)
}

func TestPostgresDeviceTokenRepository_GetByUserID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresDeviceTokenRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("dt_list_u")
	token := fmt.Sprintf("tok_%d", time.Now().UnixNano())
	dt := &domain.DeviceToken{UserID: user.ID, Token: token, DeviceType: "web", DeviceName: "Chrome"}
	_ = repo.Upsert(ctx, dt)

	tokens, err := repo.GetByUserID(ctx, user.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, tokens)
}

func TestPostgresDeviceTokenRepository_DeleteByUserAndToken(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresDeviceTokenRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("dt_del_u")
	token := fmt.Sprintf("tok_%d", time.Now().UnixNano())
	dt := &domain.DeviceToken{UserID: user.ID, Token: token, DeviceType: "web", DeviceName: "Chrome"}
	_ = repo.Upsert(ctx, dt)

	err := repo.DeleteByUserAndToken(ctx, user.ID, token)
	require.NoError(t, err)

	tokens, err := repo.GetByUserID(ctx, user.ID)
	require.NoError(t, err)
	for _, t2 := range tokens {
		assert.NotEqual(t, token, t2.Token)
	}
}

func TestPostgresDeviceTokenRepository_UpdateLastUsed(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresDeviceTokenRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("dt_lastused_u")
	token := fmt.Sprintf("tok_%d", time.Now().UnixNano())
	dt := &domain.DeviceToken{UserID: user.ID, Token: token, DeviceType: "web", DeviceName: "Chrome"}
	_ = repo.Upsert(ctx, dt)

	err := repo.UpdateLastUsed(ctx, token)
	assert.NoError(t, err)
}
