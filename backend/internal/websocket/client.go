package websocket

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/models"
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

func (c *Client) buildTypingBroadcasts(ctx context.Context, typingData typingPayload) ([]*Message, error) {
	if typingData.ConversationID == 0 || c.Authorizer == nil || c.Hub == nil {
		return nil, nil
	}

	now := time.Now()
	if now.Sub(c.lastTyping) < typingDebounce {
		return nil, nil
	}
	c.lastTyping = now

	participantIDs, err := c.getConversationParticipantIDsCached(ctx, typingData.ConversationID, now)
	if err != nil {
		return nil, err
	}
	if len(participantIDs) == 0 {
		return nil, nil
	}

	// Verify sender is in the conversation.
	isMember := false
	for _, id := range participantIDs {
		if id == c.UserID {
			isMember = true
			break
		}
	}
	if !isMember {
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
		log.Printf("[SECURITY] Rate limit exceeded for user_id=%d from %s (UserAgent: %s)",
			c.UserID, c.RemoteAddr, c.UserAgent)
		return false
	}

	return true
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
		log.Printf("[AUDIT] WebSocket disconnected: user_id=%d, duration=%v, remote_addr=%s",
			c.UserID, time.Since(c.ConnectedAt), c.RemoteAddr)
	}()

	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Rate limiting check (P0-004)
		if !c.checkRateLimit() {
			// Send rate limit error
			c.Send <- &Message{
				RecipientID: c.UserID,
				Type:        "error",
				Payload: map[string]interface{}{
					"code":    "RATE_LIMIT_EXCEEDED",
					"message": "Too many messages. Please slow down.",
				},
			}
			continue
		}

		// Parse incoming message
		var incomingMsg struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}

		if err := json.Unmarshal(message, &incomingMsg); err != nil {
			log.Printf("Failed to parse message: %v", err)
			continue
		}

		// Handle different message types
		switch incomingMsg.Type {
		case "typing":
			var typingData typingPayload
			if err := json.Unmarshal(incomingMsg.Payload, &typingData); err != nil {
				log.Printf("Failed to parse typing data: %v", err)
				continue
			}

			// Derive recipients server-side; never trust client-provided recipient_id for broadcasting.
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			msgs, err := c.buildTypingBroadcasts(ctx, typingData)
			cancel()
			if err != nil {
				log.Printf("Authorization/settings error for typing event: %v", err)
				continue
			}
			for _, msg := range msgs {
				c.Hub.Broadcast(msg)
			}

		default:
			log.Printf("Unknown message type: %s", incomingMsg.Type)
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
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Send message as JSON
			if err := c.Conn.WriteJSON(message); err != nil {
				log.Printf("Failed to write message: %v", err)
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
