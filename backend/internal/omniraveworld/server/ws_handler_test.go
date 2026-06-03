package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	omnigamemodel "github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

func TestWSHandler_JoinAndMoveUpdatesActiveZone(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	wsURL := buildWorldWSURL(testServer.URL, newGuestWorldSessionToken(t, authService, "guest-1", "Guest-1", nil), "")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer conn.Close()

	var first map[string]any
	require.NoError(t, conn.ReadJSON(&first))
	require.Equal(t, "world_snapshot", first["type"])
	require.Equal(t, "main_stage", first["activeZone"])

	require.NoError(t, conn.WriteJSON(map[string]any{
		"type": "move",
		"moveTo": map[string]float64{
			"x": 42,
			"y": 0,
			"z": 9,
		},
	}))

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var second map[string]any
	require.NoError(t, conn.ReadJSON(&second))
	require.Equal(t, "world_snapshot", second["type"])
	require.Equal(t, "techno_room", second["activeZone"])
	require.NotEmpty(t, second["zoneMedia"])
}

func TestWSHandler_BroadcastsPlayerMovementToOtherConnections(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	baseURL := "ws" + testServer.URL[len("http"):] + "/ws"
	firstConn, _, err := websocket.DefaultDialer.Dial(baseURL+"?token="+newGuestWorldSessionToken(t, authService, "guest-1", "Guest-1", nil), worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer firstConn.Close()

	secondConn, _, err := websocket.DefaultDialer.Dial(baseURL+"?token="+newGuestWorldSessionToken(t, authService, "guest-2", "Guest-2", nil), worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer secondConn.Close()

	var firstSnapshot map[string]any
	require.NoError(t, firstConn.ReadJSON(&firstSnapshot))

	var secondJoinSnapshot map[string]any
	require.NoError(t, secondConn.ReadJSON(&secondJoinSnapshot))

	require.NoError(t, firstConn.WriteJSON(map[string]any{
		"type": "move",
		"moveTo": map[string]float64{
			"x": 42,
			"y": 0,
			"z": 9,
		},
	}))

	_ = secondConn.SetReadDeadline(time.Now().Add(750 * time.Millisecond))

	var secondSnapshot map[string]any
	require.NoError(t, secondConn.ReadJSON(&secondSnapshot))
	require.Equal(t, "world_snapshot", secondSnapshot["type"])
	require.Len(t, secondSnapshot["players"], 2)

	players, ok := secondSnapshot["players"].([]any)
	require.True(t, ok)

	var movedPlayer map[string]any
	for _, rawPlayer := range players {
		player, playerOK := rawPlayer.(map[string]any)
		require.True(t, playerOK)
		if player["id"] == "guest-1" {
			movedPlayer = player
			break
		}
	}

	require.NotNil(t, movedPlayer)
	require.Equal(t, "techno_room", movedPlayer["zone"])
}

func TestWSHandler_BroadcastsDisconnectToOtherConnections(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	baseURL := "ws" + testServer.URL[len("http"):] + "/ws"
	firstConn, _, err := websocket.DefaultDialer.Dial(baseURL+"?token="+newGuestWorldSessionToken(t, authService, "guest-1", "Guest-1", nil), worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer firstConn.Close()

	secondConn, _, err := websocket.DefaultDialer.Dial(baseURL+"?token="+newGuestWorldSessionToken(t, authService, "guest-2", "Guest-2", nil), worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer secondConn.Close()

	var firstSnapshot map[string]any
	require.NoError(t, firstConn.ReadJSON(&firstSnapshot))

	var secondJoinSnapshot map[string]any
	require.NoError(t, secondConn.ReadJSON(&secondJoinSnapshot))

	_ = firstConn.SetReadDeadline(time.Now().Add(250 * time.Millisecond))
	var firstJoinBroadcast map[string]any
	require.NoError(t, firstConn.ReadJSON(&firstJoinBroadcast))

	require.NoError(t, firstConn.Close())

	_ = secondConn.SetReadDeadline(time.Now().Add(750 * time.Millisecond))

	var secondSnapshot map[string]any
	require.NoError(t, secondConn.ReadJSON(&secondSnapshot))
	require.Equal(t, "world_snapshot", secondSnapshot["type"])
	require.Len(t, secondSnapshot["players"], 1)

	players, ok := secondSnapshot["players"].([]any)
	require.True(t, ok)
	player, ok := players[0].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "guest-2", player["id"])
}

func TestWSHandler_BroadcastsChatMessagesToAllConnections(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	baseURL := "ws" + testServer.URL[len("http"):] + "/ws"
	firstConn, _, err := websocket.DefaultDialer.Dial(baseURL+"?token="+newGuestWorldSessionToken(t, authService, "guest-1", "Guest-1", nil), worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer firstConn.Close()

	secondConn, _, err := websocket.DefaultDialer.Dial(baseURL+"?token="+newGuestWorldSessionToken(t, authService, "guest-2", "Guest-2", nil), worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer secondConn.Close()

	var firstSnapshot map[string]any
	require.NoError(t, firstConn.ReadJSON(&firstSnapshot))

	var secondJoinSnapshot map[string]any
	require.NoError(t, secondConn.ReadJSON(&secondJoinSnapshot))

	require.NoError(t, firstConn.WriteJSON(map[string]any{
		"type": "chat",
		"body": "See you in the neon room",
	}))

	_ = secondConn.SetReadDeadline(time.Now().Add(750 * time.Millisecond))

	var secondMessage map[string]any
	require.NoError(t, secondConn.ReadJSON(&secondMessage))
	require.Equal(t, "chat_message", secondMessage["type"])
	require.Equal(t, "guest-1", secondMessage["playerId"])
	require.Equal(t, "Guest-1", secondMessage["playerName"])
	require.Equal(t, "See you in the neon room", secondMessage["body"])
}

func TestWSHandler_RejectsMissingOrInvalidWorldCredential(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	for _, tc := range []string{
		buildWorldWSURL(testServer.URL, "", ""),
		buildWorldWSURL(testServer.URL, "not-a-valid-world-token", ""),
	} {
		_, resp, err := websocket.DefaultDialer.Dial(tc, worldDialHeader("https://play.omninudge.com"))
		require.Error(t, err)
		require.NotNil(t, resp)
		require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	}
}

func TestWSHandler_RejectsUnexpectedOrigin(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	token := newGuestWorldSessionToken(t, authService, "guest-1", "Guest-1", nil)
	_, resp, err := websocket.DefaultDialer.Dial(buildWorldWSURL(testServer.URL, token, ""), worldDialHeader("https://evil.example"))
	require.Error(t, err)
	require.NotNil(t, resp)
	require.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func TestWSHandler_IgnoresForgedQueryIdentityAndRestoresOnlyServerApprovedState(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	returnPoint := &omnigamemodel.SavedPoint{X: 42, Y: 0, Z: 9}
	token := newGuestWorldSessionToken(t, authService, "guest-authoritative", "Guest-Authoritative", returnPoint)
	forged := "&player_id=forged-player&player_name=ForgedName&mode=account&return_x=-40&return_y=0&return_z=10"
	conn, _, err := websocket.DefaultDialer.Dial(buildWorldWSURL(testServer.URL, token, forged), worldDialHeader("https://play.omninudge.com"))
	require.NoError(t, err)
	defer conn.Close()

	var snapshot map[string]any
	require.NoError(t, conn.ReadJSON(&snapshot))
	require.Equal(t, "world_snapshot", snapshot["type"])
	require.Equal(t, "guest-authoritative", snapshot["currentPlayerId"])
	require.Equal(t, "techno_room", snapshot["activeZone"])

	players, ok := snapshot["players"].([]any)
	require.True(t, ok)
	require.Len(t, players, 1)
	player, ok := players[0].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "guest-authoritative", player["id"])
	position := player["position"].(map[string]any)
	require.Equal(t, 42.0, position["x"])
	require.Equal(t, 9.0, position["z"])

	require.NoError(t, conn.WriteJSON(map[string]any{
		"type": "chat",
		"body": "authoritative chat",
	}))

	_ = conn.SetReadDeadline(time.Now().Add(750 * time.Millisecond))
	var chatMessage map[string]any
	require.NoError(t, conn.ReadJSON(&chatMessage))
	require.Equal(t, "chat_message", chatMessage["type"])
	require.Equal(t, "guest-authoritative", chatMessage["playerId"])
	require.Equal(t, "Guest-Authoritative", chatMessage["playerName"])
}

func buildWorldWSURL(serverURL, token, extraQuery string) string {
	baseURL := "ws" + serverURL[len("http"):] + "/ws"
	if token == "" {
		return baseURL
	}
	return baseURL + "?token=" + token + extraQuery
}

func worldDialHeader(origin string) http.Header {
	header := http.Header{}
	header.Set("Origin", origin)
	return header
}

func newGuestWorldSessionToken(t *testing.T, authService *services.AuthService, playerID, playerName string, returnPoint *omnigamemodel.SavedPoint) string {
	t.Helper()

	token, err := authService.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{
		PlayerID:    playerID,
		PlayerName:  playerName,
		Mode:        "guest",
		ReturnPoint: returnPoint,
	})
	require.NoError(t, err)
	return token
}
