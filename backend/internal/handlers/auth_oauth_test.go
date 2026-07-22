package handlers

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestValidOAuthState(t *testing.T) {
	require.True(t, validOAuthState("same-random-state", "same-random-state"))
	require.False(t, validOAuthState("", ""))
	require.False(t, validOAuthState("same-random-state", "different-state"))
}

func TestSteamInitiationBindsReturnToToStateCookie(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := &OAuthHandler{
		frontendURL: "https://app.example",
		backendURL:  "https://api.example",
		steamAPIKey: "configured",
	}
	router := gin.New()
	router.GET("/auth/oauth/:provider", handler.Initiate)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/auth/oauth/steam", nil))
	require.Equal(t, http.StatusFound, w.Code)

	var state string
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == "oauth_state" {
			state = cookie.Value
			require.True(t, cookie.HttpOnly)
			require.Equal(t, http.SameSiteLaxMode, cookie.SameSite)
		}
	}
	require.NotEmpty(t, state)
	redirect, err := url.Parse(w.Header().Get("Location"))
	require.NoError(t, err)
	returnTo, err := url.Parse(redirect.Query().Get("openid.return_to"))
	require.NoError(t, err)
	require.Equal(t, state, returnTo.Query().Get("state"))
}
