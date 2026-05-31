package models_test

import (
	"context"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createTestUser(t *testing.T, repo *models.UserRepository, username string) int {
	t.Helper()
	user := &models.User{Username: username, PasswordHash: "test_hash"}
	err := repo.Create(context.Background(), user)
	require.NoError(t, err)
	return user.ID
}

func newPaymentRepo(t *testing.T) (*models.CryptoPaymentRepository, *models.UserRepository, int) {
	t.Helper()
	db := testutil.NewTestDatabase(t)
	payRepo := models.NewCryptoPaymentRepository(db.Pool)
	userRepo := models.NewUserRepository(db.Pool)
	userID := createTestUser(t, userRepo, "paytest_user")
	return payRepo, userRepo, userID
}

func TestCryptoPaymentRepository_Create(t *testing.T) {
	repo, _, userID := newPaymentRepo(t)
	ctx := context.Background()

	tests := []struct {
		name    string
		payment models.CryptoPayment
		wantErr bool
	}{
		{
			name: "creates BTC payment",
			payment: models.CryptoPayment{
				UserID:            userID,
				TXID:              "abc123btc",
				Coin:              models.CoinBTC,
				USDPriceAtSubmit:  45000.00,
				AmountReceived:    0.000067,
				USDValue:          3.015,
				PlanMonths:        1,
			},
		},
		{
			name: "creates ETH payment",
			payment: models.CryptoPayment{
				UserID:            userID,
				TXID:              "abc123eth",
				Coin:              models.CoinETH,
				USDPriceAtSubmit:  2500.00,
				AmountReceived:    0.001196,
				USDValue:          2.99,
				PlanMonths:        1,
			},
		},
		{
			name: "creates CAH payment",
			payment: models.CryptoPayment{
				UserID:            userID,
				TXID:              "abc123cah",
				Coin:              models.CoinCAH,
				USDPriceAtSubmit:  0.05,
				AmountReceived:    39.8,
				USDValue:          1.99,
				PlanMonths:        1,
			},
		},
		{
			name: "rejects duplicate txid+coin",
			payment: models.CryptoPayment{
				UserID:            userID,
				TXID:              "abc123btc", // duplicate
				Coin:              models.CoinBTC,
				USDPriceAtSubmit:  45000.00,
				AmountReceived:    0.000067,
				USDValue:          3.015,
				PlanMonths:        1,
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			id, err := repo.Create(ctx, &tc.payment)
			if tc.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Greater(t, id, int64(0))
		})
	}
}

func TestCryptoPaymentRepository_GetByTXID(t *testing.T) {
	repo, _, userID := newPaymentRepo(t)
	ctx := context.Background()

	payment := &models.CryptoPayment{
		UserID:           userID,
		TXID:             "gettxid001",
		Coin:             models.CoinETH,
		USDPriceAtSubmit: 2500.00,
		AmountReceived:   0.001196,
		USDValue:         2.99,
		PlanMonths:       1,
	}
	_, err := repo.Create(ctx, payment)
	require.NoError(t, err)

	t.Run("returns existing payment", func(t *testing.T) {
		got, err := repo.GetByTXID(ctx, "gettxid001", models.CoinETH)
		require.NoError(t, err)
		assert.Equal(t, "gettxid001", got.TXID)
		assert.Equal(t, models.CoinETH, got.Coin)
		assert.Equal(t, models.StatusPending, got.Status)
	})

	t.Run("returns error for missing txid", func(t *testing.T) {
		_, err := repo.GetByTXID(ctx, "doesnotexist", models.CoinBTC)
		assert.Error(t, err)
	})
}

func TestCryptoPaymentRepository_ListPending(t *testing.T) {
	repo, _, userID := newPaymentRepo(t)
	ctx := context.Background()

	// Create two pending, one confirmed
	for i, txid := range []string{"pending001", "pending002"} {
		_, err := repo.Create(ctx, &models.CryptoPayment{
			UserID: userID, TXID: txid, Coin: models.CoinBTC,
			USDPriceAtSubmit: 45000, AmountReceived: 0.000067, USDValue: 3.01, PlanMonths: 1,
		})
		require.NoError(t, err, "create pending %d", i)
	}
	confirmedID, err := repo.Create(ctx, &models.CryptoPayment{
		UserID: userID, TXID: "confirmed001", Coin: models.CoinETH,
		USDPriceAtSubmit: 2500, AmountReceived: 0.001196, USDValue: 2.99, PlanMonths: 1,
	})
	require.NoError(t, err)

	now := time.Now()
	err = repo.UpdateStatus(ctx, confirmedID, models.StatusConfirmed, 12, &now)
	require.NoError(t, err)

	pending, err := repo.ListPending(ctx)
	require.NoError(t, err)
	assert.Len(t, pending, 2)
	for _, p := range pending {
		assert.Equal(t, models.StatusPending, p.Status)
	}
}

func TestCryptoPaymentRepository_UpdateStatus(t *testing.T) {
	repo, _, userID := newPaymentRepo(t)
	ctx := context.Background()

	id, err := repo.Create(ctx, &models.CryptoPayment{
		UserID: userID, TXID: "updatestatus001", Coin: models.CoinBTC,
		USDPriceAtSubmit: 45000, AmountReceived: 0.000067, USDValue: 3.01, PlanMonths: 1,
	})
	require.NoError(t, err)

	t.Run("updates to confirmed with timestamp", func(t *testing.T) {
		now := time.Now()
		err := repo.UpdateStatus(ctx, id, models.StatusConfirmed, 3, &now)
		require.NoError(t, err)

		got, err := repo.GetByTXID(ctx, "updatestatus001", models.CoinBTC)
		require.NoError(t, err)
		assert.Equal(t, models.StatusConfirmed, got.Status)
		assert.Equal(t, 3, got.Confirmations)
		assert.NotNil(t, got.ConfirmedAt)
	})

	t.Run("updates confirmations without changing status", func(t *testing.T) {
		id2, err := repo.Create(ctx, &models.CryptoPayment{
			UserID: userID, TXID: "updatestatus002", Coin: models.CoinBTC,
			USDPriceAtSubmit: 45000, AmountReceived: 0.000067, USDValue: 3.01, PlanMonths: 1,
		})
		require.NoError(t, err)

		err = repo.UpdateStatus(ctx, id2, models.StatusPending, 1, nil)
		require.NoError(t, err)

		got, err := repo.GetByTXID(ctx, "updatestatus002", models.CoinBTC)
		require.NoError(t, err)
		assert.Equal(t, models.StatusPending, got.Status)
		assert.Equal(t, 1, got.Confirmations)
		assert.Nil(t, got.ConfirmedAt)
	})
}

func TestUserRepository_UpdatePlan(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := models.NewUserRepository(db.Pool)
	ctx := context.Background()

	userID := createTestUser(t, repo, "plantest_user")

	t.Run("upgrades to paid with expiry", func(t *testing.T) {
		expires := time.Now().Add(30 * 24 * time.Hour)
		err := repo.UpdatePlan(ctx, userID, models.PlanPaid, &expires)
		require.NoError(t, err)

		plan, expiresAt, err := repo.GetPlan(ctx, userID)
		require.NoError(t, err)
		assert.Equal(t, models.PlanPaid, plan)
		assert.NotNil(t, expiresAt)
	})

	t.Run("downgrades to free clears expiry", func(t *testing.T) {
		err := repo.UpdatePlan(ctx, userID, models.PlanFree, nil)
		require.NoError(t, err)

		plan, expiresAt, err := repo.GetPlan(ctx, userID)
		require.NoError(t, err)
		assert.Equal(t, models.PlanFree, plan)
		assert.Nil(t, expiresAt)
	})
}

func TestUserRepository_ListUsersWithExpiredPlans(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := models.NewUserRepository(db.Pool)
	ctx := context.Background()

	// User with expired plan
	expiredID := createTestUser(t, repo, "expired_plan_user")
	pastExpiry := time.Now().Add(-1 * time.Hour)
	err := repo.UpdatePlan(ctx, expiredID, models.PlanPaid, &pastExpiry)
	require.NoError(t, err)

	// User with active plan
	activeID := createTestUser(t, repo, "active_plan_user")
	futureExpiry := time.Now().Add(30 * 24 * time.Hour)
	err = repo.UpdatePlan(ctx, activeID, models.PlanPaid, &futureExpiry)
	require.NoError(t, err)

	// Free user (should not appear)
	createTestUser(t, repo, "free_plan_user")

	expired, err := repo.ListUsersWithExpiredPlans(ctx)
	require.NoError(t, err)
	assert.Contains(t, expired, expiredID)
	assert.NotContains(t, expired, activeID)
}
