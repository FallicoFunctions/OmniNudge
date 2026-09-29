package server

import (
	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"github.com/stretchr/testify/require"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestWSHandlerShowControlRateLimitAcknowledgesRejection(t *testing.T) {
	w := world.NewWorld(world.DefaultConfig())
	auth := services.NewAuthService("review-only-not-production-secret", "OmniRaveWorld/1.0", "")
	h := NewWSHandler(w, world.NewMediaState(), auth, []string{"http://127.0.0.1:4175"})
	srv := httptest.NewServer(h)
	defer srv.Close()
	c, _, err := websocket.DefaultDialer.Dial(buildWorldWSURL(srv.URL, newGuestWorldSessionToken(t, auth, "a", "A", nil), ""), worldDialHeader("http://127.0.0.1:4175"))
	require.NoError(t, err)
	defer c.Close()
	var initial map[string]any
	require.NoError(t, c.ReadJSON(&initial))
	for i := 0; i < 20; i++ {
		require.NoError(t, c.WriteJSON(world.ClientEvent{Type: "unused"}))
	}
	require.NoError(t, c.WriteJSON(world.ClientEvent{Type: "show_control", Show: &world.ShowCommand{RequestID: "over-limit", Panel: "fireworks", Action: "join"}}))
	c.SetReadDeadline(time.Now().Add(400 * time.Millisecond))
	var reply map[string]any
	err = c.ReadJSON(&reply)
	require.NoError(t, err, "a rate-limited show command must receive a result so the control can recover")
	require.Equal(t, "show_result", reply["type"])
	r := reply["result"].(map[string]any)
	require.Equal(t, "over-limit", r["requestId"])
	require.Equal(t, false, r["ok"])
}

func TestWSHandlerLateJoinOpensPreparationAndStartsOnTime(t *testing.T) {
	w := world.NewWorld(world.DefaultConfig())
	auth := services.NewAuthService("review-only-not-production-secret", "OmniRaveWorld/1.0", "")
	h := NewWSHandler(w, world.NewMediaState(), auth, []string{"http://127.0.0.1:4175"})
	start := time.Date(2026, 9, 17, 20, 0, 0, 0, time.UTC)
	var at atomic.Int64
	at.Store(start.Add(-9 * time.Second).UnixMilli())
	h.setNow(func() time.Time { return time.UnixMilli(at.Load()) })
	srv := httptest.NewServer(h)
	defer srv.Close()
	c, _, err := websocket.DefaultDialer.Dial(buildWorldWSURL(srv.URL, newGuestWorldSessionToken(t, auth, "late", "Late", nil), ""), worldDialHeader("http://127.0.0.1:4175"))
	require.NoError(t, err)
	defer c.Close()
	readState := func() *world.ShowState {
		require.NoError(t, c.SetReadDeadline(time.Now().Add(2*time.Second)))
		for {
			var frame struct {
				Type  string           `json:"type"`
				State *world.ShowState `json:"showControl"`
			}
			require.NoError(t, c.ReadJSON(&frame))
			if frame.Type == "world_snapshot" {
				require.NotNil(t, frame.State)
				return frame.State
			}
		}
	}
	readState()
	require.NoError(t, c.WriteJSON(world.ClientEvent{Type: "show_control", Show: &world.ShowCommand{RequestID: "join", Panel: "fireworks", Action: "join"}}))
	prepared := readState()
	require.NotNil(t, prepared.Fireworks.Preparing, "joining with nine seconds remaining must open preparation immediately")
	require.Equal(t, "late", prepared.Fireworks.Preparing.PlayerID)
	require.Equal(t, int64(9000), prepared.Fireworks.Preparing.StartsAt-prepared.ServerAt)
	at.Store(start.UnixMilli())
	h.broadcastSnapshots()
	live := readState()
	require.NotNil(t, live.Fireworks.Active)
	require.Equal(t, prepared.Fireworks.Preparing.ID, live.Fireworks.Active.ID)
	require.Equal(t, int64(150000), live.Fireworks.Active.EndsAt-live.Fireworks.Active.StartsAt)
	require.Empty(t, live.Fireworks.Queue)
}
