package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSettings_GetAndUpdate_AuthenticatedFlow(t *testing.T) {
	deps := newTestDeps(t)
	user := createUser(t, deps.UserRepo, "settings_flow_user", "user")

	token, err := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)
	require.NoError(t, err)

	getReq, err := http.NewRequest("GET", "/api/v1/settings", nil)
	require.NoError(t, err)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getResp := doRequest(t, deps.Router, getReq)
	require.Equal(t, http.StatusOK, getResp.Code, "response: %s", getResp.Body.String())

	updateBody := map[string]any{
		"theme":                           "auto",
		"access_request_cooldown_display": "both",
		"show_push_notifications":         false,
	}
	payload, err := json.Marshal(updateBody)
	require.NoError(t, err)

	updateReq, err := http.NewRequest("PUT", "/api/v1/settings", bytes.NewReader(payload))
	require.NoError(t, err)
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp := doRequest(t, deps.Router, updateReq)
	require.Equal(t, http.StatusOK, updateResp.Code, "response: %s", updateResp.Body.String())

	var updated map[string]any
	require.NoError(t, json.Unmarshal(updateResp.Body.Bytes(), &updated))
	require.Equal(t, "system", updated["theme"])
	require.Equal(t, "both", updated["access_request_cooldown_display"])
	require.Equal(t, false, updated["show_push_notifications"])
}

func TestSettings_Update_RejectsInvalidValues(t *testing.T) {
	deps := newTestDeps(t)
	user := createUser(t, deps.UserRepo, "settings_invalid_user", "user")

	token, err := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)
	require.NoError(t, err)

	testCases := []struct {
		name string
		body map[string]any
	}{
		{
			name: "invalid theme",
			body: map[string]any{"theme": "neon"},
		},
		{
			name: "invalid cooldown display",
			body: map[string]any{"access_request_cooldown_display": "countdown"},
		},
		{
			name: "invalid quiet hours same start end when enabled",
			body: map[string]any{
				"quiet_hours_enabled":       true,
				"quiet_hours_start_minutes": 300,
				"quiet_hours_end_minutes":   300,
			},
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			payload, err := json.Marshal(tc.body)
			require.NoError(t, err)

			req, err := http.NewRequest("PUT", "/api/v1/settings", bytes.NewReader(payload))
			require.NoError(t, err)
			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")

			resp := doRequest(t, deps.Router, req)
			require.Equal(t, http.StatusBadRequest, resp.Code, "response: %s", resp.Body.String())
		})
	}
}

func TestSettings_Endpoints_RequireAuth(t *testing.T) {
	deps := newTestDeps(t)

	getReq, err := http.NewRequest("GET", "/api/v1/settings", nil)
	require.NoError(t, err)
	getResp := doRequest(t, deps.Router, getReq)
	require.Equal(t, http.StatusUnauthorized, getResp.Code)

	updateReq, err := http.NewRequest("PUT", "/api/v1/settings", bytes.NewReader([]byte(`{}`)))
	require.NoError(t, err)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp := doRequest(t, deps.Router, updateReq)
	require.Equal(t, http.StatusUnauthorized, updateResp.Code)
}

func TestSettings_UpdateAndGet_PersistsNotificationPreferenceFields(t *testing.T) {
	deps := newTestDeps(t)
	user := createUser(t, deps.UserRepo, "settings_notif_prefs_user", "user")

	token, err := deps.AuthService.GenerateJWT(user.ID, "", user.Username, user.Role)
	require.NoError(t, err)

	updateBody := map[string]any{
		"notify_comment_replies":   false,
		"notify_post_milestone":    false,
		"notify_post_velocity":     false,
		"notify_comment_milestone": false,
		"notify_comment_velocity":  false,
		"daily_digest":             true,
	}
	payload, err := json.Marshal(updateBody)
	require.NoError(t, err)

	updateReq, err := http.NewRequest("PUT", "/api/v1/settings", bytes.NewReader(payload))
	require.NoError(t, err)
	updateReq.Header.Set("Authorization", "Bearer "+token)
	updateReq.Header.Set("Content-Type", "application/json")
	updateResp := doRequest(t, deps.Router, updateReq)
	require.Equal(t, http.StatusOK, updateResp.Code, "response: %s", updateResp.Body.String())

	getReq, err := http.NewRequest("GET", "/api/v1/settings", nil)
	require.NoError(t, err)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getResp := doRequest(t, deps.Router, getReq)
	require.Equal(t, http.StatusOK, getResp.Code, "response: %s", getResp.Body.String())

	var settings map[string]any
	require.NoError(t, json.Unmarshal(getResp.Body.Bytes(), &settings))
	require.Equal(t, false, settings["notify_comment_replies"])
	require.Equal(t, false, settings["notify_post_milestone"])
	require.Equal(t, false, settings["notify_post_velocity"])
	require.Equal(t, false, settings["notify_comment_milestone"])
	require.Equal(t, false, settings["notify_comment_velocity"])
	require.Equal(t, true, settings["daily_digest"])
}
