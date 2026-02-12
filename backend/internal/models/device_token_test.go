package models

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeviceTokenRepository(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	defer db.Close()

	ctx := context.Background()
	err = database.DropSchema(ctx, db)
	require.NoError(t, err)

	err = db.Migrate(ctx)
	require.NoError(t, err)

	repo := NewDeviceTokenRepository(db.Pool)
	userRepo := NewUserRepository(db.Pool)

	// Create a test user
	user := &User{
		Username:     "test_token_user",
		PasswordHash: "hash",
	}
	err = userRepo.Create(ctx, user)
	require.NoError(t, err)

	t.Run("Upsert and GetByUserID", func(t *testing.T) {
		dt := &DeviceToken{
			UserID:     user.ID,
			Token:      "token123",
			DeviceType: "ios",
			DeviceName: "iPhone 15",
		}

		err := repo.Upsert(ctx, dt)
		require.NoError(t, err)
		assert.NotZero(t, dt.ID)

		tokens, err := repo.GetByUserID(ctx, user.ID)
		require.NoError(t, err)
		assert.Len(t, tokens, 1)
		assert.Equal(t, "token123", tokens[0].Token)

		// Test Upsert Update (Token already exists, change user/type)
		dt.DeviceName = "Updated iPhone"
		err = repo.Upsert(ctx, dt)
		require.NoError(t, err)

		tokens, err = repo.GetByUserID(ctx, user.ID)
		require.NoError(t, err)
		assert.Len(t, tokens, 1)
		assert.Equal(t, "Updated iPhone", tokens[0].DeviceName)
	})

	t.Run("DeleteByUserAndToken", func(t *testing.T) {
		token := "delete_me"
		dt := &DeviceToken{
			UserID:     user.ID,
			Token:      token,
			DeviceType: "android",
		}
		err := repo.Upsert(ctx, dt)
		require.NoError(t, err)

		err = repo.DeleteByUserAndToken(ctx, user.ID, token)
		require.NoError(t, err)

		tokens, err := repo.GetByUserID(ctx, user.ID)
		require.NoError(t, err)
		for _, tk := range tokens {
			assert.NotEqual(t, token, tk.Token)
		}
	})

	t.Run("UpdateLastUsed", func(t *testing.T) {
		token := "last_used_token"
		dt := &DeviceToken{
			UserID:     user.ID,
			Token:      token,
			DeviceType: "web",
		}
		err := repo.Upsert(ctx, dt)
		require.NoError(t, err)

		before := dt.LastUsedAt
		err = repo.UpdateLastUsed(ctx, token)
		require.NoError(t, err)

		tokens, err := repo.GetByUserID(ctx, user.ID)
		require.NoError(t, err)

		var updatedDt *DeviceToken
		for _, tk := range tokens {
			if tk.Token == token {
				updatedDt = tk
				break
			}
		}
		require.NotNil(t, updatedDt)
		assert.True(t, updatedDt.LastUsedAt.After(before))
	})
}
