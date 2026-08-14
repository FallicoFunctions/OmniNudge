package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/websocket"
	omnigamemodel "github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
)

// A persona is a resident of this world, so its token must connect exactly as
// a browser's does. This is the half of the change that could be broken
// silently: refusing unknown modes is worthless if it also refuses the one
// mode the admission path exists to issue.
func TestWSHandler_AcceptsPersonaSessionMode(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	token := newWorldSessionTokenWithMode(t, authService, "persona-7", "Seven", "persona", omnigamemodel.SubjectKindPersona)

	conn, _, err := websocket.DefaultDialer.Dial(
		buildWorldWSURL(testServer.URL, token, ""),
		worldDialHeader("https://play.omninudge.com"),
	)
	require.NoError(t, err)
	defer func() { _ = conn.Close() }()

	var snapshot map[string]any
	require.NoError(t, conn.ReadJSON(&snapshot))
	require.Equal(t, "world_snapshot", snapshot["type"])
	require.Equal(t, "persona", playerModeForID(t, snapshot, "persona-7"))
}

// A mode this build has no meaning for is refused at the door rather than
// carried into the world and broadcast to every client in the next snapshot.
func TestWSHandler_RejectsUnknownSessionMode(t *testing.T) {
	worldState := world.NewWorld(world.DefaultConfig())
	mediaState := world.NewMediaState()
	authService := services.NewAuthService("dev-secret", "OmniRaveWorld/1.0", "")
	testServer := httptest.NewServer(New(worldState, mediaState, authService, []string{"https://play.omninudge.com"}))
	defer testServer.Close()

	// The token is otherwise entirely valid: correctly signed, unexpired, with
	// a recognised subject kind. Only the mode is a word this build does not
	// know, which is the whole point -- a signature proves who issued a token,
	// not that this build understands what it says.
	token := newWorldSessionTokenWithMode(t, authService, "wanderer-1", "Wanderer", "wanderer", omnigamemodel.SubjectKindGuest)

	conn, resp, err := websocket.DefaultDialer.Dial(
		buildWorldWSURL(testServer.URL, token, ""),
		worldDialHeader("https://play.omninudge.com"),
	)
	if conn != nil {
		_ = conn.Close()
	}
	require.Error(t, err)
	require.NotNil(t, resp)
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)

	snapshot := worldState.SnapshotForPlayer("wanderer-1", nil, nil)
	require.Empty(t, snapshot.Players, "a refused session must not have joined the world")
}

func newWorldSessionTokenWithMode(t *testing.T, authService *services.AuthService, playerID, playerName, mode string, kind omnigamemodel.SubjectKind) string {
	t.Helper()

	token, err := authService.GenerateOmniRaveWorldJWT(services.OmniRaveWorldTokenInput{
		PlayerID:    playerID,
		PlayerName:  playerName,
		Mode:        mode,
		SubjectKind: kind,
	})
	require.NoError(t, err)
	return token
}

func playerModeForID(t *testing.T, snapshot map[string]any, playerID string) string {
	t.Helper()

	players, ok := snapshot["players"].([]any)
	require.True(t, ok)

	for _, rawPlayer := range players {
		player, playerOK := rawPlayer.(map[string]any)
		require.True(t, playerOK)
		if player["id"] == playerID {
			mode, modeOK := player["mode"].(string)
			require.True(t, modeOK)
			return mode
		}
	}

	t.Fatalf("player %q not present in snapshot", playerID)
	return ""
}
