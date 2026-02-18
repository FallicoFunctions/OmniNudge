package integration

import (
	"bytes"
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

func TestUserProfile_MeUpdate_ValidatesAndPersists(t *testing.T) {
	deps := newTestDeps(t)
	user := createUser(t, deps.UserRepo, "me_profile_user", "user")

	token, err := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)
	require.NoError(t, err)

	updateBody := map[string]any{
		"bio":        "Integration profile bio",
		"avatar_url": "https://example.com/integration-avatar.png",
	}
	payload, err := json.Marshal(updateBody)
	require.NoError(t, err)

	updateReq, err := http.NewRequest("PUT", "/api/v1/users/me/profile", bytes.NewReader(payload))
	require.NoError(t, err)
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp := doRequest(t, deps.Router, updateReq)
	require.Equal(t, http.StatusOK, updateResp.Code)

	getReq, err := http.NewRequest("GET", "/api/v1/users/me/profile", nil)
	require.NoError(t, err)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getResp := doRequest(t, deps.Router, getReq)
	require.Equal(t, http.StatusOK, getResp.Code)

	var profile map[string]any
	require.NoError(t, json.Unmarshal(getResp.Body.Bytes(), &profile))
	require.Equal(t, "Integration profile bio", profile["bio"])
	require.Equal(t, "https://example.com/integration-avatar.png", profile["avatar_url"])
}

func TestUserProfile_MeUpdate_InvalidAvatarRejected(t *testing.T) {
	deps := newTestDeps(t)
	user := createUser(t, deps.UserRepo, "me_profile_invalid_avatar", "user")

	token, err := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)
	require.NoError(t, err)

	updateBody := map[string]any{
		"avatar_url": "ftp://not-allowed.example/avatar.png",
	}
	payload, err := json.Marshal(updateBody)
	require.NoError(t, err)

	updateReq, err := http.NewRequest("PUT", "/api/v1/users/me/profile", bytes.NewReader(payload))
	require.NoError(t, err)
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp := doRequest(t, deps.Router, updateReq)
	require.Equal(t, http.StatusBadRequest, updateResp.Code)
}
