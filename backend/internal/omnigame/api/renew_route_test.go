package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func newRenewTestRouter(t *testing.T) (*services.AuthService, *repository.InMemorySanctionRepository, http.Handler) {
	t.Helper()
	authService := services.NewAuthService("dev-secret", "OmniGame/1.0", "")
	sanctions := repository.NewInMemorySanctionRepository()
	sessions := service.NewSessionServiceWithDependencies("http://localhost:4173/", "ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(), sanctions, authService)
	return authService, sanctions, NewRouter(sessions, authService, nil, nil, nil, nil, []string{"127.0.0.1/32"}, newTestLimitCache(t))
}

func renew(router http.Handler, token, clientIP string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"worldSessionToken": token})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/session/renew", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "127.0.0.1:40000"
	req.Header.Set("X-Forwarded-For", clientIP)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestRouter_RenewIssuesAFreshTokenForTheSamePlayer(t *testing.T) {
	authService, _, router := newRenewTestRouter(t)
	current, err := authService.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{
		SubjectKind: model.SubjectKindGuest, PlayerID: "guest-7", PlayerName: "Guest-7", Mode: "guest",
	})
	require.NoError(t, err)

	rec := renew(router, current, "203.0.113.9")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct{ WorldSessionToken string }
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	claims, err := authService.ValidateOmniRaveWorldJWTContext(context.Background(), body.WorldSessionToken)
	require.NoError(t, err)
	require.Equal(t, "guest-7", claims.PlayerID)
	require.Equal(t, "guest", claims.Mode)
}

func TestRouter_RenewAsksTheGuestSanctionQuestionAgain(t *testing.T) {
	authService, sanctions, router := newRenewTestRouter(t)
	sum := sha256.Sum256([]byte("203.0.113.9"))
	sanctions.BlockBootstrap("unused", hex.EncodeToString(sum[:]))
	current, err := authService.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{
		SubjectKind: model.SubjectKindGuest, PlayerID: "guest-8", PlayerName: "Guest-8", Mode: "guest",
	})
	require.NoError(t, err)

	require.Equal(t, http.StatusForbidden, renew(router, current, "203.0.113.9").Code)
}

func TestRouter_RenewRefusesAnInvalidToken(t *testing.T) {
	_, _, router := newRenewTestRouter(t)
	require.Equal(t, http.StatusUnauthorized, renew(router, "not-a-token", "203.0.113.9").Code)
}
