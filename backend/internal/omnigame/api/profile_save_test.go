package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omnigame/repository"
	"github.com/omninudge/backend/internal/omnigame/service"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestRouter_CompleteOutfitProfileSaveAndFreshAccountLaunch(t *testing.T) {
	ctx := context.Background()
	auth := services.NewAuthService("local-profile-test-secret", "test", "")
	sessions := service.NewSessionServiceWithDependencies("http://localhost:4173", "ws://localhost:8092/ws",
		repository.NewInMemoryProfileRepository(), repository.NewInMemorySanctionRepository(), auth)
	router := NewRouter(sessions, auth, nil)
	aliceID, bobID := 42, 43
	alice, err := auth.GenerateGameSessionJWT(aliceID, "alice")
	require.NoError(t, err)
	bob, err := auth.GenerateGameSessionJWT(bobID, "bob")
	require.NoError(t, err)
	request := func(token, body string) int {
		req := httptest.NewRequest(http.MethodPut, "/api/v1/omnigame/profile/omnirave/loadout", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code
	}
	look := map[string]string{"av": "1", "cv": "1", "cp": "female", "cw": "110111"}
	encoded, err := json.Marshal(look)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, request(alice, string(encoded)))
	require.Equal(t, http.StatusNoContent, request(bob, `{"av":"1","cv":"1","cp":"male","cw":"111111"}`))
	launch, err := sessions.CreateLaunchSession(ctx, model.LaunchRequest{Mode: model.LaunchModeAccount},
		model.PlayerIdentity{UserID: &aliceID, Username: "alice"})
	require.NoError(t, err)
	restored, err := sessions.ExchangeLaunchSession(ctx, model.SessionExchangeRequest{Handoff: launch.LaunchToken, Mode: model.LaunchModeAccount})
	require.NoError(t, err)
	require.Equal(t, look, restored.Loadout)
	require.NotEmpty(t, restored.SessionToken)
	bobProfile, err := sessions.ProfileService().GetProfile(ctx, bobID)
	require.NoError(t, err)
	require.Equal(t, "male", bobProfile.Loadout["cp"])
	// Unknown fields cannot choose another owner; identity comes from the credential.
	require.Equal(t, http.StatusBadRequest, request(alice, `{"userId":43,"loadout":{"cw":"000000"}}`))
	require.Equal(t, http.StatusBadRequest, request(alice, `{"oversized":"`+strings.Repeat("x", 129)+`"}`))
	unchanged, err := sessions.ProfileService().GetProfile(ctx, aliceID)
	require.NoError(t, err)
	require.Equal(t, look, unchanged.Loadout)

	guestWorld, err := auth.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{PlayerID: "guest", PlayerName: "Guest", Mode: "guest"})
	require.NoError(t, err)
	accountWorld, err := auth.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{UserID: &aliceID, Username: "alice", PlayerID: "user-42", PlayerName: "Alice", Mode: "account"})
	require.NoError(t, err)
	chat, err := auth.GenerateWebSocketJWT(aliceID, "alice", "user", 0)
	require.NoError(t, err)
	expired, err := auth.GenerateJWTWithExpiry(aliceID, "alice", "user", -time.Minute)
	require.NoError(t, err)
	for name, token := range map[string]string{"missing": "", "invalid": "invalid", "guest-world": guestWorld, "account-world": accountWorld, "chat": chat, "expired": expired} {
		t.Run(name, func(t *testing.T) { require.Equal(t, http.StatusUnauthorized, request(token, string(encoded))) })
	}
	access, err := auth.GenerateJWT(aliceID, "alice", "user")
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, request(access, string(encoded)))
}
