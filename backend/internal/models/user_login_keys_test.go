package models

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Each user read has its own hand-written column list and scan. A read that
// drops the login-key columns returns a scheme 2 account as scheme 1, and
// sign-in would then ask the app for the password itself.
func TestUserReadsCarryLoginKeyColumns(t *testing.T) {
	ctx := context.Background()
	require.NoError(t, utils.SetEncryptionKey("0123456789abcdef0123456789abcdef"))
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	repo := NewUserRepository(db.Pool)

	email := "login-keys@example.com"
	user := &User{Username: "login_keys_user", Email: &email, PasswordHash: "test-hash"}
	require.NoError(t, repo.Create(ctx, user))
	assert.Equal(t, 1, user.AuthScheme, "Create must read the scheme back, or a new account looks like neither scheme")

	fresh, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, fresh.AuthScheme, "a new account starts on the old scheme")
	assert.Nil(t, fresh.KDFSalt)

	_, err = db.Pool.Exec(ctx, `
		UPDATE users SET auth_scheme = 2, kdf_salt = 'c2FsdC1mb3ItdGVzdA==', kdf_iterations = 600000,
		       recovery_wrapped_private_key = 'wrapped-by-phrase'
		WHERE id = $1`, user.ID)
	require.NoError(t, err)

	reads := map[string]func() (*User, error){
		"GetByID":       func() (*User, error) { return repo.GetByID(ctx, user.ID) },
		"GetByUsername": func() (*User, error) { return repo.GetByUsername(ctx, user.Username) },
		"GetByEmail":    func() (*User, error) { return repo.GetByEmail(ctx, email) },
	}
	for name, read := range reads {
		got, err := read()
		require.NoError(t, err, name)
		require.NotNil(t, got, name)
		assert.Equal(t, "test-hash", got.PasswordHash, name+" must carry the hash a password check compares against")
		assert.Equal(t, 2, got.AuthScheme, name)
		if assert.NotNil(t, got.KDFSalt, name) {
			assert.Equal(t, "c2FsdC1mb3ItdGVzdA==", *got.KDFSalt, name)
		}
		if assert.NotNil(t, got.KDFIterations, name) {
			assert.Equal(t, 600000, *got.KDFIterations, name)
		}
		if assert.NotNil(t, got.RecoveryWrappedPrivateKey, name) {
			assert.Equal(t, "wrapped-by-phrase", *got.RecoveryWrappedPrivateKey, name)
		}
	}
}

// The move replaces the private key copy wrapped with the password, which the
// server has seen; a later password write (reset, change) returns the account
// to scheme 1, or sign-in would ask for a login key the new hash cannot match.
func TestLoginKeyMoveAndPasswordWritesKeepTheSchemeTrue(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))
	repo := NewUserRepository(db.Pool)

	user := &User{Username: "scheme_mover", PasswordHash: "password-hash"}
	require.NoError(t, repo.Create(ctx, user))
	require.NoError(t, repo.UpdateEncryptedPrivateKey(ctx, user.ID, "wrapped-by-password"))

	require.NoError(t, repo.UpgradeToLoginKey(ctx, user.ID, "login-key-hash", "c2FsdC1mb3ItdGVzdA==", 600000, "wrapped-by-wrap-key"))
	moved, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, moved.AuthScheme)
	if assert.NotNil(t, moved.EncryptedPrivateKey) {
		assert.Equal(t, "wrapped-by-wrap-key", *moved.EncryptedPrivateKey)
	}
	assert.ErrorIs(t, repo.UpgradeToLoginKey(ctx, user.ID, "again", "c2FsdC1mb3ItdGVzdA==", 600000, ""), ErrLoginKeyAlreadySet)

	require.NoError(t, repo.UpdatePassword(ctx, user.ID, "new-password-hash"))
	reset, err := repo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, reset.AuthScheme, "a password hash means the password scheme")
	assert.Nil(t, reset.KDFSalt)
	assert.Nil(t, reset.KDFIterations)
}

func TestLoginKeySchemeNeedsSaltAndEnoughRounds(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	var id int
	require.NoError(t, db.Pool.QueryRow(ctx, `
		INSERT INTO users (username, username_normalized, password_hash)
		VALUES ('scheme_check', 'scheme_check', 'test-hash') RETURNING id`).Scan(&id))

	_, err = db.Pool.Exec(ctx, `UPDATE users SET auth_scheme = 2, kdf_iterations = 600000 WHERE id = $1`, id)
	assert.Error(t, err, "scheme 2 without a salt must be refused")

	_, err = db.Pool.Exec(ctx, `UPDATE users SET auth_scheme = 2, kdf_salt = 'c2FsdA==', kdf_iterations = 1000 WHERE id = $1`, id)
	assert.Error(t, err, "scheme 2 with too few rounds must be refused")
}
