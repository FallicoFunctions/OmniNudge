package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/ports"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/omninudge/backend/internal/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newEmailVerificationRepository(t *testing.T) (ports.EmailVerificationRepository, *testutil.TestDatabase) {
	t.Helper()
	require.NoError(t, utils.SetEncryptionKey("0123456789abcdef0123456789abcdef"))
	db := testutil.NewTestDatabase(t)
	return repository.NewPostgresEmailVerificationRepository(db.Pool), db
}

func TestPostgresEmailVerificationRepository_GenerateToken(t *testing.T) {
	repo, db := newEmailVerificationRepository(t)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ev_gen_u")

	ev, err := repo.GenerateToken(ctx, user.ID, "test@example.com", "email_verification")
	require.NoError(t, err)
	require.NotNil(t, ev)
	assert.NotEmpty(t, ev.Token)
}

func TestPostgresEmailVerificationRepository_GetByToken(t *testing.T) {
	repo, db := newEmailVerificationRepository(t)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ev_bytoken_u")
	ev, err := repo.GenerateToken(ctx, user.ID, "test@example.com", "email_verification")
	require.NoError(t, err)

	tests := []struct {
		name    string
		token   string
		wantNil bool
	}{
		{"valid token", ev.Token, false},
		{"non-existent token", "no-such-token-xyz", true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByToken(ctx, tc.token)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Empty(t, got.Token, "stored token digests must not leave the repository boundary")
			}
		})
	}
}

func TestPostgresEmailVerificationRepository_IsValid(t *testing.T) {
	repo, db := newEmailVerificationRepository(t)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ev_valid_u")
	ev, err := repo.GenerateToken(ctx, user.ID, "test@example.com", "email_verification")
	require.NoError(t, err)

	valid, uid, purpose, err := repo.IsValid(ctx, ev.Token)
	require.NoError(t, err)
	assert.True(t, valid)
	assert.Equal(t, user.ID, uid)
	assert.Equal(t, "email_verification", purpose)
}

func TestPostgresEmailVerificationRepository_GetPendingVerification(t *testing.T) {
	repo, db := newEmailVerificationRepository(t)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ev_pending_u")
	_, err := repo.GenerateToken(ctx, user.ID, "test@example.com", "email_verification")
	require.NoError(t, err)

	got, err := repo.GetPendingVerification(ctx, user.ID, "email_verification")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, user.ID, got.UserID)
}

func TestPostgresEmailVerificationRepository_InvalidateUserTokens(t *testing.T) {
	repo, db := newEmailVerificationRepository(t)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	user := fx.CreateUniqueUser("ev_invalidate_u")
	_, err := repo.GenerateToken(ctx, user.ID, "test@example.com", "email_verification")
	require.NoError(t, err)

	err = repo.InvalidateUserTokens(ctx, user.ID, "email_verification")
	require.NoError(t, err)

	// After invalidation, GetPendingVerification returns (nil, nil).
	got, err2 := repo.GetPendingVerification(ctx, user.ID, "email_verification")
	require.NoError(t, err2)
	assert.Nil(t, got)
}
