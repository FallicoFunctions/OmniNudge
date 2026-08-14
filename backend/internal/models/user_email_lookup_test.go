package models

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/require"
)

func TestUserEmailLookupUsesBlindIndexAndBackfillsLegacyRows(t *testing.T) {
	ctx := context.Background()
	require.NoError(t, utils.SetEncryptionKey("0123456789abcdef0123456789abcdef"))
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	repo := NewUserRepository(db.Pool)

	email := "User@Example.COM"
	user := &User{Username: "email_lookup_user", Email: &email, PasswordHash: "test-hash"}
	require.NoError(t, repo.Create(ctx, user))

	var lookupHash string
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT email_lookup_hash FROM users WHERE id = $1`, user.ID).Scan(&lookupHash))
	require.Len(t, lookupHash, 64)
	require.NotEqual(t, "user@example.com", lookupHash)

	found, err := repo.GetByEmail(ctx, "  USER@example.com ")
	require.NoError(t, err)
	require.Equal(t, user.ID, found.ID)
	require.Equal(t, "user@example.com", *found.Email)
	duplicateEmail := "USER@example.com"
	duplicate := &User{Username: "email_lookup_duplicate", Email: &duplicateEmail, PasswordHash: "test-hash"}
	require.Error(t, repo.Create(ctx, duplicate), "normalized email blind index must remain unique")

	legacyEmail := "legacy@example.com"
	legacyCiphertext, err := utils.EncryptEmail(legacyEmail)
	require.NoError(t, err)
	var legacyID int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, email, email_encrypted, password_hash)
		VALUES ('legacy_email_lookup', 'legacy_email_lookup', $1, TRUE, 'test-hash')
		RETURNING id
	`, legacyCiphertext).Scan(&legacyID))

	backfilled, err := repo.BackfillEmailLookupHashes(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, backfilled)
	found, err = repo.GetByEmail(ctx, legacyEmail)
	require.NoError(t, err)
	require.Equal(t, legacyID, found.ID)
}
