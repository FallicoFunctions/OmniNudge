package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/chatreddit/backend/internal/models"
	"github.com/gorilla/websocket"
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
