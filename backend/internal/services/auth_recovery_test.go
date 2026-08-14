package services

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/require"
)

var authRecoveryCounter int64

func TestLoginRestoresPendingDeletionAndRotatesTokenVersion(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	password := "recovery-password-123"
	hash, err := utils.HashPassword(password)
	require.NoError(t, err)
	repo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     fmt.Sprintf("recovery_%d_%d", time.Now().UnixNano(), atomic.AddInt64(&authRecoveryCounter, 1)),
		PasswordHash: hash,
	}
	require.NoError(t, repo.Create(ctx, user))
	originalVersion := user.TokenVersion
	_, err = db.Pool.Exec(ctx, `
		UPDATE users
		SET deleted_at=NOW(), permanent_deletion_at=NOW()+INTERVAL '30 days',
		    token_version=token_version+1
		WHERE id=$1
	`, user.ID)
	require.NoError(t, err)

	auth := NewAuthService("01234567890123456789012345678901", "test", "")
	restored, _, err := auth.Login(ctx, repo, &LoginRequest{Username: user.Username, Password: password})
	require.NoError(t, err)
	require.Nil(t, restored.DeletedAt)
	require.Nil(t, restored.PermanentDeletionAt)
	require.Equal(t, originalVersion+2, restored.TokenVersion)

	loaded, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	require.Nil(t, loaded.DeletedAt)
	require.Equal(t, originalVersion+2, loaded.TokenVersion)
}

func TestLoginDoesNotRestoreExpiredDeletion(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	password := "recovery-password-123"
	hash, err := utils.HashPassword(password)
	require.NoError(t, err)
	repo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     fmt.Sprintf("expired_recovery_%d_%d", time.Now().UnixNano(), atomic.AddInt64(&authRecoveryCounter, 1)),
		PasswordHash: hash,
	}
	require.NoError(t, repo.Create(ctx, user))
	_, err = db.Pool.Exec(ctx, `
		UPDATE users
		SET deleted_at=NOW()-INTERVAL '31 days', permanent_deletion_at=NOW()-INTERVAL '1 day'
		WHERE id=$1
	`, user.ID)
	require.NoError(t, err)

	auth := NewAuthService("01234567890123456789012345678901", "test", "")
	_, _, err = auth.Login(ctx, repo, &LoginRequest{Username: user.Username, Password: password})
	require.Error(t, err)

	loaded, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, loaded.DeletedAt)
}

func TestRestorePendingDeletionRejectsRevokedAccounts(t *testing.T) {
	repo := &models.UserRepository{}
	for _, user := range []*models.User{
		nil,
		{ID: 1, Banned: true},
		{ID: 2, Deleted: true},
	} {
		require.Error(t, RestorePendingDeletionAfterAuthentication(context.Background(), repo, user))
	}
}
