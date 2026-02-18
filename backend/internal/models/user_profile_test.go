package models

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func TestUserProfileRepository_UpsertAndGetByUserID(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := NewUserRepository(db.Pool)
	profileRepo := NewUserProfileRepository(db.Pool)

	user := &User{
		Username:     fmt.Sprintf("profile_repo_%d", time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "test_hash",
	}
	require.NoError(t, userRepo.Create(ctx, user))

	initialBio := "Profile repo bio"
	initialAvatar := "https://example.com/profile.png"
	require.NoError(t, profileRepo.Upsert(ctx, user.ID, &initialBio, &initialAvatar, nil))

	profile, err := profileRepo.GetByUserID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, profile)
	require.NotNil(t, profile.Bio)
	require.NotNil(t, profile.AvatarURL)
	require.Equal(t, initialBio, *profile.Bio)
	require.Equal(t, initialAvatar, *profile.AvatarURL)

	updatedBio := "Updated profile repo bio"
	require.NoError(t, profileRepo.Upsert(ctx, user.ID, &updatedBio, nil, nil))

	updated, err := profileRepo.GetByUserID(ctx, user.ID)
	require.NoError(t, err)
	require.NotNil(t, updated)
	require.NotNil(t, updated.Bio)
	require.Equal(t, updatedBio, *updated.Bio)
	require.Nil(t, updated.AvatarURL)
}
