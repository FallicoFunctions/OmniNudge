package handlers

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

type omniChatResponseFeedbackStoreFake struct {
	feedback *models.OmniChatResponseFeedback
	err      error
	reason   models.OmniChatResponseFeedbackReason
	note     string
}

func (f *omniChatResponseFeedbackStoreFake) CreateOwned(
	_ context.Context,
	_, _, _ int,
	reason models.OmniChatResponseFeedbackReason,
	note string,
) (*models.OmniChatResponseFeedback, error) {
	f.reason, f.note = reason, note
	if f.feedback == nil && f.err == nil {
		f.feedback = &models.OmniChatResponseFeedback{
			ID:             uuid.New(),
			ConversationID: 23,
			MessageID:      41,
			Reason:         reason,
			Note:           note,
		}
	}
	return f.feedback, f.err
}

func submitOmniChatResponseFeedback(t *testing.T, handler *OmniChatResponseFeedbackHandler, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/omnichat/conversations/23/messages/41/feedback", bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	c, _ := gin.CreateTestContext(recorder)
	c.Request = request
	c.Params = gin.Params{{Key: "id", Value: "23"}, {Key: "message_id", Value: "41"}}
	c.Set("user_id", 7)
	handler.Submit(c)
	return recorder
}

func TestOmniChatResponseFeedbackHandlerAcceptsAllowlistedReason(t *testing.T) {
	gin.SetMode(gin.TestMode)
	store := &omniChatResponseFeedbackStoreFake{}
	response := submitOmniChatResponseFeedback(t, NewOmniChatResponseFeedbackHandler(store), `{"reason":"role_ownership","note":"  Swapped the legs.  "}`)

	require.Equal(t, http.StatusCreated, response.Code)
	require.Equal(t, models.OmniChatFeedbackRoleOwnership, store.reason)
	require.Equal(t, "Swapped the legs.", store.note)
	require.NotContains(t, response.Body.String(), "response_snapshot")
	require.NotContains(t, response.Body.String(), "scene_state")
}

func TestOmniChatResponseFeedbackHandlerRejectsUnknownReasonAndOversizedNote(t *testing.T) {
	store := &omniChatResponseFeedbackStoreFake{}
	response := submitOmniChatResponseFeedback(t, NewOmniChatResponseFeedbackHandler(store), `{"reason":"prompt","note":"no"}`)
	require.Equal(t, http.StatusBadRequest, response.Code)

	oversized := string(bytes.Repeat([]byte("x"), 1001))
	response = submitOmniChatResponseFeedback(t, NewOmniChatResponseFeedbackHandler(store), `{"reason":"other","note":"`+oversized+`"}`)
	require.Equal(t, http.StatusBadRequest, response.Code)

	response = submitOmniChatResponseFeedback(t, NewOmniChatResponseFeedbackHandler(store), `{"reason":"other","provider":"client-injected"}`)
	require.Equal(t, http.StatusBadRequest, response.Code)
}
