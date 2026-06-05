package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func readWebSocketEvent(t *testing.T, conn *websocket.Conn, timeout time.Duration, match func(map[string]interface{}) bool) map[string]interface{} {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn.SetReadDeadline(deadline)
		var event map[string]interface{}
		require.NoError(t, conn.ReadJSON(&event))
		if match(event) {
			return event
		}
	}

	t.Fatalf("timed out waiting for expected websocket event")
	return nil
}

func TestWebSocketTypingBroadcast(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	// Start test server
	ts := httptest.NewServer(deps.Router)
	defer ts.Close()

	// Ensure a conversation exists so delivered/read payloads have context
	alice := createUser(t, deps.UserRepo, "ws_alice", "user")
	bob := createUser(t, deps.UserRepo, "ws_bob", "user")
	aliceToken, _ := deps.AuthService.GenerateJWT(alice.ID, alice.Username, alice.Role)
	aliceWSToken, _ := deps.AuthService.GenerateWebSocketJWT(alice.ID, alice.Username, alice.Role, alice.TokenVersion)
	bobWSToken, _ := deps.AuthService.GenerateWebSocketJWT(bob.ID, bob.Username, bob.Role, bob.TokenVersion)

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
		wsURL := "ws" + ts.URL[len("http"):] + "/api/v1/ws?token=" + token
		h := http.Header{}
		h.Set("Origin", "http://localhost:8080")
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, h)
		require.NoError(t, err)
		return conn
	}

	aliceConn := dial(aliceWSToken)
	defer aliceConn.Close()
	bobConn := dial(bobWSToken)
	defer bobConn.Close()

	consumeInitialState := func(conn *websocket.Conn) {
		conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		var initial map[string]interface{}
		require.NoError(t, conn.ReadJSON(&initial))
		require.Equal(t, "initial_state", initial["type"])
	}

	consumeInitialState(aliceConn)
	consumeInitialState(bobConn)

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
	incoming := readWebSocketEvent(t, bobConn, 2*time.Second, func(event map[string]interface{}) bool {
		return event["type"] == "typing"
	})
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
	evt := readWebSocketEvent(t, bobConn, 3*time.Second, func(event map[string]interface{}) bool {
		return event["type"] == "new_message"
	})
	require.Equal(t, "new_message", evt["type"])

	// Expect delivered/read to sender or recipient (best-effort)
	evt2 := readWebSocketEvent(t, aliceConn, 3*time.Second, func(event map[string]interface{}) bool {
		typeValue, _ := event["type"].(string)
		return strings.Contains(typeValue, "delivered")
	})
	require.Contains(t, evt2["type"], "delivered")
}

