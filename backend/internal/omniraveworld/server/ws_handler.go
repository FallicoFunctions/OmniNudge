package server

import (
	"context"
	"errors"
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
	// maxMessageBytes bounds inbound WebSocket frames. Move/chat/respawn/
	// loadout events are small JSON payloads; this is generous headroom while
	// still blocking abusive oversized frames. Note this is a HARDER cap than
	// world.ValidateLoadout's per-entry budget: a frame that large never
	// reaches the loadout validator at all.
	maxMessageBytes = 4096
	// maxChatBodyLength caps a chat message body after trimming whitespace.
	maxChatBodyLength = 500
	// maxChatBodyNewlines caps how many line breaks survive sanitising. The
	// client supports Shift+Enter for a new line, so newlines must not be
	// stripped outright, but an unbounded count would let one message stretch
	// a chat bubble down the screen or push the log around.
	maxChatBodyNewlines = 4
	// inboundEventsPerSecond/inboundEventBurst bound how many move/chat/
	// respawn/loadout events a single connection may push per second. The
	// limiter is consumed once per inbound frame BEFORE the event-type switch,
	// so it covers every event type including loadout. Events over budget are
	// dropped (ignored), not disconnected.
	inboundEventsPerSecond = 20
	inboundEventBurst      = 20
	// writeTimeout bounds how long a single WriteJSON may block a broadcast.
	writeTimeout = 5 * time.Second
	// scheduleTickInterval drives the background broadcast that keeps zone
	// event countdowns/phases live for players who are not otherwise
	// generating move/chat/respawn/loadout traffic (sec 14.1: the global event
	// clock runs 24/7 independent of player activity, so idle players must
	// still see the countdown tick and the fireworks phase advance without
	// having to move first).
	scheduleTickInterval = 1 * time.Second
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
	// announceMu guards lastAnnounceMinute, the dedupe latch for the Main
	// Stage 5-minute/1-minute global chat announcements (sec 5.1.1). It is
	// separate from nowMu/mu because it is only ever touched from the single
	// scheduler goroutine plus tests, never from a connection's read loop.
	announceMu         sync.Mutex
	lastAnnounceMinute int
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
		world:              worldState,
		media:              mediaState,
		auth:               authService,
		now:                func() time.Time { return time.Now().UTC() },
		origins:            make(map[string]struct{}, len(allowedOrigins)),
		conns:              make(map[string]*clientConn),
		schedule:           world.NewEventSchedule(),
		lastAnnounceMinute: -1,
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
	clientSession, sessionExpiry, err := h.parsePlayerSession(r.Context(), r)
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

	// The world token is checked once, at this upgrade, and never again for as
	// long as the socket stays open. Without this timer a five-minute
	// credential buys a session of unbounded length: a connection opened at
	// noon is still visible and still moving at two, having outlived its own
	// proof of admission by an hour and fifty-five minutes.
	//
	// Ending the session at the token's own exp is what makes the door the
	// only door. Reconnecting needs a fresh token, and minting one runs the
	// eligibility question again, so a sanction, a withdrawal, or a
	// deactivation takes hold within one token lifetime instead of never. It
	// is not live revocation and is not meant to be -- it is the bound that
	// the rest of the system was already written as though it had.
	//
	// Closing the connection is the whole mechanism: the read loop below
	// observes the close, returns, and runs the deferred cleanup exactly once,
	// whichever of the two happens first. disconnectConn is reused rather than
	// duplicated for that reason -- it is already the "end this one session"
	// path, and giving expiry its own teardown would mean two routes to keep
	// in agreement.
	expiryTimer := time.AfterFunc(time.Until(sessionExpiry), func() {
		h.disconnectConn(clientSession.PlayerID, cc)
	})

	defer func() {
		// Stop first: a client that leaves early must not leave a timer
		// pending on a connection that no longer exists.
		expiryTimer.Stop()
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
		case "loadout":
			// Untrusted client input: bounds-checked and stripped of control
			// characters before it is stored or broadcast. Rejected payloads
			// are ignored outright, leaving the player's existing loadout
			// (from the world-session JWT, or a previous accepted event) in
			// place.
			loadout, ok := sanitizeLoadout(event.Loadout)
			if !ok {
				continue
			}

			h.world.SetPlayerLoadout(clientSession.PlayerID, player, loadout)
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

	// Newlines survive: the client's chat input supports Shift+Enter for a new
	// line (runtime design 10.3) and bubbles/log wrap multi-line messages, so
	// stripping every control rune silently flattened legitimate messages.
	// Every other control rune still goes (terminal escapes, bidi overrides,
	// NULs), and the length cap below still bounds the whole body.
	var builder strings.Builder
	builder.Grow(len(body))
	newlines := 0
	for _, r := range body {
		if r == '\n' {
			// Bound the newline count so a wall of blank lines can't be used to
			// spam the log or stretch a bubble across the screen.
			if newlines >= maxChatBodyNewlines {
				continue
			}
			newlines++
			builder.WriteRune(r)
			continue
		}
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

// sanitizeLoadout bounds-checks and cleans an inbound "loadout" event before
// it is applied to the world and broadcast to every other player.
//
// It enforces the SAME limits the profile REST handler enforces - they both
// call world.ValidateLoadout - so an avatar published over the socket can
// never be larger than one persisted through the profile API. Control runes
// are stripped from keys and values the way sanitizeChatBody strips them from
// a chat body: a loadout is single-line option-id data, so unlike chat there
// is no newline exemption here.
//
// Returns ok=false when the payload must be ignored: over budget (before or
// after stripping), or a key that is empty once stripped.
func sanitizeLoadout(raw world.Loadout) (world.Loadout, bool) {
	if len(raw) == 0 {
		return nil, false
	}
	if err := world.ValidateLoadout(raw); err != nil {
		return nil, false
	}

	cleaned := make(world.Loadout, len(raw))
	for key, value := range raw {
		cleanKey := stripControlRunes(key)
		if cleanKey == "" {
			return nil, false
		}
		cleaned[cleanKey] = stripControlRunes(value)
	}

	// Stripping can collapse two distinct raw keys onto one cleaned key, so
	// the bounds are re-checked against what would actually be stored.
	if err := world.ValidateLoadout(cleaned); err != nil {
		return nil, false
	}

	return cleaned, true
}

func stripControlRunes(raw string) string {
	if !strings.ContainsFunc(raw, unicode.IsControl) {
		return raw
	}

	var builder strings.Builder
	builder.Grow(len(raw))
	for _, r := range raw {
		if unicode.IsControl(r) {
			continue
		}
		builder.WriteRune(r)
	}
	return builder.String()
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

// StartScheduler launches the background goroutine that keeps zone events
// live and fires the Main Stage scheduled-event chat announcements, for the
// lifetime of ctx. Sec 14.1's global clock runs "24/7, even when no players
// are online" - a purely broadcast-triggered snapshot (only sent on player
// move/chat/respawn/loadout) would leave an idle player's countdown frozen,
// and would never fire an announcement with nobody around to trigger one.
//
// Production wiring (server.go) calls this exactly once per process. Tests
// construct a *WSHandler directly via NewWSHandler and never call this, so
// the 1-second ticker never runs concurrently with a test's own deterministic
// setNow-driven assertions.
func (h *WSHandler) StartScheduler(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(scheduleTickInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.broadcastSnapshots()
				h.maybeAnnounceFireworks()
			}
		}
	}()
}

// maybeAnnounceFireworks sends the sec 5.1.1 global chat announcements at
// exactly 5 minutes and 1 minute before the Main Stage fireworks show
// (`:00` every hour). lastAnnounceMinute latches which of the two has already
// fired this hour so a 1-second tick rate cannot double-send either one.
func (h *WSHandler) maybeAnnounceFireworks() {
	now := h.currentTime()
	minute := now.Minute()

	h.announceMu.Lock()
	if minute == 0 {
		// Past the hour: re-arm both announcements for the next hour's show.
		h.lastAnnounceMinute = -1
		h.announceMu.Unlock()
		return
	}
	if minute != 55 && minute != 59 {
		h.announceMu.Unlock()
		return
	}
	if h.lastAnnounceMinute == minute {
		h.announceMu.Unlock()
		return
	}
	h.lastAnnounceMinute = minute
	h.announceMu.Unlock()

	remaining := "5 minutes"
	if minute == 59 {
		remaining = "1 minute"
	}
	h.broadcastChatMessage(world.ChatMessage{
		PlayerName: world.SystemChatName,
		Body:       "Main Stage fireworks in " + remaining,
		CreatedAt:  now,
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
			TrackID:         snapshot.TrackID,
			Artist:          snapshot.Artist,
			Title:           snapshot.Title,
			PlaylistIndex:   snapshot.Index,
			PlayheadSeconds: int64(snapshot.Playhead / time.Second),
			DurationSeconds: int64(snapshot.Duration / time.Second),
		})
	}
	return zoneMedia
}

func (h *WSHandler) currentZoneEvents(now time.Time) []world.ZoneEventState {
	return h.schedule.Snapshot(now)
}

// errUnknownSessionMode refuses a token whose mode this build has no meaning
// for. It is answered as a 401 like every other failure to parse a session,
// because a token the world cannot interpret is one it cannot admit.
var errUnknownSessionMode = errors.New("unrecognised session mode")

// errSessionWithoutExpiry refuses a token that names no expiry. The validator
// already demands one, so this cannot be reached through it; it is here
// because the alternative to refusing is granting a session with no end, and
// that is not a failure mode worth leaving one changed dependency away.
var errSessionWithoutExpiry = errors.New("session token carries no expiry")

// parsePlayerSession returns the session a token describes and the moment that
// token stops being proof of anything. The caller ends the connection then.
func (h *WSHandler) parsePlayerSession(ctx context.Context, r *http.Request) (world.PlayerSession, time.Time, error) {
	if h.auth == nil {
		return world.PlayerSession{}, time.Time{}, http.ErrNoCookie
	}

	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		return world.PlayerSession{}, time.Time{}, http.ErrNoCookie
	}

	claims, err := h.auth.ValidateOmniRaveWorldJWTContext(ctx, token)
	if err != nil {
		return world.PlayerSession{}, time.Time{}, err
	}

	if claims.ExpiresAt == nil {
		return world.PlayerSession{}, time.Time{}, errSessionWithoutExpiry
	}

	// A mode this build does not recognise is refused rather than carried
	// through. The mode reaches every connected client in the next snapshot,
	// so accepting an unknown one means the server broadcasting a value it has
	// no rules for and leaving each client to guess -- which is exactly what
	// the JWT layer already refuses to do with an unrecognised subject kind.
	// Persona is on the known list because a persona is a resident here now;
	// it is the unnamed fourth thing that has to be stopped.
	mode := world.SessionMode(claims.Mode)
	if !mode.Valid() {
		return world.PlayerSession{}, time.Time{}, errUnknownSessionMode
	}

	return world.PlayerSession{
		PlayerID:    claims.PlayerID,
		PlayerName:  claims.PlayerName,
		Mode:        mode,
		Loadout:     world.Loadout(claims.Loadout),
		ReturnPoint: savedPointToVec3(claims.ReturnPoint),
	}, claims.ExpiresAt.Time, nil
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
