package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/omninudge/backend/internal/config"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var callsTestCounter int64

func uniqueCallsUsername(base string) string {
	id := atomic.AddInt64(&callsTestCounter, 1)
	return fmt.Sprintf("%s_calls_%d_%d", base, time.Now().UnixNano(), id)
}

func setupCallsHandlerTest(t *testing.T) (*CallsHandler, *database.Database, int, int, int, func()) {
	t.Helper()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	err = database.ResetTestData(ctx, db)
	require.NoError(t, err)

	userRepo := models.NewUserRepository(db.Pool)
	caller := &models.User{Username: uniqueCallsUsername("caller"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, caller))
	callee := &models.User{Username: uniqueCallsUsername("callee"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, callee))

	// Create a conversation between them.
	var convID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO conversations (user1_id, user2_id) VALUES ($1, $2) RETURNING id
	`, caller.ID, callee.ID).Scan(&convID)
	require.NoError(t, err)

	hub := &mockHub{}
	handler := NewCallsHandler(db.Pool, hub, config.TURNConfig{})

	return handler, db, caller.ID, callee.ID, convID, func() {}
}

func insertRingingCall(t *testing.T, db *database.Database, convID, callerID, calleeID int) int {
	t.Helper()
	var callID int
	err := db.Pool.QueryRow(context.Background(), `
		INSERT INTO calls (conversation_id, caller_id, callee_id, call_type, status, started_at)
		VALUES ($1, $2, $3, 'voice', 'ringing', NOW()) RETURNING id
	`, convID, callerID, calleeID).Scan(&callID)
	require.NoError(t, err)
	return callID
}

// StartCall tests

func TestStartCall_Success(t *testing.T) {
	handler, _, callerID, _, convID, _ := setupCallsHandlerTest(t)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	body, _ := json.Marshal(map[string]string{"call_type": "voice"})
	c.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/conversations/%d/calls", convID), bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", callerID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", convID)}}

	handler.StartCall(c)

	assert.Equal(t, http.StatusCreated, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "ringing", resp["status"])
}

func TestStartCall_NotParticipant(t *testing.T) {
	handler, db, _, _, _, _ := setupCallsHandlerTest(t)

	// Create a third user not in the conversation.
	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{Username: uniqueCallsUsername("outsider"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, outsider))

	// Use any conversation ID (1).
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	body, _ := json.Marshal(map[string]string{"call_type": "voice"})
	c.Request = httptest.NewRequest(http.MethodPost, "/conversations/999/calls", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", outsider.ID)
	c.Params = gin.Params{{Key: "id", Value: "999"}}

	handler.StartCall(c)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestStartCall_InvalidConvID(t *testing.T) {
	handler, _, callerID, _, _, _ := setupCallsHandlerTest(t)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	body, _ := json.Marshal(map[string]string{"call_type": "voice"})
	c.Request = httptest.NewRequest(http.MethodPost, "/conversations/abc/calls", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set("user_id", callerID)
	c.Params = gin.Params{{Key: "id", Value: "abc"}}

	handler.StartCall(c)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// AnswerCall tests

func TestAnswerCall_Success(t *testing.T) {
	handler, db, callerID, calleeID, convID, _ := setupCallsHandlerTest(t)
	callID := insertRingingCall(t, db, convID, callerID, calleeID)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/calls/%d/answer", callID), nil)
	c.Set("user_id", calleeID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", callID)}}

	handler.AnswerCall(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "active", resp["status"])
}

func TestAnswerCall_NotCallee(t *testing.T) {
	handler, db, callerID, calleeID, convID, _ := setupCallsHandlerTest(t)
	callID := insertRingingCall(t, db, convID, callerID, calleeID)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/calls/%d/answer", callID), nil)
	c.Set("user_id", callerID) // caller tries to answer their own call
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", callID)}}

	handler.AnswerCall(c)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAnswerCall_NotFound(t *testing.T) {
	handler, _, _, calleeID, _, _ := setupCallsHandlerTest(t)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/calls/999999/answer", nil)
	c.Set("user_id", calleeID)
	c.Params = gin.Params{{Key: "id", Value: "999999"}}

	handler.AnswerCall(c)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

// EndCall tests

func TestEndCall_CallerEnds(t *testing.T) {
	handler, db, callerID, calleeID, convID, _ := setupCallsHandlerTest(t)
	callID := insertRingingCall(t, db, convID, callerID, calleeID)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/calls/%d/end", callID), nil)
	c.Set("user_id", callerID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", callID)}}

	handler.EndCall(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "ended", resp["status"])
}

func TestEndCall_NotParticipant(t *testing.T) {
	handler, db, callerID, calleeID, convID, _ := setupCallsHandlerTest(t)
	callID := insertRingingCall(t, db, convID, callerID, calleeID)

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{Username: uniqueCallsUsername("outsider2"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, outsider))

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/calls/%d/end", callID), nil)
	c.Set("user_id", outsider.ID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", callID)}}

	handler.EndCall(c)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestEndCall_AlreadyEnded(t *testing.T) {
	handler, db, callerID, calleeID, convID, _ := setupCallsHandlerTest(t)
	callID := insertRingingCall(t, db, convID, callerID, calleeID)

	// End it first.
	_, err := db.Pool.Exec(context.Background(), `UPDATE calls SET status = 'ended', ended_at = NOW() WHERE id = $1`, callID)
	require.NoError(t, err)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/calls/%d/end", callID), nil)
	c.Set("user_id", callerID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", callID)}}

	handler.EndCall(c)

	assert.Equal(t, http.StatusConflict, w.Code)
}

// RejectCall tests

func TestRejectCall_Success(t *testing.T) {
	handler, db, callerID, calleeID, convID, _ := setupCallsHandlerTest(t)
	callID := insertRingingCall(t, db, convID, callerID, calleeID)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/calls/%d/reject", callID), nil)
	c.Set("user_id", calleeID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", callID)}}

	handler.RejectCall(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, "rejected", resp["status"])
}

// GetCallHistory tests

func TestGetCallHistory_Success(t *testing.T) {
	handler, db, callerID, calleeID, convID, _ := setupCallsHandlerTest(t)
	insertRingingCall(t, db, convID, callerID, calleeID)
	insertRingingCall(t, db, convID, callerID, calleeID)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/conversations/%d/calls", convID), nil)
	c.Set("user_id", callerID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", convID)}}

	handler.GetCallHistory(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	calls, ok := resp["calls"].([]interface{})
	require.True(t, ok)
	assert.GreaterOrEqual(t, len(calls), 2)
}

func TestGetCallHistory_NotParticipant(t *testing.T) {
	handler, db, _, _, convID, _ := setupCallsHandlerTest(t)

	ctx := context.Background()
	userRepo := models.NewUserRepository(db.Pool)
	outsider := &models.User{Username: uniqueCallsUsername("outsider3"), PasswordHash: "hash"}
	require.NoError(t, userRepo.Create(ctx, outsider))

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/conversations/%d/calls", convID), nil)
	c.Set("user_id", outsider.ID)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", convID)}}

	handler.GetCallHistory(c)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

// GetICEServers test

func TestGetICEServers(t *testing.T) {
	handler := NewCallsHandler(nil, nil, config.TURNConfig{})

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/calls/ice-servers", nil)

	handler.GetICEServers(c)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	_, ok := resp["ice_servers"]
	assert.True(t, ok)
}
