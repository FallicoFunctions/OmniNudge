package websocket

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/models"
	zlog "github.com/rs/zerolog/log"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 45 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 512 * 1024 // 512 KB

	// Minimum gap between typing events per user (ms)
	typingDebounce = 800 * time.Millisecond

	// Rate limiting (P0-004)
	maxMessagesPerMinute = 60          // Max messages per minute per connection
	rateLimitWindow      = time.Minute // Rate limit reset window

	typingSettingsCacheTTL     = 30 * time.Second
	typingParticipantsCacheTTL = 10 * time.Second
)

// SettingsRepository provides access to user privacy settings needed for websocket enforcement.
type SettingsRepository interface {
	GetByUserID(ctx context.Context, userID int) (*models.UserSettings, error)
}

// ConversationAuthorizer provides minimal conversation membership checks needed by websocket events.
// Kept as an interface to make the Client testable without a database.
type ConversationAuthorizer interface {
	CanAccessConversation(ctx context.Context, userID, conversationID int) (bool, error)
	ListConversationParticipantIDs(ctx context.Context, conversationID int) ([]int, error)
}

// Client represents a WebSocket client connection
type Client struct {
	Hub *Hub

	// The WebSocket connection
	Conn *websocket.Conn

	// Buffered channel of outbound messages
	Send chan *Message

	// User ID of the connected user
	UserID int

	// Last typing event timestamp
	lastTyping time.Time

	// Connection metadata for security (P0-004)
	RemoteAddr  string    // IP address
	UserAgent   string    // Browser user agent
	ConnectedAt time.Time // Connection timestamp

	// Rate limiting (P0-004)
	messageCount int       // Messages sent in current window
	lastReset    time.Time // Last rate limit window reset

	// Authorization (P0-008b)
	Authorizer ConversationAuthorizer

	// Settings for privacy enforcement (typing indicators, etc.)
	SettingsRepo SettingsRepository

	typingSettingsCache      map[int]cacheBoolEntry
	conversationMembersCache map[int]cacheIntsEntry
}

type cacheBoolEntry struct {
	value     bool
	expiresAt time.Time
}

type cacheIntsEntry struct {
	value     []int
	expiresAt time.Time
}

// NewClient creates a new WebSocket client with security metadata
func NewClient(hub *Hub, conn *websocket.Conn, userID int, remoteAddr, userAgent string, authorizer ConversationAuthorizer, settingsRepo SettingsRepository) *Client {
	now := time.Now()
	return &Client{
		Hub:                      hub,
		Conn:                     conn,
		Send:                     make(chan *Message, 256),
		UserID:                   userID,
		RemoteAddr:               remoteAddr,
		UserAgent:                userAgent,
		ConnectedAt:              now,
		lastReset:                now,
		lastTyping:               time.Time{},
		messageCount:             0,
		Authorizer:               authorizer,
		SettingsRepo:             settingsRepo,
		typingSettingsCache:      make(map[int]cacheBoolEntry),
		conversationMembersCache: make(map[int]cacheIntsEntry),
	}
}

type typingPayload struct {
	ConversationID int  `json:"conversation_id"`
	RecipientID    int  `json:"recipient_id"` // accepted but not trusted; recipients are derived server-side
	IsTyping       bool `json:"is_typing"`
}

var errUnauthorizedConversationAccess = errors.New("unauthorized conversation access")

func (c *Client) buildTypingBroadcasts(ctx context.Context, typingData typingPayload) ([]*Message, error) {
	if typingData.ConversationID == 0 || c.Authorizer == nil || c.Hub == nil {
		return nil, nil
	}

	now := time.Now()
	if now.Sub(c.lastTyping) < typingDebounce {
		return nil, nil
	}
	c.lastTyping = now

	canAccess, err := c.Authorizer.CanAccessConversation(ctx, c.UserID, typingData.ConversationID)
	if err != nil {
		return nil, err
	}
	if !canAccess {
		zlog.Warn().
			Int("user_id", c.UserID).
			Int("conversation_id", typingData.ConversationID).
			Str("remote_addr", c.RemoteAddr).
			Str("event_type", "unauthorized_typing_event").
			Msg("websocket: unauthorized typing event")
		return nil, errUnauthorizedConversationAccess
	}

	participantIDs, err := c.getConversationParticipantIDsCached(ctx, typingData.ConversationID, now)
	if err != nil {
		return nil, err
	}
	if len(participantIDs) == 0 {
		return nil, nil
	}

	// Enforce typing indicator privacy settings (fail-closed on errors).
	// Note: the current semantics require BOTH sender and recipient to have typing indicators enabled.
	if c.SettingsRepo != nil {
		show, err := c.getShowTypingIndicatorsCached(ctx, c.UserID, now)
		if err != nil {
			return nil, err
		}
		if !show {
			return nil, nil
		}
	}

	out := make([]*Message, 0, len(participantIDs))
	for _, recipientID := range participantIDs {
		if recipientID == c.UserID || recipientID == 0 {
			continue
		}

		if c.SettingsRepo != nil {
			show, err := c.getShowTypingIndicatorsCached(ctx, recipientID, now)
			if err != nil {
				return nil, err
			}
			if !show {
				continue
			}
		}

		out = append(out, &Message{
			RecipientID: recipientID,
			Type:        "typing",
			Payload: map[string]interface{}{
				"conversation_id": typingData.ConversationID,
				"user_id":         c.UserID,
				"is_typing":       typingData.IsTyping,
			},
		})
	}

	return out, nil
}

func (c *Client) getShowTypingIndicatorsCached(ctx context.Context, userID int, now time.Time) (bool, error) {
	if c.SettingsRepo == nil {
		return true, nil
	}

	if entry, ok := c.typingSettingsCache[userID]; ok && now.Before(entry.expiresAt) {
		return entry.value, nil
	}

	settings, err := c.SettingsRepo.GetByUserID(ctx, userID)
	if err != nil {
		return false, err
	}
	show := true
	if settings != nil {
		show = settings.ShowTypingIndicators
	}

	// Prevent unbounded growth if a client attempts to probe many user IDs.
	if len(c.typingSettingsCache) > 512 {
		c.typingSettingsCache = make(map[int]cacheBoolEntry)
	}
	c.typingSettingsCache[userID] = cacheBoolEntry{value: show, expiresAt: now.Add(typingSettingsCacheTTL)}
	return show, nil
}

func (c *Client) getConversationParticipantIDsCached(ctx context.Context, conversationID int, now time.Time) ([]int, error) {
	if c.Authorizer == nil {
		return nil, nil
	}

	if entry, ok := c.conversationMembersCache[conversationID]; ok && now.Before(entry.expiresAt) {
		return entry.value, nil
	}

	ids, err := c.Authorizer.ListConversationParticipantIDs(ctx, conversationID)
	if err != nil {
		return nil, err
	}

	// Prevent unbounded growth if a client attempts to probe many conversation IDs.
	if len(c.conversationMembersCache) > 256 {
		c.conversationMembersCache = make(map[int]cacheIntsEntry)
	}
	c.conversationMembersCache[conversationID] = cacheIntsEntry{value: ids, expiresAt: now.Add(typingParticipantsCacheTTL)}
	return ids, nil
}

// Start begins read and write pumps for the client
func (c *Client) Start() {
	go c.writePump()
	go c.readPump()
}

// checkRateLimit checks if the client has exceeded the rate limit
func (c *Client) checkRateLimit() bool {
	now := time.Now()

	// Reset counter if window expired
	if now.Sub(c.lastReset) > rateLimitWindow {
		c.messageCount = 0
		c.lastReset = now
	}

	// Increment and check
	c.messageCount++
	if c.messageCount > maxMessagesPerMinute {
		zlog.Warn().
			Int("user_id", c.UserID).
			Str("remote_addr", c.RemoteAddr).
			Str("user_agent", c.UserAgent).
			Str("event_type", "rate_limit_exceeded").
			Msg("websocket: rate limit exceeded")
		return false
	}

	return true
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		// Non-blocking send to unregister: if hub.Run() has already exited
		// (e.g. during server shutdown), the unregister channel has no reader
		// and a blocking send would leak this goroutine permanently.
		select {
		case c.Hub.unregister <- c:
		default:
		}
		c.Conn.Close()
		zlog.Info().
			Int("user_id", c.UserID).
			Dur("duration", time.Since(c.ConnectedAt)).
			Str("remote_addr", c.RemoteAddr).
			Str("event_type", "ws_disconnected").
			Msg("websocket: client disconnected")
	}()

	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				zlog.Warn().Err(err).Int("user_id", c.UserID).Msg("websocket: unexpected close error")
			}
			break
		}

		// Rate limiting check (P0-004)
		if !c.checkRateLimit() {
			// Best-effort: notify client of rate limit. Non-blocking so a full
			// or closed Send channel does not block/panic the readPump goroutine.
			select {
			case c.Send <- &Message{
				RecipientID: c.UserID,
				Type:        "error",
				Payload: map[string]interface{}{
					"code":    "RATE_LIMIT_EXCEEDED",
					"message": "Too many messages. Please slow down.",
				},
			}:
			default:
			}
			continue
		}

		// Parse incoming message
		var incomingMsg struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}

		if err := json.Unmarshal(message, &incomingMsg); err != nil {
			zlog.Warn().Err(err).Int("user_id", c.UserID).Msg("websocket: failed to parse message")
			continue
		}

		// Handle different message types
		switch incomingMsg.Type {
		case "typing":
			var typingData typingPayload
			if err := json.Unmarshal(incomingMsg.Payload, &typingData); err != nil {
				zlog.Warn().Err(err).Int("user_id", c.UserID).Msg("websocket: failed to parse typing payload")
				continue
			}

			// Derive recipients server-side; never trust client-provided recipient_id for broadcasting.
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			msgs, err := c.buildTypingBroadcasts(ctx, typingData)
			cancel()
			if err != nil {
				if errors.Is(err, errUnauthorizedConversationAccess) {
					// Best-effort: notify client. Non-blocking to avoid blocking readPump
					// if writePump has exited and the Send channel is full or closed.
					select {
					case c.Send <- &Message{
						RecipientID: c.UserID,
						Type:        "error",
						Payload: map[string]interface{}{
							"code":    "UNAUTHORIZED_CONVERSATION_ACCESS",
							"message": "You are not authorized to send events for this conversation.",
						},
					}:
					default:
					}
					continue
				}
				zlog.Error().Err(err).Int("user_id", c.UserID).Msg("websocket: authorization/settings error for typing event")
				continue
			}
			for _, msg := range msgs {
				c.Hub.Broadcast(msg)
			}

		default:
			zlog.Debug().Str("type", incomingMsg.Type).Int("user_id", c.UserID).Msg("websocket: unknown message type")
		}
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Send message as JSON
			if err := c.Conn.WriteJSON(message); err != nil {
				zlog.Warn().Err(err).Int("user_id", c.UserID).Msg("websocket: failed to write message")
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
