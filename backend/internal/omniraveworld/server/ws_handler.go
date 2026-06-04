package server

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	omnigamemodel "github.com/omninudge/backend/internal/omnigame/model"
	"github.com/omninudge/backend/internal/omniraveworld/world"
	"github.com/omninudge/backend/internal/services"
)

type WSHandler struct {
	world    *world.World
	media    *world.MediaState
	auth     *services.AuthService
	origins  map[string]struct{}
	upgrader websocket.Upgrader
	mu       sync.Mutex
	conns    map[string]*websocket.Conn
}

func NewWSHandler(worldState *world.World, mediaState *world.MediaState, authService *services.AuthService, allowedOrigins []string) *WSHandler {
	handler := &WSHandler{
		world:   worldState,
		media:   mediaState,
		auth:    authService,
		origins: make(map[string]struct{}, len(allowedOrigins)),
		conns:   make(map[string]*websocket.Conn),
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
	session, err := h.parsePlayerSession(r.Context(), r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer func() {
		h.unregisterConn(session.PlayerID, conn)
		h.world.RemovePlayer(session.PlayerID)
		_ = h.broadcastSnapshots()
		_ = conn.Close()
	}()

	h.world.AddPlayer(session)
	h.registerConn(session.PlayerID, conn)
	if err := h.broadcastSnapshots(); err != nil {
		return
	}

	for {
		var event world.ClientEvent
		if err := conn.ReadJSON(&event); err != nil {
			return
		}

		switch event.Type {
		case "move":
			if event.MoveTo == nil {
				continue
			}

			h.world.ApplyInput(session.PlayerID, world.InputFrame{MoveTo: *event.MoveTo})
			if err := h.broadcastSnapshots(); err != nil {
				return
			}
		case "respawn":
			h.world.RespawnPlayer(session.PlayerID)
			if err := h.broadcastSnapshots(); err != nil {
				return
			}
		case "chat":
			body := strings.TrimSpace(event.Body)
			if body == "" {
				continue
			}

			if err := h.broadcastChatMessage(world.ChatMessage{
				PlayerID:   session.PlayerID,
				PlayerName: session.PlayerName,
				Body:       body,
				CreatedAt:  time.Now().UTC(),
			}); err != nil {
				return
			}
		default:
			continue
		}
	}
}

func (h *WSHandler) registerConn(playerID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.conns[playerID] = conn
}

func (h *WSHandler) unregisterConn(playerID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	current, ok := h.conns[playerID]
	if ok && current == conn {
		delete(h.conns, playerID)
	}
}

func (h *WSHandler) writeSnapshot(conn *websocket.Conn, playerID string) error {
	now := time.Now()
	snapshot := h.world.SnapshotForPlayer(playerID, currentZoneMedia(h.media, now), currentZoneEvents(now))
	return conn.WriteJSON(map[string]any{
		"type":            "world_snapshot",
		"players":         snapshot.Players,
		"zoneMedia":       snapshot.ZoneMedia,
		"zoneEvents":      snapshot.ZoneEvents,
		"currentPlayerId": snapshot.CurrentPlayerID,
		"activeZone":      snapshot.ActiveZone,
	})
}

func (h *WSHandler) broadcastSnapshots() error {
	h.mu.Lock()
	conns := make(map[string]*websocket.Conn, len(h.conns))
	for playerID, conn := range h.conns {
		conns[playerID] = conn
	}
	h.mu.Unlock()

	for playerID, conn := range conns {
		if err := h.writeSnapshot(conn, playerID); err != nil {
			h.unregisterConn(playerID, conn)
			return err
		}
	}

	return nil
}

func (h *WSHandler) broadcastChatMessage(message world.ChatMessage) error {
	h.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(h.conns))
	for _, conn := range h.conns {
		conns = append(conns, conn)
	}
	h.mu.Unlock()

	for _, conn := range conns {
		if err := conn.WriteJSON(map[string]any{
			"type":       "chat_message",
			"playerId":   message.PlayerID,
			"playerName": message.PlayerName,
			"body":       message.Body,
			"createdAt":  message.CreatedAt,
		}); err != nil {
			return err
		}
	}

	return nil
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

func currentZoneEvents(now time.Time) []world.ZoneEventState {
	return world.NewEventSchedule().Snapshot(now)
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
