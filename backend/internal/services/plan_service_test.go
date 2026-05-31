package services_test

import (
	"context"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newPlanService(t *testing.T) (*services.PlanService, *models.UserRepository, int) {
	t.Helper()
	db := testutil.NewTestDatabase(t)
	repo := models.NewUserRepository(db.Pool)

	user := &models.User{Username: "plan_svc_user", PasswordHash: "hash"}
	err := repo.Create(context.Background(), user)
	require.NoError(t, err)

	svc := services.NewPlanService(repo)
	return svc, repo, user.ID
}

func TestPlanService_Upgrade(t *testing.T) {
	svc, repo, userID := newPlanService(t)
	ctx := context.Background()

	err := svc.Upgrade(ctx, userID, 1)
	require.NoError(t, err)

	plan, expiresAt, err := repo.GetPlan(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, models.PlanPaid, plan)
	require.NotNil(t, expiresAt)

	// Expiry should be ~30 days from now (within a 5-minute window)
	expectedExpiry := time.Now().Add(30 * 24 * time.Hour)
	assert.WithinDuration(t, expectedExpiry, *expiresAt, 5*time.Minute)
}

func TestPlanService_Upgrade_ExtendsExistingPlan(t *testing.T) {
	svc, repo, userID := newPlanService(t)
	ctx := context.Background()

	// First month
	err := svc.Upgrade(ctx, userID, 1)
	require.NoError(t, err)

	_, firstExpiry, err := repo.GetPlan(ctx, userID)
	require.NoError(t, err)

	// Second month purchased before first expires — should extend from current expiry
	err = svc.Upgrade(ctx, userID, 1)
	require.NoError(t, err)

	_, secondExpiry, err := repo.GetPlan(ctx, userID)
	require.NoError(t, err)

	assert.True(t, secondExpiry.After(*firstExpiry), "second expiry should be later than first")
}

func TestPlanService_Downgrade(t *testing.T) {
	svc, repo, userID := newPlanService(t)
	ctx := context.Background()

	err := svc.Upgrade(ctx, userID, 1)
	require.NoError(t, err)

	err = svc.Downgrade(ctx, userID)
	require.NoError(t, err)

	plan, expiresAt, err := repo.GetPlan(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, models.PlanFree, plan)
	assert.Nil(t, expiresAt)
}

func TestPlanService_IsPaid(t *testing.T) {
	svc, _, userID := newPlanService(t)
	ctx := context.Background()

	assert.False(t, svc.IsPaid(ctx, userID))

	err := svc.Upgrade(ctx, userID, 1)
	require.NoError(t, err)

	assert.True(t, svc.IsPaid(ctx, userID))
}

func TestPlanService_PriceForCoin(t *testing.T) {
	svc, _, _ := newPlanService(t)

	tests := []struct {
		coin      string
		wantPrice float64
	}{
		{"BTC", 2.99},
		{"ETH", 2.99},
		{"CAH", 1.99},
	}
	for _, tc := range tests {
		t.Run(tc.coin, func(t *testing.T) {
			price, err := svc.PriceForCoin(tc.coin)
			require.NoError(t, err)
			assert.Equal(t, tc.wantPrice, price)
		})
	}

	_, err := svc.PriceForCoin("UNKNOWN")
	assert.Error(t, err)
}
