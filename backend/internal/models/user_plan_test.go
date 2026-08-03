package models

import (
	"context"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func TestUserRepositoryReturnsAuthoritativePlanForAuthResponses(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	repo := NewUserRepository(db.Pool)

	user := &User{Username: "plan_auth_user", PasswordHash: "hash"}
	require.NoError(t, repo.Create(ctx, user))
	require.Equal(t, PlanFree, user.Plan)
	require.Nil(t, user.PlanExpiresAt)

	expiresAt := time.Now().Add(24 * time.Hour).UTC().Truncate(time.Microsecond)
	require.NoError(t, repo.UpdatePlan(ctx, user.ID, PlanPlus, &expiresAt))

	byID, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, PlanPlus, byID.Plan)
	require.NotNil(t, byID.PlanExpiresAt)
	require.True(t, byID.PlanExpiresAt.Equal(expiresAt))

	byUsername, err := repo.GetByUsername(ctx, user.Username)
	require.NoError(t, err)
	require.Equal(t, PlanPlus, byUsername.Plan)
	require.NotNil(t, byUsername.PlanExpiresAt)
	require.True(t, byUsername.PlanExpiresAt.Equal(expiresAt))
}
