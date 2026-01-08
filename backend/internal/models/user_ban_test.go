package models

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupBanTestDB(t *testing.T) (*pgxpool.Pool, *UserRepository, func()) {
	ctx := context.Background()

	// Set up encryption key for tests
	testKey := "test-encryption-key-32-bytes!"
	err := utils.SetEncryptionKey(testKey)
	require.NoError(t, err)

	// Use test database
	pool, err := pgxpool.New(ctx, "postgres://Nick@localhost:5432/omninudge_test?sslmode=disable")
	require.NoError(t, err)

	userRepo := NewUserRepository(pool)

	cleanup := func() {
		// Clean up test data
		_, _ = pool.Exec(ctx, "DELETE FROM ban_history")
		_, _ = pool.Exec(ctx, "DELETE FROM users WHERE username LIKE 'bantest_%'")
		pool.Close()
	}

	return pool, userRepo, cleanup
}

func createBanTestUser(t *testing.T, repo *UserRepository, username string) *User {
	ctx := context.Background()
	user := &User{
		Username:     username,
		PasswordHash: "test-hash",
		Role:         "user",
	}
	err := repo.Create(ctx, user)
	require.NoError(t, err)
	return user
}

func TestShadowBanUser(t *testing.T) {
	pool, repo, cleanup := setupBanTestDB(t)
	defer cleanup()

	ctx := context.Background()

	// Create test users
	targetUser := createBanTestUser(t, repo, "bantest_target_shadow")
	adminUser := createBanTestUser(t, repo, "bantest_admin_shadow")

	t.Run("successful shadow ban", func(t *testing.T) {
		reason := "Spam posting"
		showReason := true

		err := repo.ShadowBanUser(ctx, targetUser.ID, reason, showReason, adminUser.ID)
		assert.NoError(t, err)

		// Verify user is shadow banned
		var shadowBanned bool
		var banReason *string
		var showBanReason bool
		var bannedBy *int
		err = pool.QueryRow(ctx,
			"SELECT shadow_banned, ban_reason, show_ban_reason, banned_by FROM users WHERE id = $1",
			targetUser.ID,
		).Scan(&shadowBanned, &banReason, &showBanReason, &bannedBy)
		require.NoError(t, err)

		assert.True(t, shadowBanned)
		assert.NotNil(t, banReason)
		assert.Equal(t, reason, *banReason)
		assert.True(t, showBanReason)
		assert.NotNil(t, bannedBy)
		assert.Equal(t, adminUser.ID, *bannedBy)

		// Verify ban history entry
		var historyCount int
		err = pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM ban_history WHERE user_id = $1 AND action = 'shadow_ban' AND admin_id = $2",
			targetUser.ID, adminUser.ID,
		).Scan(&historyCount)
		require.NoError(t, err)
		assert.Equal(t, 1, historyCount)
	})

	t.Run("shadow ban with hidden reason", func(t *testing.T) {
		targetUser2 := createBanTestUser(t, repo, "bantest_target_shadow2")

		err := repo.ShadowBanUser(ctx, targetUser2.ID, "Internal reason", false, adminUser.ID)
		assert.NoError(t, err)

		var showBanReason bool
		err = pool.QueryRow(ctx,
			"SELECT show_ban_reason FROM users WHERE id = $1",
			targetUser2.ID,
		).Scan(&showBanReason)
		require.NoError(t, err)
		assert.False(t, showBanReason)
	})

	t.Run("shadow ban non-existent user", func(t *testing.T) {
		err := repo.ShadowBanUser(ctx, 99999, "Test", true, adminUser.ID)
		assert.Error(t, err)

		// Verify no history entry was created (transaction rollback)
		var historyCount int
		err = pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM ban_history WHERE user_id = 99999",
		).Scan(&historyCount)
		require.NoError(t, err)
		assert.Equal(t, 0, historyCount)
	})
}

func TestBanUser(t *testing.T) {
	pool, repo, cleanup := setupBanTestDB(t)
	defer cleanup()

	ctx := context.Background()

	targetUser := createBanTestUser(t, repo, "bantest_target_ban")
	adminUser := createBanTestUser(t, repo, "bantest_admin_ban")

	t.Run("successful regular ban", func(t *testing.T) {
		reason := "Harassment"
		showReason := true

		err := repo.BanUser(ctx, targetUser.ID, reason, showReason, adminUser.ID)
		assert.NoError(t, err)

		// Verify user is banned
		var banned bool
		var banReason *string
		err = pool.QueryRow(ctx,
			"SELECT banned, ban_reason FROM users WHERE id = $1",
			targetUser.ID,
		).Scan(&banned, &banReason)
		require.NoError(t, err)

		assert.True(t, banned)
		assert.NotNil(t, banReason)
		assert.Equal(t, reason, *banReason)

		// Verify ban history
		var action string
		err = pool.QueryRow(ctx,
			"SELECT action FROM ban_history WHERE user_id = $1 AND admin_id = $2",
			targetUser.ID, adminUser.ID,
		).Scan(&action)
		require.NoError(t, err)
		assert.Equal(t, "ban", action)
	})

	t.Run("ban already banned user", func(t *testing.T) {
		// Should still succeed (idempotent)
		err := repo.BanUser(ctx, targetUser.ID, "Second ban reason", true, adminUser.ID)
		assert.NoError(t, err)

		// Should have 2 history entries
		var historyCount int
		err = pool.QueryRow(ctx,
			"SELECT COUNT(*) FROM ban_history WHERE user_id = $1 AND action = 'ban'",
			targetUser.ID,
		).Scan(&historyCount)
		require.NoError(t, err)
		assert.Equal(t, 2, historyCount)
	})
}

func TestUnbanUser(t *testing.T) {
	pool, repo, cleanup := setupBanTestDB(t)
	defer cleanup()

	ctx := context.Background()

	targetUser := createBanTestUser(t, repo, "bantest_target_unban")
	adminUser := createBanTestUser(t, repo, "bantest_admin_unban")

	// First ban the user
	err := repo.BanUser(ctx, targetUser.ID, "Initial ban", true, adminUser.ID)
	require.NoError(t, err)

	t.Run("successful unban", func(t *testing.T) {
		reason := "Appeal accepted"

		err := repo.UnbanUser(ctx, targetUser.ID, reason, adminUser.ID)
		assert.NoError(t, err)

		// Verify user is unbanned
		var banned bool
		var shadowBanned bool
		var banReason *string
		err = pool.QueryRow(ctx,
			"SELECT banned, shadow_banned, ban_reason FROM users WHERE id = $1",
			targetUser.ID,
		).Scan(&banned, &shadowBanned, &banReason)
		require.NoError(t, err)

		assert.False(t, banned)
		assert.False(t, shadowBanned)
		assert.Nil(t, banReason)

		// Verify unban history entry
		var historyReason string
		err = pool.QueryRow(ctx,
			"SELECT reason FROM ban_history WHERE user_id = $1 AND action = 'unban'",
			targetUser.ID,
		).Scan(&historyReason)
		require.NoError(t, err)
		assert.Equal(t, reason, historyReason)
	})
}

func TestSoftDeleteUser(t *testing.T) {
	pool, repo, cleanup := setupBanTestDB(t)
	defer cleanup()

	ctx := context.Background()

	targetUser := createBanTestUser(t, repo, "bantest_target_delete")
	adminUser := createBanTestUser(t, repo, "bantest_admin_delete")

	t.Run("successful soft delete", func(t *testing.T) {
		reason := "Terms violation"

		err := repo.SoftDeleteUser(ctx, targetUser.ID, reason, adminUser.ID)
		assert.NoError(t, err)

		// Verify user is soft deleted
		var deleted bool
		var banReason *string
		err = pool.QueryRow(ctx,
			"SELECT deleted, ban_reason FROM users WHERE id = $1",
			targetUser.ID,
		).Scan(&deleted, &banReason)
		require.NoError(t, err)

		assert.True(t, deleted)
		assert.NotNil(t, banReason)
		assert.Equal(t, reason, *banReason)

		// Verify delete history entry
		var action string
		err = pool.QueryRow(ctx,
			"SELECT action FROM ban_history WHERE user_id = $1 AND admin_id = $2",
			targetUser.ID, adminUser.ID,
		).Scan(&action)
		require.NoError(t, err)
		assert.Equal(t, "delete", action)
	})
}

func TestGetBanHistory(t *testing.T) {
	_, repo, cleanup := setupBanTestDB(t)
	defer cleanup()

	ctx := context.Background()

	targetUser := createBanTestUser(t, repo, "bantest_target_history")
	adminUser := createBanTestUser(t, repo, "bantest_admin_history")

	// Create multiple ban actions
	err := repo.ShadowBanUser(ctx, targetUser.ID, "First action", true, adminUser.ID)
	require.NoError(t, err)

	time.Sleep(10 * time.Millisecond) // Ensure different timestamps

	err = repo.UnbanUser(ctx, targetUser.ID, "Unbanned", adminUser.ID)
	require.NoError(t, err)

	time.Sleep(10 * time.Millisecond)

	err = repo.BanUser(ctx, targetUser.ID, "Second ban", false, adminUser.ID)
	require.NoError(t, err)

	t.Run("get user ban history", func(t *testing.T) {
		history, err := repo.GetBanHistory(ctx, targetUser.ID)
		assert.NoError(t, err)
		assert.Len(t, history, 3)

		// History should be in reverse chronological order
		assert.Equal(t, "ban", history[0].Action)
		assert.Equal(t, "unban", history[1].Action)
		assert.Equal(t, "shadow_ban", history[2].Action)

		// Verify admin name is populated
		assert.Equal(t, "bantest_admin_history", history[0].AdminName)
	})

	t.Run("get empty history for user with no bans", func(t *testing.T) {
		newUser := createBanTestUser(t, repo, "bantest_nobans")
		history, err := repo.GetBanHistory(ctx, newUser.ID)
		assert.NoError(t, err)
		assert.Len(t, history, 0)
	})
}

func TestGetAllBanHistory(t *testing.T) {
	_, repo, cleanup := setupBanTestDB(t)
	defer cleanup()

	ctx := context.Background()

	// Create multiple users and ban actions
	admin := createBanTestUser(t, repo, "bantest_admin_all")

	for i := 1; i <= 5; i++ {
		user := createBanTestUser(t, repo, "bantest_user_all_"+string(rune(i)))
		_ = repo.BanUser(ctx, user.ID, "Test ban", true, admin.ID)
	}

	t.Run("get all ban history with pagination", func(t *testing.T) {
		history, err := repo.GetAllBanHistory(ctx, 3, 0)
		assert.NoError(t, err)
		assert.Len(t, history, 3)

		// Get next page
		history2, err := repo.GetAllBanHistory(ctx, 3, 3)
		assert.NoError(t, err)
		assert.GreaterOrEqual(t, len(history2), 2) // At least 2 more entries

		// Verify no duplicate entries
		ids := make(map[int]bool)
		for _, h := range history {
			ids[h.ID] = true
		}
		for _, h := range history2 {
			assert.False(t, ids[h.ID], "Found duplicate entry in pagination")
		}
	})

	t.Run("verify admin name is populated", func(t *testing.T) {
		history, err := repo.GetAllBanHistory(ctx, 10, 0)
		assert.NoError(t, err)

		for _, h := range history {
			assert.NotEmpty(t, h.AdminName)
			assert.Equal(t, "bantest_admin_all", h.AdminName)
		}
	})
}

func TestBanTransactionRollback(t *testing.T) {
	pool, repo, cleanup := setupBanTestDB(t)
	defer cleanup()

	ctx := context.Background()

	targetUser := createBanTestUser(t, repo, "bantest_rollback")

	t.Run("transaction rolls back on invalid admin_id", func(t *testing.T) {
		// Try to ban with non-existent admin (should fail foreign key constraint)
		err := repo.BanUser(ctx, targetUser.ID, "Test", true, 99999)
		assert.Error(t, err)

		// Verify user was NOT banned
		var banned bool
		err = pool.QueryRow(ctx, "SELECT banned FROM users WHERE id = $1", targetUser.ID).Scan(&banned)
		require.NoError(t, err)
		assert.False(t, banned)

		// Verify no ban history was created
		var count int
		err = pool.QueryRow(ctx, "SELECT COUNT(*) FROM ban_history WHERE user_id = $1", targetUser.ID).Scan(&count)
		require.NoError(t, err)
		assert.Equal(t, 0, count)
	})
}
