package models_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newOmniCreditsRepo(t *testing.T) (*models.OmniCreditsRepository, int) {
	t.Helper()
	db := testutil.NewTestDatabase(t)
	users := models.NewUserRepository(db.Pool)
	id := createTestUser(t, users, "credits_user")
	return models.NewOmniCreditsRepository(db.Pool), id
}

func newOmniCreditsRepoWithPool(t *testing.T) (*models.OmniCreditsRepository, int, *pgxpool.Pool) {
	t.Helper()
	db := testutil.NewTestDatabase(t)
	users := models.NewUserRepository(db.Pool)
	id := createTestUser(t, users, "credits_user_with_pool")
	return models.NewOmniCreditsRepository(db.Pool), id, db.Pool
}

func TestOmniCreditsAuthorizeUsageDebitsGrantBeforePurchaseAndIsIdempotent(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	ctx := context.Background()
	_, err := repo.CreditPurchased(ctx, userID, uuid.New(), 100)
	require.NoError(t, err)
	_, err = repo.GrantSubscription(ctx, userID, uuid.New(), 40, time.Now().Add(time.Hour))
	require.NoError(t, err)
	op := uuid.New()
	first, err := repo.AuthorizeUsage(ctx, userID, op, "omnichat_message", 75)
	require.NoError(t, err)
	assert.Equal(t, int64(40), first.SubscriptionDebited)
	assert.Equal(t, int64(35), first.PurchasedDebited)
	assert.False(t, first.AlreadyAuthorized)
	again, err := repo.AuthorizeUsage(ctx, userID, op, "omnichat_message", 75)
	require.NoError(t, err)
	assert.True(t, again.AlreadyAuthorized)
	wallet, err := repo.GetWallet(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, int64(65), wallet.PurchasedBalance)
	assert.Zero(t, wallet.SubscriptionBalance)
}

func TestOmniCreditsAuthorizationRejectsInsufficientAndConflictingRetries(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	ctx := context.Background()
	_, err := repo.CreditPurchased(ctx, userID, uuid.New(), 10)
	require.NoError(t, err)
	op := uuid.New()
	_, err = repo.AuthorizeUsage(ctx, userID, op, "image", 11)
	assert.ErrorIs(t, err, models.ErrOmniCreditsInsufficient)
	_, err = repo.AuthorizeUsage(ctx, userID, op, "image", 5)
	require.NoError(t, err)
	_, err = repo.AuthorizeUsage(ctx, userID, op, "video", 5)
	assert.ErrorIs(t, err, models.ErrOmniCreditsConflict)
}

func TestOmniCreditsOperationIDCannotCrossCreditAndUsageKinds(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	ctx := context.Background()
	operationID := uuid.New()
	_, err := repo.CreditPurchased(ctx, userID, operationID, 10)
	require.NoError(t, err)
	_, err = repo.AuthorizeUsage(ctx, userID, operationID, "image", 5)
	assert.ErrorIs(t, err, models.ErrOmniCreditsConflict)
}

func TestOmniCreditsCreditOperationCannotBeReusedWithDifferentAmount(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	op := uuid.New()
	_, err := repo.CreditPurchased(context.Background(), userID, op, 10)
	require.NoError(t, err)
	_, err = repo.CreditPurchased(context.Background(), userID, op, 11)
	assert.ErrorIs(t, err, models.ErrOmniCreditsConflict)
}

func TestOmniCreditsExpiredGrantCannotBeSpent(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	ctx := context.Background()
	_, err := repo.GrantSubscription(ctx, userID, uuid.New(), 25, time.Now().Add(-time.Minute))
	require.NoError(t, err)
	_, err = repo.AuthorizeUsage(ctx, userID, uuid.New(), "voice", 1)
	assert.ErrorIs(t, err, models.ErrOmniCreditsInsufficient)
	wallet, err := repo.GetWallet(ctx, userID)
	require.NoError(t, err)
	assert.Zero(t, wallet.SubscriptionBalance)
}

func TestOmniCreditsDeniedReservationPersistsExpiredGrant(t *testing.T) {
	repo, userID, pool := newOmniCreditsRepoWithPool(t)
	ctx := context.Background()
	_, err := repo.GrantSubscription(ctx, userID, uuid.New(), 25, time.Now().Add(-time.Minute))
	require.NoError(t, err)

	_, err = repo.ReserveUsage(ctx, userID, uuid.New(), models.OmniCreditsUsageImage, 10)
	require.ErrorIs(t, err, models.ErrOmniCreditsInsufficient)

	var storedBalance int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT subscription_balance FROM omnicredits_wallets WHERE user_id=$1`, userID).Scan(&storedBalance))
	assert.Zero(t, storedBalance)
	var expiryEntries int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnicredits_ledger WHERE user_id=$1 AND entry_type='subscription_expiry'`, userID).Scan(&expiryEntries))
	assert.Equal(t, 1, expiryEntries)
}

func TestOmniCreditsGrantNeverShortensExistingExpiryAndStoresEffectiveExpiry(t *testing.T) {
	repo, userID, pool := newOmniCreditsRepoWithPool(t)
	ctx := context.Background()
	longExpiry := time.Now().Add(48 * time.Hour).UTC().Truncate(time.Microsecond)
	_, err := repo.GrantSubscription(ctx, userID, uuid.New(), 10, longExpiry)
	require.NoError(t, err)
	shortExpiry := time.Now().Add(time.Hour).UTC().Truncate(time.Microsecond)
	operationID := uuid.New()
	_, err = repo.GrantSubscription(ctx, userID, operationID, 10, shortExpiry)
	require.NoError(t, err)
	wallet, err := repo.GetWallet(ctx, userID)
	require.NoError(t, err)
	require.NotNil(t, wallet.SubscriptionExpiresAt)
	assert.True(t, wallet.SubscriptionExpiresAt.Equal(longExpiry))

	var recordedExpiry time.Time
	err = pool.QueryRow(ctx, `SELECT subscription_expires_at FROM omnicredits_ledger WHERE user_id=$1 AND operation_id=$2`, userID, operationID).Scan(&recordedExpiry)
	require.NoError(t, err)
	assert.True(t, recordedExpiry.Equal(longExpiry))
}

func TestOmniCreditsGrantRetryRemainsIdempotentAfterALaterGrantExtendsExpiry(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	ctx := context.Background()
	firstOperation := uuid.New()
	firstExpiry := time.Now().Add(24 * time.Hour).UTC().Truncate(time.Microsecond)
	_, err := repo.GrantSubscription(ctx, userID, firstOperation, 10, firstExpiry)
	require.NoError(t, err)
	_, err = repo.GrantSubscription(ctx, userID, uuid.New(), 20, firstExpiry.Add(24*time.Hour))
	require.NoError(t, err)

	wallet, err := repo.GrantSubscription(ctx, userID, firstOperation, 10, firstExpiry)
	require.NoError(t, err)
	assert.Equal(t, int64(30), wallet.SubscriptionBalance)

	_, err = repo.GrantSubscription(ctx, userID, firstOperation, 10, firstExpiry.Add(time.Hour))
	assert.ErrorIs(t, err, models.ErrOmniCreditsConflict)
}

func TestOmniCreditsNewGrantDoesNotReviveExpiredCredits(t *testing.T) {
	repo, userID, pool := newOmniCreditsRepoWithPool(t)
	ctx := context.Background()
	_, err := repo.GrantSubscription(ctx, userID, uuid.New(), 25, time.Now().Add(-time.Minute))
	require.NoError(t, err)
	newExpiry := time.Now().Add(time.Hour).UTC().Truncate(time.Microsecond)
	operationID := uuid.New()
	wallet, err := repo.GrantSubscription(ctx, userID, operationID, 10, newExpiry)
	require.NoError(t, err)
	assert.Equal(t, int64(10), wallet.SubscriptionBalance)

	var expiryEntries int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnicredits_ledger WHERE user_id=$1 AND entry_type='subscription_expiry'`, userID).Scan(&expiryEntries))
	assert.Equal(t, 1, expiryEntries)
	var requestedExpiry, effectiveExpiry time.Time
	require.NoError(t, pool.QueryRow(ctx, `SELECT subscription_requested_expires_at, subscription_expires_at FROM omnicredits_ledger WHERE user_id=$1 AND operation_id=$2`, userID, operationID).Scan(&requestedExpiry, &effectiveExpiry))
	assert.True(t, requestedExpiry.Equal(newExpiry))
	assert.True(t, effectiveExpiry.Equal(newExpiry))
}

func TestOmniCreditsGetWalletHidesExpiredGrantBalance(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	_, err := repo.GrantSubscription(context.Background(), userID, uuid.New(), 25, time.Now().Add(-time.Minute))
	require.NoError(t, err)
	wallet, err := repo.GetWallet(context.Background(), userID)
	require.NoError(t, err)
	assert.Zero(t, wallet.SubscriptionBalance)
}

func TestOmniCreditsConcurrentAuthorizationCannotOverspend(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	ctx := context.Background()
	_, err := repo.CreditPurchased(ctx, userID, uuid.New(), 10)
	require.NoError(t, err)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := repo.AuthorizeUsage(ctx, userID, uuid.New(), "media", 7)
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else {
			assert.ErrorIs(t, err, models.ErrOmniCreditsInsufficient)
		}
	}
	assert.Equal(t, 1, successes)
	wallet, err := repo.GetWallet(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, int64(3), wallet.PurchasedBalance)
}

func TestOmniCreditsReservationCaptureAndRefundAreIdempotent(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	ctx := context.Background()
	_, err := repo.CreditPurchased(ctx, userID, uuid.New(), 50)
	require.NoError(t, err)
	operationID := uuid.New()

	reservation, err := repo.ReserveUsage(ctx, userID, operationID, models.OmniCreditsUsageVideo, 40)
	require.NoError(t, err)
	assert.Equal(t, models.OmniCreditsReservationReserved, reservation.Status)
	assert.Equal(t, int64(40), reservation.PurchasedDebited)

	again, err := repo.ReserveUsage(ctx, userID, operationID, models.OmniCreditsUsageVideo, 40)
	require.NoError(t, err)
	assert.True(t, again.AlreadyApplied)

	captured, err := repo.CaptureUsage(ctx, userID, operationID)
	require.NoError(t, err)
	assert.Equal(t, models.OmniCreditsReservationCaptured, captured.Status)
	captured, err = repo.CaptureUsage(ctx, userID, operationID)
	require.NoError(t, err)
	assert.True(t, captured.AlreadyApplied)

	refunded, err := repo.RefundUsage(ctx, userID, operationID)
	require.NoError(t, err)
	assert.Equal(t, models.OmniCreditsReservationRefunded, refunded.Status)
	refunded, err = repo.RefundUsage(ctx, userID, operationID)
	require.NoError(t, err)
	assert.True(t, refunded.AlreadyApplied)
	wallet, err := repo.GetWallet(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, int64(50), wallet.PurchasedBalance)
}

func TestOmniCreditsReservationRejectsConflictsAndForeignOwner(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	ctx := context.Background()
	_, err := repo.CreditPurchased(ctx, userID, uuid.New(), 50)
	require.NoError(t, err)
	op := uuid.New()
	_, err = repo.ReserveUsage(ctx, userID, op, models.OmniCreditsUsageImage, 10)
	require.NoError(t, err)
	_, err = repo.ReserveUsage(ctx, userID, op, models.OmniCreditsUsageVideo, 10)
	assert.ErrorIs(t, err, models.ErrOmniCreditsConflict)
	_, err = repo.CaptureUsage(ctx, userID+9999, op)
	assert.ErrorIs(t, err, models.ErrOmniCreditsReservationNotFound)
}

func TestOmniCreditsRefundDoesNotReviveCreditsFromAnExpiredGrantEpoch(t *testing.T) {
	repo, userID, pool := newOmniCreditsRepoWithPool(t)
	ctx := context.Background()
	firstExpiry := time.Now().Add(time.Hour)
	_, err := repo.GrantSubscription(ctx, userID, uuid.New(), 10, firstExpiry)
	require.NoError(t, err)
	operationID := uuid.New()
	_, err = repo.ReserveUsage(ctx, userID, operationID, models.OmniCreditsUsageImage, 10)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		UPDATE omnicredits_wallets
		SET subscription_expires_at=NOW()-INTERVAL '1 minute'
		WHERE user_id=$1
	`, userID)
	require.NoError(t, err)
	_, err = repo.GrantSubscription(ctx, userID, uuid.New(), 20, time.Now().Add(2*time.Hour))
	require.NoError(t, err)

	_, err = repo.RefundUsage(ctx, userID, operationID)
	require.NoError(t, err)
	wallet, err := repo.GetWallet(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, int64(20), wallet.SubscriptionBalance)
}

func TestOmniCreditsUsageHistoryIsOwnerScopedAndBounded(t *testing.T) {
	repo, userID := newOmniCreditsRepo(t)
	ctx := context.Background()
	_, err := repo.CreditPurchased(ctx, userID, uuid.New(), 10)
	require.NoError(t, err)
	_, err = repo.ReserveUsage(ctx, userID, uuid.New(), models.OmniCreditsUsageVoice, 2)
	require.NoError(t, err)
	items, err := repo.ListUsageOwned(ctx, userID, 1)
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, models.OmniCreditsEntryUsageDebit, items[0].EntryType)
	foreign, err := repo.ListUsageOwned(ctx, userID+9999, 1000)
	require.NoError(t, err)
	require.Empty(t, foreign)
}

func TestOmniCreditsLedgerEnforcesAppendOnlyEntryShapes(t *testing.T) {
	repo, userID, pool := newOmniCreditsRepoWithPool(t)
	_, err := repo.CreditPurchased(context.Background(), userID, uuid.New(), 10)
	require.NoError(t, err)
	_, err = pool.Exec(context.Background(), `UPDATE omnicredits_ledger SET purchased_delta=99 WHERE user_id=$1`, userID)
	assert.Error(t, err)
	_, err = pool.Exec(context.Background(), `INSERT INTO omnicredits_ledger(user_id,operation_id,entry_type,purchased_delta) VALUES($1,$2,'usage_debit',1)`, userID, uuid.New())
	assert.Error(t, err)
}

func TestOmniCreditsLedgerAllowsOnlyUserCascadeDeletion(t *testing.T) {
	repo, userID, pool := newOmniCreditsRepoWithPool(t)
	ctx := context.Background()
	_, err := repo.CreditPurchased(ctx, userID, uuid.New(), 10)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `DELETE FROM omnicredits_ledger WHERE user_id=$1`, userID)
	require.ErrorContains(t, err, "append-only")
	_, err = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID)
	require.NoError(t, err)

	var ledgerRows int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM omnicredits_ledger WHERE user_id=$1`, userID).Scan(&ledgerRows))
	require.Zero(t, ledgerRows)
}
