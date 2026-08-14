package services_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestAuthSessionRotationRevokesOnRefreshReplay(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	user := testutil.NewFixtures(t, db).CreateUniqueUser("session_rotation")
	auth := services.NewAuthService("test-session-secret", "test", "")
	auth.SetUserRepository(repository.NewPostgresUserRepository(db.Pool))
	sessions := services.NewAuthSessionService(db.Pool, auth)
	auth.SetSessionService(sessions)

	created, err := sessions.Create(context.Background(), user, true, "test browser", "127.0.0.1")
	require.NoError(t, err)
	require.NotEmpty(t, created.RefreshToken)
	require.NotEmpty(t, created.CSRFToken)

	claims, err := auth.ValidateJWT(created.AccessToken)
	require.NoError(t, err)
	require.Equal(t, created.SessionID.String(), claims.SessionID)

	_, rotated, err := sessions.Refresh(context.Background(), created.RefreshToken, created.CSRFToken)
	require.NoError(t, err)
	require.NotEqual(t, created.RefreshToken, rotated.RefreshToken)
	require.NotEqual(t, created.CSRFToken, rotated.CSRFToken)

	_, _, err = sessions.Refresh(context.Background(), created.RefreshToken, created.CSRFToken)
	require.ErrorIs(t, err, services.ErrInvalidAuthSession)
	_, err = auth.ValidateJWT(rotated.AccessToken)
	require.ErrorIs(t, err, services.ErrInvalidAuthSession)
}

func TestAuthSessionListAndRevokeAreUserScoped(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	fixtures := testutil.NewFixtures(t, db)
	owner := fixtures.CreateUniqueUser("session_owner")
	other := fixtures.CreateUniqueUser("session_other")
	auth := services.NewAuthService("test-session-secret", "test", "")
	sessions := services.NewAuthSessionService(db.Pool, auth)
	auth.SetSessionService(sessions)

	credentials, err := sessions.Create(context.Background(), owner, false, "owner browser", "")
	require.NoError(t, err)
	items, err := sessions.List(context.Background(), owner.ID)
	require.NoError(t, err)
	require.Len(t, items, 1)

	require.ErrorIs(t, sessions.Revoke(context.Background(), credentials.SessionID.String(), other.ID), services.ErrInvalidAuthSession)
	require.NoError(t, sessions.Validate(context.Background(), credentials.SessionID.String(), owner.ID, owner.TokenVersion, owner.Role))
	require.NoError(t, sessions.Revoke(context.Background(), credentials.SessionID.String(), owner.ID))
	require.ErrorIs(t, sessions.Validate(context.Background(), credentials.SessionID.String(), owner.ID, owner.TokenVersion, owner.Role), services.ErrInvalidAuthSession)
}
