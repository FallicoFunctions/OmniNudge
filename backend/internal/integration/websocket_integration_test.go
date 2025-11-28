package integration

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"
)

func TestWebSocketTypingBroadcast(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	alice := createUser(t, deps.UserRepo, "ws_alice", "user")
	bob := createUser(t, deps.UserRepo, "ws_bob", "user")
	aliceToken, _ := deps.AuthService.GenerateJWT(alice.ID, "", alice.Username, alice.Role)
	bobToken, _ := deps.AuthService.GenerateJWT(bob.ID, "", bob.Username, bob.Role)

	// Start test server
	ts := httptest.NewServer(deps.Router)
	defer ts.Close()

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
			"conversation_id": 1,
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
}
