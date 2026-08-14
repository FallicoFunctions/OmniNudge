package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

type handlerModelPlanFake struct{ plan string }

func (f handlerModelPlanFake) GetPlan(context.Context, int) (string, *time.Time, error) {
	return f.plan, nil, nil
}

type handlerModelStoreFake struct {
	defaultKey string
	override   *string
	chatKey    string
	allKey     string
}

func (f *handlerModelStoreFake) GetModelSelection(context.Context, int, int) (string, *string, error) {
	return f.defaultKey, f.override, nil
}
func (f *handlerModelStoreFake) SetConversationModel(_ context.Context, _, _ int, key string) error {
	f.chatKey = key
	return nil
}
func (f *handlerModelStoreFake) SetAllChatsModel(_ context.Context, _ int, key string) error {
	f.allKey = key
	return nil
}

func serveModelSelectionRequest(t *testing.T, handler *OmniChatHandler, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(method, target, bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	context.Set("user_id", 17)
	if method == http.MethodGet {
		handler.GetModelSelection(context)
	} else {
		handler.SetModelSelection(context)
	}
	return recorder
}

func TestOmniChatModelSelectionHandlerReturnsCurrentSelection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := &handlerModelStoreFake{defaultKey: "standard"}
	handler := &OmniChatHandler{modelSelection: services.NewOmniChatModelSelectionService(handlerModelPlanFake{plan: "plus"}, store)}

	response := serveModelSelectionRequest(t, handler, http.MethodGet, "/?conversation_id=23", "")

	require.Equal(t, http.StatusOK, response.Code)
	require.JSONEq(t, `{"account_tier":"plus","default_model_key":"standard","effective_model_key":"standard"}`, response.Body.String())
}

func TestOmniChatModelSelectionHandlerRejectsLockedTier(t *testing.T) {
	store := &handlerModelStoreFake{defaultKey: "standard"}
	handler := &OmniChatHandler{modelSelection: services.NewOmniChatModelSelectionService(handlerModelPlanFake{plan: "free"}, store)}

	response := serveModelSelectionRequest(t, handler, http.MethodPut, "/", `{"conversation_id":23,"model_key":"premium_deep","scope":"this_chat"}`)

	require.Equal(t, http.StatusForbidden, response.Code)
	require.Empty(t, store.chatKey)
}

func TestOmniChatModelSelectionHandlerPersistsAllChatsScope(t *testing.T) {
	store := &handlerModelStoreFake{defaultKey: "standard"}
	handler := &OmniChatHandler{modelSelection: services.NewOmniChatModelSelectionService(handlerModelPlanFake{plan: "premium"}, store)}

	response := serveModelSelectionRequest(t, handler, http.MethodPut, "/", `{"conversation_id":23,"model_key":"plus","scope":"all_chats"}`)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "plus", store.allKey)
}

func TestOmniChatModelSelectionHandlerPersistsMeteredUltraFastModel(t *testing.T) {
	store := &handlerModelStoreFake{defaultKey: "standard"}
	handler := &OmniChatHandler{modelSelection: services.NewOmniChatModelSelectionService(handlerModelPlanFake{plan: "premium"}, store)}

	response := serveModelSelectionRequest(t, handler, http.MethodPut, "/", `{"conversation_id":23,"model_key":"ultra_fast","scope":"this_chat"}`)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "ultra_fast", store.chatKey)
}
