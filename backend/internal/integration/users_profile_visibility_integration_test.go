package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestUserProfile_PrivateVisibility_HiddenFromOthersAndVisibleToOwner(t *testing.T) {
	deps := newTestDeps(t)

	owner := createUser(t, deps.UserRepo, "profile_owner", "user")
	viewer := createUser(t, deps.UserRepo, "profile_viewer", "user")

	settingsRepo := models.NewUserSettingsRepository(deps.DB.Pool)
	settings, err := settingsRepo.CreateDefault(context.Background(), owner.ID)
	require.NoError(t, err)
	require.NotNil(t, settings)

	settings.ProfileVisibility = "private"
	_, err = settingsRepo.Update(context.Background(), settings)
	require.NoError(t, err)

	// Different authenticated viewer should get 404 (fail-closed public shape).
	viewerToken, err := deps.AuthService.GenerateJWT(viewer.ID, "", viewer.Username, viewer.Role)
	require.NoError(t, err)
	req, err := http.NewRequest("GET", "/api/v1/users/"+owner.Username, nil)
	require.NoError(t, err)
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusNotFound, resp.Code)

	// Owner should still see own profile.
	ownerToken, err := deps.AuthService.GenerateJWT(owner.ID, "", owner.Username, owner.Role)
	require.NoError(t, err)
	req2, err := http.NewRequest("GET", "/api/v1/users/"+owner.Username, nil)
	require.NoError(t, err)
	req2.Header.Set("Authorization", "Bearer "+ownerToken)
	resp2 := doRequest(t, deps.Router, req2)
	require.Equal(t, http.StatusOK, resp2.Code)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(resp2.Body.Bytes(), &payload))
	require.Equal(t, owner.Username, payload["username"])
}

func TestUserProfileByID_PublicVisibility_ReturnsProfile(t *testing.T) {
	deps := newTestDeps(t)
	user := createUser(t, deps.UserRepo, "id_profile_user", "user")

	req, err := http.NewRequest("GET", "/api/v1/users/id/"+strconv.Itoa(user.ID)+"/profile", nil)
	require.NoError(t, err)

	resp := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusOK, resp.Code)
}
