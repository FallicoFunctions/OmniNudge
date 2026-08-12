package models

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func readPlanAndPreference(t *testing.T, pool *pgxpool.Pool, userID int) (string, bool) {
	t.Helper()
	var plan string
	var nsfw bool
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT plan, nsfw FROM users WHERE id=$1`, userID).Scan(&plan, &nsfw))
	return plan, nsfw
}

// TestPremiumGrantEnablesTheExplicitPreference documents why granting premium
// touches a preference column at all.
//
// Explicit content requires premium AND users.nsfw, and that column defaults
// to false for every account. Without this coupling a subscriber pays, then
// finds chat clamped and images tame until they discover a settings toggle
// they have no reason to know exists.
func TestPremiumGrantEnablesTheExplicitPreference(t *testing.T) {
	pool, repo, cleanup := setupBanTestDB(t)
	defer cleanup()

	user := createBanTestUser(t, repo, "plangrant_premium")
	require.NoError(t, repo.ExtendPlan(context.Background(), user.ID, PlanPremium, 1))

	plan, nsfw := readPlanAndPreference(t, pool, user.ID)
	require.Equal(t, PlanPremium, plan)
	require.True(t, nsfw, "a premium grant must switch the explicit preference on")
}

func TestPlusGrantLeavesThePreferenceAlone(t *testing.T) {
	// Plus is not an explicit-content tier, so it must not flip the switch.
	pool, repo, cleanup := setupBanTestDB(t)
	defer cleanup()

	user := createBanTestUser(t, repo, "plangrant_plus")
	require.NoError(t, repo.ExtendPlan(context.Background(), user.ID, PlanPlus, 1))

	plan, nsfw := readPlanAndPreference(t, pool, user.ID)
	require.Equal(t, PlanPlus, plan)
	require.False(t, nsfw)
}

func TestRenewalNeverRevokesADeliberateOptOut(t *testing.T) {
	// The grant ORs the preference on and never assigns it, so a subscriber who
	// deliberately switched explicit content off keeps that choice on renewal.
	pool, repo, cleanup := setupBanTestDB(t)
	defer cleanup()
	ctx := context.Background()

	user := createBanTestUser(t, repo, "plangrant_optout")
	require.NoError(t, repo.ExtendPlan(ctx, user.ID, PlanPremium, 1))
	_, err := pool.Exec(ctx, `UPDATE users SET nsfw=FALSE WHERE id=$1`, user.ID)
	require.NoError(t, err)

	require.NoError(t, repo.ExtendPlan(ctx, user.ID, PlanPremium, 1))

	_, nsfw := readPlanAndPreference(t, pool, user.ID)
	require.False(t, nsfw, "renewal must not override a deliberate opt-out")
}
