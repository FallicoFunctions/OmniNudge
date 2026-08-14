package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/omnigame/model"
	"github.com/stretchr/testify/require"
)

type stubSessionService struct {
	session     *model.LaunchSession
	bootstrap   *model.SessionExchangeResponse
	err         error
	mode        model.LaunchMode
	identity    model.PlayerIdentity
	handoff     string
	exchangeReq model.SessionExchangeRequest
}

func (s *stubSessionService) CreateLaunchSession(_ context.Context, req model.LaunchRequest, identity model.PlayerIdentity) (*model.LaunchSession, error) {
	s.mode = req.Mode
	s.identity = identity
	return s.session, s.err
}

func (s *stubSessionService) BuildLaunchURL(session *model.LaunchSession) (string, error) {
	return "http://localhost:4173/omnirave?mode=" + string(session.Mode) + "&handoff=" + session.LaunchToken, s.err
}

func (s *stubSessionService) ExchangeLaunchSession(_ context.Context, req model.SessionExchangeRequest) (*model.SessionExchangeResponse, error) {
	s.handoff = req.Handoff
	s.exchangeReq = req
	return s.bootstrap, s.err
}

func TestLaunchHandler_CreateOmniRaveLaunch(t *testing.T) {
	gin.SetMode(gin.TestMode)

	sessionSvc := &stubSessionService{session: &model.LaunchSession{
		GameSlug:    "omnirave",
		Mode:        model.LaunchModeGuest,
		LaunchToken: "test-token",
		GuestName:   "Guest Nova",
		PlayerName:  "Guest Nova",
	}}
	handler := NewLaunchHandler(sessionSvc, NewGuestIdentityResolver([]string{"127.0.0.1/32"}))

	router := gin.New()
	router.POST("/api/v1/omnigame/launch/omnirave", handler.CreateOmniRaveLaunch)

	body, err := json.Marshal(map[string]string{"mode": "guest"})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/launch/omnirave", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, model.LaunchModeGuest, sessionSvc.mode)

	var payload map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
	require.Equal(t, "http://localhost:4173/omnirave?mode=guest&handoff=test-token", payload["launch_url"])
}

func TestLaunchHandler_RejectsInvalidPayload(t *testing.T) {
	gin.SetMode(gin.TestMode)

	handler := NewLaunchHandler(&stubSessionService{}, nil)

	router := gin.New()
	router.POST("/api/v1/omnigame/launch/omnirave", handler.CreateOmniRaveLaunch)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/launch/omnirave", bytes.NewBufferString(`{"mode":123}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestLaunchHandler_ExchangeSession(t *testing.T) {
	gin.SetMode(gin.TestMode)

	sessionSvc := &stubSessionService{bootstrap: &model.SessionExchangeResponse{
		PlayerName:     "Guest Nova",
		WorldSocketURL: "ws://localhost:8092/ws",
		Mode:           model.LaunchModeGuest,
		ActiveZone:     "main_stage",
	}}
	handler := NewLaunchHandler(sessionSvc, NewGuestIdentityResolver([]string{"127.0.0.1/32"}))

	router := gin.New()
	router.POST("/api/v1/omnigame/session/exchange", handler.ExchangeSession)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/session/exchange", bytes.NewBufferString(`{"handoff":"test-token","mode":"guest"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "test-token", sessionSvc.handoff)

	var payload model.SessionExchangeResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
	require.Equal(t, "ws://localhost:8092/ws", payload.WorldSocketURL)
	require.Equal(t, "Guest Nova", payload.PlayerName)
}

func TestLaunchHandler_ExchangeSession_UntrustedProxyHopDoesNotBecomeDurableGuestIdentity(t *testing.T) {
	gin.SetMode(gin.TestMode)

	sessionSvc := &stubSessionService{bootstrap: &model.SessionExchangeResponse{
		PlayerName:     "Guest Nova",
		WorldSocketURL: "ws://localhost:8092/ws",
		Mode:           model.LaunchModeGuest,
		ActiveZone:     "main_stage",
	}}
	handler := NewLaunchHandler(sessionSvc, NewGuestIdentityResolver([]string{"127.0.0.1/32"}))

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies([]string{"127.0.0.1"}))
	router.POST("/api/v1/omnigame/session/exchange", handler.ExchangeSession)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/session/exchange", bytes.NewBufferString(`{"handoff":"test-token","mode":"guest"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "203.0.113.200")
	req.RemoteAddr = "198.51.100.20:4567"
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, sessionSvc.exchangeReq.RemoteIP)
}

func TestLaunchHandler_ExchangeSession_SpoofedForwardingHeadersAreIgnoredUnlessTrusted(t *testing.T) {
	gin.SetMode(gin.TestMode)

	sessionSvc := &stubSessionService{bootstrap: &model.SessionExchangeResponse{
		PlayerName:     "Guest Nova",
		WorldSocketURL: "ws://localhost:8092/ws",
		Mode:           model.LaunchModeGuest,
		ActiveZone:     "main_stage",
	}}
	handler := NewLaunchHandler(sessionSvc, NewGuestIdentityResolver([]string{"127.0.0.1/32"}))

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies([]string{"127.0.0.1"}))
	router.POST("/api/v1/omnigame/session/exchange", handler.ExchangeSession)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/session/exchange", bytes.NewBufferString(`{"handoff":"test-token","mode":"guest"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "203.0.113.201")
	req.RemoteAddr = "198.51.100.21:4567"
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, sessionSvc.exchangeReq.RemoteIP)
}

func TestLaunchHandler_ExchangeSession_HonorsForwardedIdentityFromTrustedProxy(t *testing.T) {
	gin.SetMode(gin.TestMode)

	sessionSvc := &stubSessionService{bootstrap: &model.SessionExchangeResponse{
		PlayerName:     "Guest Nova",
		WorldSocketURL: "ws://localhost:8092/ws",
		Mode:           model.LaunchModeGuest,
		ActiveZone:     "main_stage",
	}}
	handler := NewLaunchHandler(sessionSvc, NewGuestIdentityResolver([]string{"127.0.0.1/32"}))

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies([]string{"127.0.0.1"}))
	router.POST("/api/v1/omnigame/session/exchange", handler.ExchangeSession)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/session/exchange", bytes.NewBufferString(`{"handoff":"test-token","mode":"guest"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", "203.0.113.202")
	req.RemoteAddr = "127.0.0.1:4567"
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "203.0.113.202", sessionSvc.exchangeReq.RemoteIP)
}

func TestLaunchHandler_ExchangeSession_UntrustedPeerWithoutForwardingHeadersDoesNotBecomeDurableGuestIdentity(t *testing.T) {
	gin.SetMode(gin.TestMode)

	sessionSvc := &stubSessionService{bootstrap: &model.SessionExchangeResponse{
		PlayerName:     "Guest Nova",
		WorldSocketURL: "ws://localhost:8092/ws",
		Mode:           model.LaunchModeGuest,
		ActiveZone:     "main_stage",
	}}
	handler := NewLaunchHandler(sessionSvc, NewGuestIdentityResolver([]string{"127.0.0.1/32"}))

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies([]string{"127.0.0.1"}))
	router.POST("/api/v1/omnigame/session/exchange", handler.ExchangeSession)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/session/exchange", bytes.NewBufferString(`{"handoff":"test-token","mode":"guest"}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "198.51.100.22:4567"
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, sessionSvc.exchangeReq.RemoteIP)
}

func TestLaunchHandler_ExchangeSession_TrustedProxyWithoutDistinctClientIdentityFallsBackToUnresolved(t *testing.T) {
	gin.SetMode(gin.TestMode)

	sessionSvc := &stubSessionService{bootstrap: &model.SessionExchangeResponse{
		PlayerName:     "Guest Nova",
		WorldSocketURL: "ws://localhost:8092/ws",
		Mode:           model.LaunchModeGuest,
		ActiveZone:     "main_stage",
	}}
	handler := NewLaunchHandler(sessionSvc, NewGuestIdentityResolver([]string{"127.0.0.1/32"}))

	router := gin.New()
	require.NoError(t, router.SetTrustedProxies([]string{"127.0.0.1"}))
	router.POST("/api/v1/omnigame/session/exchange", handler.ExchangeSession)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/omnigame/session/exchange", bytes.NewBufferString(`{"handoff":"test-token","mode":"guest"}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "127.0.0.1:4567"
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, sessionSvc.exchangeReq.RemoteIP)
}
