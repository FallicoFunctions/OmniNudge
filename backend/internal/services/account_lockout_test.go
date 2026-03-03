package services_test

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"

	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var lockoutTestCounter atomic.Int64

func uniqueIdentifier(prefix string) string {
	return fmt.Sprintf("%s_%d", prefix, lockoutTestCounter.Add(1))
}

func TestAccountLockoutService_RecordFailure(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	svc := services.NewAccountLockoutService(db.Pool)
	ctx := context.Background()

	tests := []struct {
		name       string
		identifier string
		ipAddress  string
		wantErr    bool
	}{
		{
			name:       "records failure with IP",
			identifier: uniqueIdentifier("user"),
			ipAddress:  "127.0.0.1",
			wantErr:    false,
		},
		{
			name:       "records failure without IP",
			identifier: uniqueIdentifier("user"),
			ipAddress:  "",
			wantErr:    false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := svc.RecordFailure(ctx, tc.identifier, tc.ipAddress)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestAccountLockoutService_IsLocked(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	svc := services.NewAccountLockoutService(db.Pool)
	ctx := context.Background()

	t.Run("not locked with no failures", func(t *testing.T) {
		id := uniqueIdentifier("nolock")
		locked, err := svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		assert.False(t, locked)
	})

	t.Run("not locked with fewer than 5 failures", func(t *testing.T) {
		id := uniqueIdentifier("fewfail")
		for i := 0; i < 4; i++ {
			require.NoError(t, svc.RecordFailure(ctx, id, ""))
		}
		locked, err := svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		assert.False(t, locked)
	})

	t.Run("locked with exactly 5 failures", func(t *testing.T) {
		id := uniqueIdentifier("lock5")
		for i := 0; i < 5; i++ {
			require.NoError(t, svc.RecordFailure(ctx, id, "10.0.0.1"))
		}
		locked, err := svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		assert.True(t, locked)
	})

	t.Run("locked with more than 5 failures", func(t *testing.T) {
		id := uniqueIdentifier("lock10")
		for i := 0; i < 10; i++ {
			require.NoError(t, svc.RecordFailure(ctx, id, ""))
		}
		locked, err := svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		assert.True(t, locked)
	})

	// Fix 14: time-boundary test — failures outside the window must not trigger a lock.
	t.Run("not locked when all failures are outside the 15-minute window", func(t *testing.T) {
		id := uniqueIdentifier("expired")
		// Insert 5 failures with attempted_at 16 minutes in the past, directly via
		// the pool, bypassing RecordFailure so we can control the timestamp.
		for i := 0; i < 5; i++ {
			_, err := db.Pool.Exec(ctx,
				`INSERT INTO failed_login_attempts (identifier, attempted_at)
				 VALUES ($1, NOW() - INTERVAL '16 minutes')`,
				id,
			)
			require.NoError(t, err)
		}
		locked, err := svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		assert.False(t, locked, "failures outside the lockout window must not lock the account")
	})

	// Fix 5: identifier-based lock must trigger even when ipAddress is "".
	// This verifies the two-query split in IsLocked (Fix 3) does not break the
	// identifier path when no IP is provided.
	t.Run("locked by identifier with empty IP when 5 failures recorded", func(t *testing.T) {
		id := uniqueIdentifier("lock_emptyip")
		for i := 0; i < 5; i++ {
			require.NoError(t, svc.RecordFailure(ctx, id, ""))
		}
		locked, err := svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		assert.True(t, locked, "identifier-based lock must trigger with empty IP")
	})

	// IP-based lockout: 5 failures from the same IP against different identifiers.
	t.Run("locked by IP address even with different identifiers", func(t *testing.T) {
		ip := "192.0.2.1"
		for i := 0; i < 5; i++ {
			id := uniqueIdentifier(fmt.Sprintf("iplock%d", i))
			require.NoError(t, svc.RecordFailure(ctx, id, ip))
		}
		// A fresh identifier from the same IP should appear locked.
		freshID := uniqueIdentifier("iplockfresh")
		locked, err := svc.IsLocked(ctx, freshID, ip)
		require.NoError(t, err)
		assert.True(t, locked, "account should be locked when IP has >= 5 failures")
	})
}

func TestAccountLockoutService_ResetIP(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	svc := services.NewAccountLockoutService(db.Pool)
	ctx := context.Background()

	t.Run("ResetIP clears window failures for that IP", func(t *testing.T) {
		ip := "10.0.1.1"
		id := uniqueIdentifier("resetip_clears")
		for i := 0; i < 5; i++ {
			require.NoError(t, svc.RecordFailure(ctx, id, ip))
		}
		locked, err := svc.IsLocked(ctx, id, ip)
		require.NoError(t, err)
		require.True(t, locked, "should be locked before ResetIP")

		require.NoError(t, svc.ResetIP(ctx, ip))

		locked, err = svc.IsLocked(ctx, id, ip)
		require.NoError(t, err)
		assert.False(t, locked, "should not be locked after ResetIP")
	})

	t.Run("ResetIP with empty string is a no-op (no error)", func(t *testing.T) {
		err := svc.ResetIP(ctx, "")
		require.NoError(t, err)
	})

	t.Run("ResetIP on unknown IP does not error", func(t *testing.T) {
		err := svc.ResetIP(ctx, "10.0.0.99")
		require.NoError(t, err)
	})

	t.Run("ResetIP does not clear identifier-based failures", func(t *testing.T) {
		ip := "10.0.1.2"
		otherIP := "10.0.1.3"
		id := uniqueIdentifier("resetip_nodestroy")
		// Record 5 failures for id with ip
		for i := 0; i < 5; i++ {
			require.NoError(t, svc.RecordFailure(ctx, id, ip))
		}
		// Verify identifier is locked
		locked, err := svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		require.True(t, locked, "should be locked by identifier before ResetIP")

		// Reset a different IP — should not affect identifier-based lock
		require.NoError(t, svc.ResetIP(ctx, otherIP))

		// Identifier lock should still hold
		locked, err = svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		assert.True(t, locked, "identifier-based lock should remain after ResetIP of a different IP")
	})
}

func TestAccountLockoutService_Reset(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	svc := services.NewAccountLockoutService(db.Pool)
	ctx := context.Background()

	t.Run("reset clears active-window failures", func(t *testing.T) {
		id := uniqueIdentifier("reset")
		for i := 0; i < 5; i++ {
			require.NoError(t, svc.RecordFailure(ctx, id, ""))
		}
		locked, err := svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		require.True(t, locked, "should be locked before reset")

		require.NoError(t, svc.Reset(ctx, id))

		locked, err = svc.IsLocked(ctx, id, "")
		require.NoError(t, err)
		assert.False(t, locked, "should not be locked after reset")
	})

	t.Run("reset preserves historical failures outside the lockout window", func(t *testing.T) {
		id := uniqueIdentifier("resethistory")
		// Insert one old failure (outside window) directly.
		_, err := db.Pool.Exec(ctx,
			`INSERT INTO failed_login_attempts (identifier, attempted_at)
			 VALUES ($1, NOW() - INTERVAL '60 minutes')`,
			id,
		)
		require.NoError(t, err)

		// Also insert active-window failures.
		for i := 0; i < 5; i++ {
			require.NoError(t, svc.RecordFailure(ctx, id, ""))
		}

		// Reset should clear only the active-window failures.
		require.NoError(t, svc.Reset(ctx, id))

		// Confirm the historical row was preserved.
		var remaining int
		err = db.Pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM failed_login_attempts WHERE identifier = $1`, id,
		).Scan(&remaining)
		require.NoError(t, err)
		assert.Equal(t, 1, remaining, "historical failure outside window should be preserved")
	})

	t.Run("reset on unknown identifier is a no-op", func(t *testing.T) {
		id := uniqueIdentifier("noop")
		err := svc.Reset(ctx, id)
		require.NoError(t, err)
	})
}
