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
	"github.com/omninudge/backend/internal/services/tavus"
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
}

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
	return false, nil
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
	return &models.OmniChatLiveCallContext{PersonaName: "Sadie", Context: "Continue Sadie's recent park conversation.", LiveVideoReplicaID: "sadie-replica", LiveVideoPersonaID: "sadie-persona"}, nil
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
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v2/conversations", r.URL.Path)
		require.Equal(t, "secret", r.Header.Get("x-api-key"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"conversation_id":"provider-call-42","conversation_url":"https://omnichat.daily.co/provider-call-42","meeting_token":"private-token","status":"active"}`))
	}))
	defer provider.Close()

	data := &liveCallVoiceData{}
	handler := NewOmniChatVoiceHandler(data, nil, nil, tavus.NewClient("secret", provider.URL), "", "")
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
	require.Contains(t, response.Body.String(), `"live_video_url":"https://omnichat.daily.co/provider-call-42?t=private-token"`)
	require.Equal(t, "tavus", data.attachedProvider)
	require.Equal(t, "provider-call-42", data.attachedSession)
}

func TestOmniChatVoiceHandlerDoesNotEndActiveProviderForUnknownConversation(t *testing.T) {
	endRequests := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		endRequests++
		w.WriteHeader(http.StatusNoContent)
	}))
	defer provider.Close()

	data := &liveCallVoiceData{
		activeProviders: []models.OmniChatCallProviderSession{{Provider: "tavus", SessionID: "existing-call"}},
		startNotFound:   true,
	}
	handler := NewOmniChatVoiceHandler(data, nil, nil, tavus.NewClient("secret", provider.URL), "", "")
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/omnichat/conversations/:id/calls", func(c *gin.Context) {
		c.Set("user_id", 9)
		handler.StartCall(c)
	})

	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/omnichat/conversations/999/calls", strings.NewReader(`{"mode":"voice"}`)))

	require.Equal(t, http.StatusNotFound, response.Code)
	require.Zero(t, endRequests)
}

func TestOmniChatVoiceHandlerEndsLocalCallWhenProviderCleanupFails(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer provider.Close()

	data := &liveCallVoiceData{activeProvider: "tavus", activeSession: "provider-call-42"}
	handler := NewOmniChatVoiceHandler(data, nil, nil, tavus.NewClient("secret", provider.URL), "", "")
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

func TestOmniChatVoiceHandlerCleansUpCreatedProviderAfterRequestCancellation(t *testing.T) {
	endRequests := 0
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/end") {
			endRequests++
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"conversation_id":"provider-call-42","conversation_url":"https://omnichat.daily.co/provider-call-42","meeting_token":"private-token","status":"active"}`))
	}))
	defer provider.Close()

	attachResult := false
	requestContext, cancel := context.WithCancel(context.Background())
	data := &liveCallVoiceData{attachResult: &attachResult, cancelOnAttach: cancel}
	handler := NewOmniChatVoiceHandler(data, nil, nil, tavus.NewClient("secret", provider.URL), "", "")
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
	require.Equal(t, 1, endRequests, "a provider session created before disconnect must be closed")
	require.Equal(t, 1, data.endCalls, "the superseded local call must be ended")
	require.NoError(t, data.endContextErr, "cleanup must not inherit the cancelled HTTP context")
}
