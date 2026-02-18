package models

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func TestUserFriendshipRepository_AreUsersFriends(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := NewUserRepository(db.Pool)
	friendRepo := NewUserFriendshipRepository(db.Pool)

	u1 := &User{
		Username:     fmt.Sprintf("friend_u1_%d", time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "hash",
	}
	u2 := &User{
		Username:     fmt.Sprintf("friend_u2_%d", time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "hash",
	}
	require.NoError(t, userRepo.Create(ctx, u1))
	require.NoError(t, userRepo.Create(ctx, u2))

	before, err := friendRepo.AreUsersFriends(ctx, u1.ID, u2.ID)
	require.NoError(t, err)
	require.False(t, before)

	require.NoError(t, friendRepo.UpsertAccepted(ctx, u2.ID, u1.ID))

	after, err := friendRepo.AreUsersFriends(ctx, u1.ID, u2.ID)
	require.NoError(t, err)
	require.True(t, after)
}
