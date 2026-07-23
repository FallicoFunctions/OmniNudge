package server

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gorilla/websocket"
	omnigamemodel "github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
	"golang.org/x/time/rate"
)

const (
	// maxMessageBytes bounds inbound WebSocket frames. Move/chat/respawn
	// events are small JSON payloads; this is generous headroom while still
	// blocking abusive oversized frames.
	maxMessageBytes = 4096
	// maxChatBodyLength caps a chat message body after trimming whitespace.
	maxChatBodyLength = 500
	// inboundEventsPerSecond/inboundEventBurst bound how many move/chat/respawn
	// events a single connection may push per second. Events over budget are
	// dropped (ignored), not disconnected.
	inboundEventsPerSecond = 20
	inboundEventBurst      = 20
	// writeTimeout bounds how long a single WriteJSON may block a broadcast.
	writeTimeout = 5 * time.Second
)

// clientConn pairs a connection with a mutex serializing writes to it.
// gorilla/websocket panics if two goroutines call WriteJSON on the same
// *websocket.Conn concurrently, which can happen here because every
// connection's read loop can trigger a broadcast to all connections.
type clientConn struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func (c *clientConn) writeJSON(v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	return c.conn.WriteJSON(v)
}

type WSHandler struct {
	world    *world.World
	media    *world.MediaState
	auth     *services.AuthService
	nowMu    sync.Mutex
	now      func() time.Time
	origins  map[string]struct{}
	upgrader websocket.Upgrader
	mu       sync.Mutex
	conns    map[string]*clientConn
	schedule world.EventSchedule
}

// setNow overrides the clock used for zone-event/media snapshots. It exists
// so tests can pin "now" deterministically; nowMu keeps that safe against
// the concurrent reads broadcastSnapshots performs from other connections'
// goroutines.
func (h *WSHandler) setNow(fn func() time.Time) {
	h.nowMu.Lock()
	defer h.nowMu.Unlock()
	h.now = fn
}

func (h *WSHandler) currentTime() time.Time {
	h.nowMu.Lock()
	defer h.nowMu.Unlock()
	return h.now()
}

func NewWSHandler(worldState *world.World, mediaState *world.MediaState, authService *services.AuthService, allowedOrigins []string) *WSHandler {
	handler := &WSHandler{
		world:    worldState,
		media:    mediaState,
		auth:     authService,
		now:      func() time.Time { return time.Now().UTC() },
		origins:  make(map[string]struct{}, len(allowedOrigins)),
		conns:    make(map[string]*clientConn),
		schedule: world.NewEventSchedule(),
	}
	for _, origin := range allowedOrigins {
		handler.origins[origin] = struct{}{}
	}
	handler.upgrader = websocket.Upgrader{
		CheckOrigin: handler.isAllowedOrigin,
	}
	return handler
}

func (h *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	clientSession, err := h.parsePlayerSession(r.Context(), r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(maxMessageBytes)

	player := h.world.AddPlayer(clientSession)
	cc := &clientConn{conn: conn}
	h.registerConn(clientSession.PlayerID, cc)
	defer func() {
		h.unregisterConn(clientSession.PlayerID, cc)
		h.world.RemovePlayer(clientSession.PlayerID, player)
		h.broadcastSnapshots()
		_ = conn.Close()
	}()

	h.broadcastSnapshots()

	limiter := rate.NewLimiter(rate.Limit(inboundEventsPerSecond), inboundEventBurst)

	for {
		var event world.ClientEvent
		if err := conn.ReadJSON(&event); err != nil {
			return
		}

		if !limiter.Allow() {
			continue
		}

		switch event.Type {
		case "move":
			if event.MoveTo == nil {
				continue
			}

			h.world.ApplyInput(clientSession.PlayerID, world.InputFrame{MoveTo: *event.MoveTo})
			h.broadcastSnapshots()
		case "respawn":
			h.world.RespawnPlayer(clientSession.PlayerID)
			h.broadcastSnapshots()
		case "chat":
			body := sanitizeChatBody(event.Body)
			if body == "" {
				continue
			}

			h.broadcastChatMessage(world.ChatMessage{
				PlayerID:   clientSession.PlayerID,
				PlayerName: clientSession.PlayerName,
				Body:       body,
				CreatedAt:  time.Now().UTC(),
			})
		default:
			continue
		}
	}
}

// sanitizeChatBody trims whitespace, strips ASCII control characters, and
// caps the body length before it is broadcast to other players.
func sanitizeChatBody(raw string) string {
	body := strings.TrimSpace(raw)
	if body == "" {
		return ""
	}

	var builder strings.Builder
	builder.Grow(len(body))
	for _, r := range body {
		if unicode.IsControl(r) {
			continue
		}
		builder.WriteRune(r)
	}
	body = strings.TrimSpace(builder.String())

	if len(body) > maxChatBodyLength {
		body = body[:maxChatBodyLength]
	}

	return body
}

func (h *WSHandler) registerConn(playerID string, cc *clientConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.conns[playerID] = cc
}

func (h *WSHandler) unregisterConn(playerID string, cc *clientConn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	current, ok := h.conns[playerID]
	if ok && current == cc {
		delete(h.conns, playerID)
	}
}

func (h *WSHandler) writeSnapshot(cc *clientConn, playerID string, zoneMedia []world.ZoneMediaState, zoneEvents []world.ZoneEventState) error {
	snapshot := h.world.SnapshotForPlayer(playerID, zoneMedia, zoneEvents)
	return cc.writeJSON(map[string]any{
		"type":            "world_snapshot",
		"players":         snapshot.Players,
		"zoneMedia":       snapshot.ZoneMedia,
		"zoneEvents":      snapshot.ZoneEvents,
		"currentPlayerId": snapshot.CurrentPlayerID,
		"activeZone":      snapshot.ActiveZone,
	})
}

// broadcastSnapshots is best-effort: it writes to every connected player and,
// for any connection whose write fails, unregisters and closes only that one
// connection. A failing write to player B's socket must never tear down
// player A's session just because A's goroutine happened to trigger this
// broadcast.
func (h *WSHandler) broadcastSnapshots() {
	h.mu.Lock()
	conns := make(map[string]*clientConn, len(h.conns))
	for playerID, cc := range h.conns {
		conns[playerID] = cc
	}
	h.mu.Unlock()

	now := h.currentTime()
	zoneMedia := currentZoneMedia(h.media, now)
	zoneEvents := h.currentZoneEvents(now)

	for playerID, cc := range conns {
		if err := h.writeSnapshot(cc, playerID, zoneMedia, zoneEvents); err != nil {
			h.disconnectConn(playerID, cc)
		}
	}
}

// broadcastChatMessage is best-effort in the same way as broadcastSnapshots.
func (h *WSHandler) broadcastChatMessage(message world.ChatMessage) {
	h.mu.Lock()
	conns := make(map[string]*clientConn, len(h.conns))
	for playerID, cc := range h.conns {
		conns[playerID] = cc
	}
	h.mu.Unlock()

	for playerID, cc := range conns {
		if err := cc.writeJSON(map[string]any{
			"type":       "chat_message",
			"playerId":   message.PlayerID,
			"playerName": message.PlayerName,
			"body":       message.Body,
			"createdAt":  message.CreatedAt,
		}); err != nil {
			h.disconnectConn(playerID, cc)
		}
	}
}

// disconnectConn unregisters and closes a single connection that failed a
// broadcast write. It only affects that connection's own session - the
// connection's read loop will observe the close and run its own cleanup.
func (h *WSHandler) disconnectConn(playerID string, cc *clientConn) {
	h.unregisterConn(playerID, cc)
	_ = cc.conn.Close()
}

func currentZoneMedia(mediaState *world.MediaState, now time.Time) []world.ZoneMediaState {
	snapshots := mediaState.Snapshots(now)
	zoneMedia := make([]world.ZoneMediaState, 0, len(snapshots))
	for _, snapshot := range snapshots {
		zoneMedia = append(zoneMedia, world.ZoneMediaState{
			ZoneID:          snapshot.ZoneID,
			VideoID:         snapshot.VideoID,
			PlaylistIndex:   snapshot.Index,
			PlayheadSeconds: int64(snapshot.Playhead / time.Second),
		})
	}
	return zoneMedia
}

func (h *WSHandler) currentZoneEvents(now time.Time) []world.ZoneEventState {
	return h.schedule.Snapshot(now)
}

func (h *WSHandler) parsePlayerSession(ctx context.Context, r *http.Request) (world.PlayerSession, error) {
	if h.auth == nil {
		return world.PlayerSession{}, http.ErrNoCookie
	}

	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		return world.PlayerSession{}, http.ErrNoCookie
	}

	claims, err := h.auth.ValidateOmniRaveWorldJWTContext(ctx, token)
	if err != nil {
		return world.PlayerSession{}, err
	}

	return world.PlayerSession{
		PlayerID:    claims.PlayerID,
		PlayerName:  claims.PlayerName,
		Mode:        world.SessionMode(claims.Mode),
		Loadout:     world.Loadout(claims.Loadout),
		ReturnPoint: savedPointToVec3(claims.ReturnPoint),
	}, nil
}

func (h *WSHandler) isAllowedOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return false
	}
	_, ok := h.origins[origin]
	return ok
}

func savedPointToVec3(point *omnigamemodel.SavedPoint) *world.Vec3 {
	if point == nil {
		return nil
	}
	return &world.Vec3{
		X: point.X,
		Y: point.Y,
		Z: point.Z,
	}
}
