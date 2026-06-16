//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestUserProfile_LastSeenHiddenWhenDisabled(t *testing.T) {
	deps := newTestDeps(t)

	user := createUser(t, deps.UserRepo, "alice", "user")

	settingsRepo := models.NewUserSettingsRepository(deps.DB.Pool)
	settings, err := settingsRepo.CreateDefault(context.Background(), user.ID)
	require.NoError(t, err)
	require.NotNil(t, settings)

	settings.ShowLastSeen = false
	_, err = settingsRepo.Update(context.Background(), settings)
	require.NoError(t, err)

	// Unauthenticated viewer should not see last_seen.
	req, err := http.NewRequest("GET", "/api/v1/users/alice", nil)
	require.NoError(t, err)
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, resp.Code)

	var unauth map[string]any
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &unauth))
	_, ok := unauth["last_seen"]
	require.False(t, ok)

	// The user themselves should always see last_seen (AuthOptional sets viewer context).
	token, err := deps.AuthService.GenerateJWT(user.ID, user.Username, user.Role)
	require.NoError(t, err)

	req2, err := http.NewRequest("GET", "/api/v1/users/alice", nil)
	require.NoError(t, err)
	req2.Header.Set("Authorization", "Bearer "+token)
	resp2 := doRequest(t, deps.Router, req2)
	require.Equal(t, http.StatusOK, resp2.Code)

	var self map[string]any
	require.NoError(t, json.Unmarshal(resp2.Body.Bytes(), &self))
	require.NotEmpty(t, self["last_seen"])
}
