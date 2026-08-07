package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services/liveavatar"
	"github.com/stretchr/testify/require"
)

type liveCallVoiceData struct {
	attachedProvider string
	attachedSession  string
	startResult      *models.OmniChatCallSession
	activeProviders  []models.OmniChatCallProviderSession
	activeProvider   string
	activeSession    string
	endCalls         int
	startCalls       int
	startNotFound    bool
	attachResult     *bool
	cancelOnAttach   context.CancelFunc
	endContextErr    error
	voicePersonaID   int
	upsertCalls      int
}

type liveCallBilling struct {
	reserveErr error
	captures   int
	refunds    int
}

type fakeLiveAvatar struct {
	configured bool
	startErr   error
	endErr     error
	endedID    string
	started    *liveavatar.StartRequest
}

func (f *fakeLiveAvatar) Configured() bool { return f != nil && f.configured }
func (f *fakeLiveAvatar) Start(_ context.Context, request liveavatar.StartRequest) (*liveavatar.Session, error) {
	f.started = &request
	if f.startErr != nil {
		return nil, f.startErr
	}
	return &liveavatar.Session{ProviderSessionID: "pod-avatar-42", RoomName: "omnichat-room-42", LiveKitURL: "wss://livekit.example.test", ParticipantToken: "participant-token"}, nil
}
func (f *fakeLiveAvatar) EndConversation(_ context.Context, id string) error {
	f.endedID = id
	return f.endErr
}
func (f *fakeLiveAvatar) RefreshToken(_ context.Context, _ uuid.UUID, _ int) (string, error) {
	if f.startErr != nil {
		return "", f.startErr
	}
	return "refreshed-participant-token", nil
}

func (b *liveCallBilling) ReserveOwned(context.Context, int, uuid.UUID, string) (*models.OmniCreditsUsageReservation, error) {
	if b.reserveErr != nil {
		return nil, b.reserveErr
	}
	return &models.OmniCreditsUsageReservation{}, nil
}
func (b *liveCallBilling) CaptureOwned(context.Context, int, uuid.UUID) error {
	b.captures++
	return nil
}
func (b *liveCallBilling) RefundOwned(context.Context, int, uuid.UUID) error { b.refunds++; return nil }

func (d *liveCallVoiceData) GetPersonaVoice(context.Context, int) (*models.OmniChatPersonaVoice, error) {
	return nil, nil
}
func (d *liveCallVoiceData) GetPersonaVoiceAccessible(_ context.Context, personaID, _ int) (*models.OmniChatPersonaVoice, error) {
	d.voicePersonaID = personaID
	return &models.OmniChatPersonaVoice{PersonaID: personaID, Provider: "elevenlabs", VoiceID: "voice_42", VoiceName: "Sadie", ModelID: "eleven_multilingual_v2", Speed: 1, Pitch: 1, Active: true}, nil
}

func TestOmniChatVoiceHandlerReadsExistingPersonaIDWildcard(t *testing.T) {
	data := &liveCallVoiceData{}
	handler := NewOmniChatVoiceHandler(data, nil, nil, nil, "", "")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/omnichat/personas/:id/voice", func(c *gin.Context) {
		c.Set("user_id", 9)
		handler.GetPersonaVoice(c)
	})

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/omnichat/personas/42/voice", nil))

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, 42, data.voicePersonaID)
	require.Contains(t, response.Body.String(), `"persona_id":42`)
}
func (d *liveCallVoiceData) UpsertPersonaVoiceAuthorized(context.Context, int, *models.OmniChatPersonaVoice) (bool, error) {
	d.upsertCalls++
	return true, nil
}

func TestOmniChatVoiceHandlerIgnoresClientLiveAvatarIdentifiers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	data := &liveCallVoiceData{}
	handler := NewOmniChatVoiceHandler(data, nil, nil, nil, "", "")
	router := gin.New()
	router.PUT("/omnichat/personas/:id/voice", func(c *gin.Context) {
		c.Set("user_id", 9)
		c.Set("role", "user")
		handler.UpdatePersonaVoice(c)
	})

	payload := `{"provider":"elevenlabs","voice_id":"voice_42","voice_name":"Sadie","model_id":"eleven_multilingual_v2","stability":0.5,"similarity_boost":0.75,"style":0,"speed":1,"pitch":1}`
	request := httptest.NewRequest(http.MethodPut, "/omnichat/personas/42/voice", strings.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, 1, data.upsertCalls, "provider identifiers are deployment-owned and must not block speech updates")
}
func (d *liveCallVoiceData) StartCallOwned(_ context.Context, userID, conversationID int, mode string) (*models.OmniChatCallSession, error) {
	d.startCalls++
	if d.startResult != nil {
		return d.startResult, nil
	}
	if d.startNotFound {
		return nil, nil
	}
	return &models.OmniChatCallSession{ID: uuid.MustParse("00000000-0000-0000-0000-000000000042"), UserID: userID, PersonaID: 42, ConversationID: conversationID, Mode: mode, Status: "active", StartedAt: time.Now(), LastActivityAt: time.Now()}, nil
}

func TestOmniChatVoiceHandlerRejectsVideoWhenLiveProviderIsUnavailable(t *testing.T) {
	data := &liveCallVoiceData{}
	handler := NewOmniChatVoiceHandler(data, nil, nil, nil, "", "")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/omnichat/conversations/:id/calls", func(c *gin.Context) {
		c.Set("user_id", 9)
		handler.StartCall(c)
	})

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/omnichat/conversations/81/calls", strings.NewReader(`{"mode":"video"}`)))

	require.Equal(t, http.StatusServiceUnavailable, response.Code)
	require.Zero(t, data.startCalls, "a fake local video session must not be created without a live provider")
}

func (d *liveCallVoiceData) EndCallOwned(ctx context.Context, _ uuid.UUID, _ int) (bool, error) {
	d.endCalls++
	d.endContextErr = ctx.Err()
	return true, nil
}
func (d *liveCallVoiceData) IncrementCallTurnOwned(context.Context, uuid.UUID, int) (bool, error) {
	return true, nil
}
func (d *liveCallVoiceData) GetLiveCallContextOwned(context.Context, int, int) (*models.OmniChatLiveCallContext, error) {
	return &models.OmniChatLiveCallContext{PersonaName: "Sadie", Context: "Continue Sadie's recent park conversation."}, nil
}
func (d *liveCallVoiceData) AttachCallProviderOwned(_ context.Context, _ uuid.UUID, _ int, provider, providerSessionID string) (bool, error) {
	d.attachedProvider, d.attachedSession = provider, providerSessionID
	if d.cancelOnAttach != nil {
		d.cancelOnAttach()
	}
	if d.attachResult != nil {
		return *d.attachResult, nil
	}
	return true, nil
}
func (d *liveCallVoiceData) GetActiveCallProviderOwned(context.Context, uuid.UUID, int) (string, string, bool, error) {
	return d.activeProvider, d.activeSession, true, nil
}
func (d *liveCallVoiceData) ListActiveCallProvidersOwned(context.Context, int) ([]models.OmniChatCallProviderSession, error) {
	return d.activeProviders, nil
}
func (d *liveCallVoiceData) ClearCallProviderSessionOwned(context.Context, uuid.UUID, int, string) error {
	return nil
}

func TestOmniChatVoiceHandlerStartsPrivateProviderBackedLiveVideo(t *testing.T) {
	data := &liveCallVoiceData{}
	billing := &liveCallBilling{}
	provider := &fakeLiveAvatar{configured: true}
	handler := NewOmniChatVoiceHandler(data, nil, nil, provider).SetBilling(billing)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/omnichat/conversations/:id/calls", func(c *gin.Context) {
		c.Set("user_id", 9)
		handler.StartCall(c)
	})

	request := httptest.NewRequest(http.MethodPost, "/omnichat/conversations/81/calls", strings.NewReader(`{"mode":"video"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusCreated, response.Code)
	require.Contains(t, response.Body.String(), `"live_video_url":"wss://livekit.example.test"`)
	require.Contains(t, response.Body.String(), `"live_video_token":"participant-token"`)
	require.Equal(t, liveavatar.ProviderName, data.attachedProvider)
	require.Equal(t, "pod-avatar-42", data.attachedSession)
	require.Equal(t, 1, billing.captures)
	require.NotNil(t, provider.started)
}

func TestOmniChatVoiceHandlerDoesNotEndActiveProviderForUnknownConversation(t *testing.T) {
	data := &liveCallVoiceData{
		activeProviders: []models.OmniChatCallProviderSession{{Provider: liveavatar.ProviderName, SessionID: "existing-call"}},
		startNotFound:   true,
	}
	billing := &liveCallBilling{}
	provider := &fakeLiveAvatar{configured: true}
	handler := NewOmniChatVoiceHandler(data, nil, nil, provider).SetBilling(billing)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/omnichat/conversations/:id/calls", func(c *gin.Context) {
		c.Set("user_id", 9)
		handler.StartCall(c)
	})

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/omnichat/conversations/999/calls", strings.NewReader(`{"mode":"voice"}`)))

	require.Equal(t, http.StatusNotFound, response.Code)
	require.Empty(t, provider.endedID)
}

func TestOmniChatVoiceHandlerEndsLocalCallWhenProviderCleanupFails(t *testing.T) {
	data := &liveCallVoiceData{activeProvider: liveavatar.ProviderName, activeSession: "pod-avatar-42"}
	provider := &fakeLiveAvatar{configured: true, endErr: context.Canceled}
	handler := NewOmniChatVoiceHandler(data, nil, nil, provider)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.DELETE("/omnichat/calls/:call_id", func(c *gin.Context) {
		c.Set("user_id", 9)
		handler.EndCall(c)
	})

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, "/omnichat/calls/00000000-0000-0000-0000-000000000042", nil))

	require.Equal(t, http.StatusNoContent, response.Code)
	require.Equal(t, 1, data.endCalls)
}

func TestOmniChatVoiceHandlerRefreshesActiveLiveVideoToken(t *testing.T) {
	data := &liveCallVoiceData{activeProvider: liveavatar.ProviderName, activeSession: "pod-avatar-42"}
	handler := NewOmniChatVoiceHandler(data, nil, nil, &fakeLiveAvatar{configured: true})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/omnichat/calls/:call_id/token", func(c *gin.Context) {
		c.Set("user_id", 9)
		handler.RefreshCallToken(c)
	})
	request := httptest.NewRequest(http.MethodPost, "/omnichat/calls/00000000-0000-0000-0000-000000000042/token", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Contains(t, response.Body.String(), `"live_video_token":"refreshed-participant-token"`)
}

func TestOmniChatVoiceHandlerCleansUpCreatedProviderAfterRequestCancellation(t *testing.T) {
	attachResult := false
	requestContext, cancel := context.WithCancel(context.Background())
	data := &liveCallVoiceData{attachResult: &attachResult, cancelOnAttach: cancel}
	billing := &liveCallBilling{}
	provider := &fakeLiveAvatar{configured: true}
	handler := NewOmniChatVoiceHandler(data, nil, nil, provider).SetBilling(billing)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/omnichat/conversations/:id/calls", func(c *gin.Context) {
		c.Set("user_id", 9)
		handler.StartCall(c)
	})
	request := httptest.NewRequest(http.MethodPost, "/omnichat/conversations/81/calls", strings.NewReader(`{"mode":"video"}`)).WithContext(requestContext)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusConflict, response.Code)
	require.Equal(t, "pod-avatar-42", provider.endedID, "a provider session created before disconnect must be closed")
	require.Equal(t, 1, data.endCalls, "the superseded local call must be ended")
	require.NoError(t, data.endContextErr, "cleanup must not inherit the cancelled HTTP context")
	require.Equal(t, 1, billing.refunds)
}

func TestOmniChatVoiceHandlerRejectsVideoCallWithInsufficientCredits(t *testing.T) {
	data := &liveCallVoiceData{}
	handler := NewOmniChatVoiceHandler(data, nil, nil, &fakeLiveAvatar{configured: true}).SetBilling(&liveCallBilling{reserveErr: models.ErrOmniCreditsInsufficient})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/omnichat/conversations/:id/calls", func(c *gin.Context) { c.Set("user_id", 9); handler.StartCall(c) })
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/omnichat/conversations/81/calls", strings.NewReader(`{"mode":"video"}`))
	request.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusPaymentRequired, response.Code)
	require.Equal(t, 1, data.endCalls)
}
