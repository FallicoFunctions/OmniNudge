package websocket

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
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
	maxMessagesPerMinute = 60         // Max messages per minute per connection
	rateLimitWindow      = time.Minute // Rate limit reset window
)

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
	RemoteAddr string // IP address
	UserAgent  string // Browser user agent
	ConnectedAt time.Time // Connection timestamp

	// Rate limiting (P0-004)
	messageCount int       // Messages sent in current window
	lastReset    time.Time // Last rate limit window reset

	// Authorization (P0-008b)
	Authorizer *Authorizer
}

// NewClient creates a new WebSocket client with security metadata
func NewClient(hub *Hub, conn *websocket.Conn, userID int, remoteAddr, userAgent string, authorizer *Authorizer) *Client {
	now := time.Now()
	return &Client{
		Hub:          hub,
		Conn:         conn,
		Send:         make(chan *Message, 256),
		UserID:       userID,
		RemoteAddr:   remoteAddr,
		UserAgent:    userAgent,
		ConnectedAt:  now,
		lastReset:    now,
		lastTyping:   time.Time{},
		messageCount: 0,
		Authorizer:   authorizer,
	}
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
			// Parse typing notification
			var typingData struct {
				ConversationID int  `json:"conversation_id"`
				RecipientID    int  `json:"recipient_id"`
				IsTyping       bool `json:"is_typing"`
			}
			if err := json.Unmarshal(incomingMsg.Payload, &typingData); err != nil {
				log.Printf("Failed to parse typing data: %v", err)
				continue
			}

			// Authorization check (P0-008b): verify user is in conversation
			if c.Authorizer != nil && typingData.ConversationID != 0 {
				canAccess, err := c.Authorizer.CanAccessConversation(context.Background(), c.UserID, typingData.ConversationID)
				if err != nil {
					log.Printf("Authorization error: %v", err)
					c.Send <- &Message{
						RecipientID: c.UserID,
						Type:        "error",
						Payload: map[string]interface{}{
							"code":    "AUTHORIZATION_ERROR",
							"message": "Failed to verify conversation access",
						},
					}
					continue
				}
				if !canAccess {
					log.Printf("[SECURITY] Unauthorized typing event: user_id=%d, conversation_id=%d", c.UserID, typingData.ConversationID)
					c.Send <- &Message{
						RecipientID: c.UserID,
						Type:        "error",
						Payload: map[string]interface{}{
							"code":    "UNAUTHORIZED",
							"message": "You are not a member of this conversation",
						},
					}
					continue
				}
			}

			// Debounce typing events to avoid flooding
			now := time.Now()
			if now.Sub(c.lastTyping) < typingDebounce {
				continue
			}
			c.lastTyping = now

			// Broadcast typing indicator to the other participant
			if typingData.RecipientID != 0 {
				c.Hub.Broadcast(&Message{
					RecipientID: typingData.RecipientID,
					Type:        "typing",
					Payload: map[string]interface{}{
						"conversation_id": typingData.ConversationID,
						"user_id":         c.UserID,
						"is_typing":       typingData.IsTyping,
					},
				})
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
