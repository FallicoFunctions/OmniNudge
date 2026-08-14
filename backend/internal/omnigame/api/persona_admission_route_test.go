package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

const testAdmitSecret = "persona-admit-secret-that-is-long-enough"

func TestRouter_AdmitEndpointRefusesRequestWithoutCredential(t *testing.T) {
	router, _ := newAdmissionRouter(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/admit/omnirave", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.NotContains(t, rec.Body.String(), "worldSessionToken")
}

// A logged-in user's browser sends its site cookie automatically, so if this
// route could be satisfied by one, any page could make a signed-in user admit
// a character and then act as it. The cookie has to be worth exactly nothing
// here, which is why this case gets its own test rather than being folded into
// "some invalid credential".
func TestRouter_AdmitEndpointRefusesSiteSessionCookie(t *testing.T) {
	router, authService := newAdmissionRouter(t)

	siteToken, err := authService.GenerateJWT(42, "alice", "user")
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/admit/omnirave", nil)
	req.AddCookie(&http.Cookie{Name: services.AccessTokenCookieName, Value: siteToken})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
	require.NotContains(t, rec.Body.String(), "worldSessionToken")
}

func TestRouter_AdmitEndpointAdmitsWithAgentRuntimeCredential(t *testing.T) {
	router, _ := newAdmissionRouter(t)

	admissionAuth, err := services.NewPersonaAdmissionAuth(testAdmitSecret, "dev-secret")
	require.NoError(t, err)
	credential, err := admissionAuth.Mint(7, time.Minute)
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/admit/omnirave", nil)
	req.Header.Set("Authorization", "Bearer "+credential)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var payload map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
	require.Equal(t, "persona-7", payload["playerId"])
	require.Equal(t, "The Narrator", payload["playerName"])
	require.NotEmpty(t, payload["worldSessionToken"])
}

// The handler's central claim is that the persona comes from the credential
// and never from the request body. Nothing tested it, which meant the claim
// held only for as long as nobody added a convenient body field: one valid
// credential would then admit any character, and naming the persona inside the
// signed token would stop meaning anything.
//
// Both spellings are sent because a body is only ignored if it is ignored
// however it is written; a binding added later would plausibly use either.
func TestRouter_AdmitEndpointIgnoresPersonaNamedInTheBody(t *testing.T) {
	for _, body := range []string{`{"persona_id": 999}`, `{"personaID": 999}`} {
		t.Run(body, func(t *testing.T) {
			router, _ := newAdmissionRouter(t)

			admissionAuth, err := services.NewPersonaAdmissionAuth(testAdmitSecret, "dev-secret")
			require.NoError(t, err)
			credential, err := admissionAuth.Mint(7, time.Minute)
			require.NoError(t, err)

			req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/admit/omnirave", strings.NewReader(body))
			req.Header.Set("Authorization", "Bearer "+credential)
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			require.Equal(t, http.StatusOK, rec.Code)

			var payload map[string]string
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
			require.Equal(t, "persona-7", payload["playerId"], "the credential names the persona, not the body")
			require.Equal(t, "The Narrator", payload["playerName"])
			require.NotContains(t, payload["playerId"], "999")
		})
	}
}

func newAdmissionRouter(t *testing.T) (*gin.Engine, *services.AuthService) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	sessionService := service.NewSessionServiceWithDependencies(
		"http://localhost:4173/omnirave",
		"ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(),
		repository.NewInMemorySanctionRepository(),
		authService,
	)

	personas := repository.NewInMemoryPersonaRepository()
	personas.Add(repository.AdmissiblePersona{ID: 7, Name: "The Narrator"})

	admissionAuth, err := services.NewPersonaAdmissionAuth(testAdmitSecret, "dev-secret")
	require.NoError(t, err)

	router := NewRouter(
		sessionService,
		authService,
		service.NewAdmissionService(personas, repository.NewInMemoryProfileRepository(), authService),
		admissionAuth,
		nil,
		nil,
		[]string{"127.0.0.1/32", "::1/128"},
	)

	return router, authService
}
