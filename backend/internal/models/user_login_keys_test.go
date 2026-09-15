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
