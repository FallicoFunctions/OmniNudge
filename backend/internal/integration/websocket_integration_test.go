package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestWebSocketTypingBroadcast(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	// Start test server
	ts := httptest.NewServer(deps.Router)
	defer ts.Close()

	// Ensure a conversation exists so delivered/read payloads have context
	alice := createUser(t, deps.UserRepo, "ws_alice", "user")
	bob := createUser(t, deps.UserRepo, "ws_bob", "user")
	aliceToken, _ := deps.AuthService.GenerateJWT(alice.ID, "", alice.Username, alice.Role)
	bobToken, _ := deps.AuthService.GenerateJWT(bob.ID, "", bob.Username, bob.Role)

	// Create a conversation
	body := []byte(`{"other_user_id":` + fmt.Sprint(bob.ID) + `}`)
	req, _ := http.NewRequest("POST", "/api/v1/conversations", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	w := doRequest(t, deps.Router, req)
	require.Equal(t, http.StatusCreated, w.Code)
	var conv models.Conversation
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &conv))

	dial := func(token string) *websocket.Conn {
		wsURL := "ws" + ts.URL[len("http"):] + "/api/v1/ws"
		h := http.Header{}
		h.Set("Authorization", "Bearer "+token)
		h.Set("Origin", "http://localhost:8080")
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, h)
		require.NoError(t, err)
		return conn
	}

	aliceConn := dial(aliceToken)
	defer aliceConn.Close()
	bobConn := dial(bobToken)
	defer bobConn.Close()

	// Send typing from alice to bob
	msg := map[string]interface{}{
		"type": "typing",
		"payload": map[string]interface{}{
			"conversation_id": conv.ID,
			"recipient_id":    bob.ID,
			"is_typing":       true,
		},
	}
	require.NoError(t, aliceConn.WriteJSON(msg))

	// Expect typing event on bob side
	bobConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var incoming map[string]interface{}
	require.NoError(t, bobConn.ReadJSON(&incoming))
	require.Equal(t, "typing", incoming["type"])

	// Send a message to trigger new_message/delivered/read
	msgBody := map[string]interface{}{
		"conversation_id":    conv.ID,
		"encrypted_content":  "hi",
		"message_type":       "text",
		"encryption_version": "v1",
	}
	buf, _ := json.Marshal(msgBody)
	reqMsg, _ := http.NewRequest("POST", "/api/v1/messages", bytes.NewReader(buf))
	reqMsg.Header.Set("Content-Type", "application/json")
	reqMsg.Header.Set("Authorization", "Bearer "+aliceToken)
	w = doRequest(t, deps.Router, reqMsg)
	require.Equal(t, http.StatusCreated, w.Code)

	// Expect new_message
	bobConn.SetReadDeadline(time.Now().Add(3 * time.Second))
	var evt map[string]interface{}
	require.NoError(t, bobConn.ReadJSON(&evt))
	require.Equal(t, "new_message", evt["type"])

	// Expect delivered/read to sender or recipient (best-effort)
	aliceConn.SetReadDeadline(time.Now().Add(3 * time.Second))
	var evt2 map[string]interface{}
	require.NoError(t, aliceConn.ReadJSON(&evt2))
	require.Contains(t, evt2["type"], "delivered")
}

func TestWebSocketModerationReportEvents(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	ts := httptest.NewServer(deps.Router)
	defer ts.Close()

	reporter := createUser(t, deps.UserRepo, "ws_reporter", "user")
	target := createUser(t, deps.UserRepo, "ws_target", "user")
	moderator := createUser(t, deps.UserRepo, "ws_mod", "moderator")

	reporterToken, _ := deps.AuthService.GenerateJWT(reporter.ID, "", reporter.Username, reporter.Role)
	modToken, _ := deps.AuthService.GenerateJWT(moderator.ID, "", moderator.Username, moderator.Role)

	dial := func(token string) *websocket.Conn {
		wsURL := "ws" + ts.URL[len("http"):] + "/api/v1/ws"
		h := http.Header{}
		h.Set("Authorization", "Bearer "+token)
		h.Set("Origin", "http://localhost:8080")
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, h)
		require.NoError(t, err)
		return conn
	}

	modConn := dial(modToken)
	defer modConn.Close()

	// Consume initial_state first
	modConn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var initial map[string]interface{}
	require.NoError(t, modConn.ReadJSON(&initial))
	require.Equal(t, "initial_state", initial["type"])

	// Reporter creates a report
	createBody := map[string]interface{}{
		"target_type": "user",
		"target_id":   target.ID,
		"reason":      "spam",
	}
	createPayload, _ := json.Marshal(createBody)
	createReq, _ := http.NewRequest("POST", "/api/v1/reports", bytes.NewReader(createPayload))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+reporterToken)
	w := doRequest(t, deps.Router, createReq)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())

	var created models.Report
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	require.NotZero(t, created.ID)

	// Moderator receives realtime created event
	modConn.SetReadDeadline(time.Now().Add(3 * time.Second))
	var createdEvent map[string]interface{}
	require.NoError(t, modConn.ReadJSON(&createdEvent))
	require.Equal(t, "moderation_report_created", createdEvent["type"])
	createdPayloadMap, ok := createdEvent["payload"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, float64(created.ID), createdPayloadMap["report_id"])
	require.Equal(t, "open", createdPayloadMap["status"])

	// Moderator resolves report
	resolveBody := map[string]string{"status": "approved"}
	resolvePayload, _ := json.Marshal(resolveBody)
	resolveReq, _ := http.NewRequest("POST", fmt.Sprintf("/api/v1/mod/reports/%d/status", created.ID), bytes.NewReader(resolvePayload))
	resolveReq.Header.Set("Content-Type", "application/json")
	resolveReq.Header.Set("Authorization", "Bearer "+modToken)
	resolveResp := doRequest(t, deps.Router, resolveReq)
	require.Equal(t, http.StatusOK, resolveResp.Code, resolveResp.Body.String())

	// Moderator receives realtime updated event
	modConn.SetReadDeadline(time.Now().Add(3 * time.Second))
	var updatedEvent map[string]interface{}
	require.NoError(t, modConn.ReadJSON(&updatedEvent))
	require.Equal(t, "moderation_report_updated", updatedEvent["type"])
	updatedPayloadMap, ok := updatedEvent["payload"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, float64(created.ID), updatedPayloadMap["report_id"])
	require.Equal(t, "approved", updatedPayloadMap["status"])
}
