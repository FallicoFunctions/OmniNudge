package websocket

import (
	"sync"

	"github.com/gorilla/websocket"
	zlog "github.com/rs/zerolog/log"
)

// Hub maintains the set of active clients and broadcasts messages
type Hub struct {
	// Registered clients mapped by user ID
	clients map[int]*Client

	// Inbound messages from clients
	broadcast chan *Message

	// Register requests from clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Mutex to protect clients map
	mu sync.RWMutex

	// done is closed by Shutdown() to signal Run() to exit the event loop.
	done chan struct{}
	// closing is set to true by Shutdown() under mu so that new registrations
	// arriving after shutdown began are not leaked.
	closing bool
}

// Message represents a WebSocket message to broadcast
type Message struct {
	RecipientID int         `json:"recipient_id"`
	Type        string      `json:"type"` // "new_message", "message_delivered", "message_read", "typing"
	Payload     interface{} `json:"payload"`
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[int]*Client),
		broadcast:  make(chan *Message, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		done:       make(chan struct{}),
	}
}

// Run starts the hub event loop. It exits when Shutdown() closes the done channel.
func (h *Hub) Run() {
	for {
		select {
		case <-h.done:
			return
		case client := <-h.register:
			h.mu.Lock()
			// Reject new registrations during shutdown to avoid leaking connections.
			if h.closing {
				h.mu.Unlock()
				close(client.Send)
				continue
			}
			if existing, ok := h.clients[client.UserID]; ok {
				// "Last connection wins": close previous connection for this user.
				close(existing.Send)
				delete(h.clients, client.UserID)
				zlog.Info().Int("user_id", client.UserID).Msg("websocket: client replaced (new connection for same user)")
			}
			h.clients[client.UserID] = client
			h.mu.Unlock()
			zlog.Info().Int("user_id", client.UserID).Msg("websocket: client registered")

			// Send initial state to newly connected client
			onlineUserIDs := h.GetOnlineUsers()
			client.Send <- &Message{
				RecipientID: client.UserID,
				Type:        "initial_state",
				Payload: map[string]interface{}{
					"online_users": onlineUserIDs,
				},
			}
			zlog.Info().Int("user_id", client.UserID).Int("online_users", len(onlineUserIDs)).Msg("websocket: sent initial state")

			// Broadcast user_online event to all other connected users
			h.broadcastUserStatus(client.UserID, true)

		case client := <-h.unregister:
			h.mu.Lock()
			// Only unregister if this is still the current client for this user.
			// If the user reconnected, the old client was already removed from the
			// map (and its Send channel closed) in the register path, so we must
			// not close it again or delete the new client.
			if current, ok := h.clients[client.UserID]; ok && current == client {
				delete(h.clients, client.UserID)
				close(client.Send)
				zlog.Info().Int("user_id", client.UserID).Msg("websocket: client unregistered")

				// Broadcast user_offline event to all other connected users
				h.mu.Unlock()
				h.broadcastUserStatus(client.UserID, false)
			} else {
				h.mu.Unlock()
			}

		case message := <-h.broadcast:
			// RecipientID 0 is a reserved internal "broadcast to all clients" target.
			if message.RecipientID == 0 {
				h.mu.Lock()
				for userID, client := range h.clients {
					select {
					case client.Send <- message:
						// Message sent successfully
					default:
						// Client's send channel is full, close it
						close(client.Send)
						delete(h.clients, userID)
					}
				}
				h.mu.Unlock()
				continue
			}

			h.mu.RLock()
			client, ok := h.clients[message.RecipientID]
			h.mu.RUnlock()

			if ok {
				select {
				case client.Send <- message:
					// Message sent successfully
				default:
					// Client's send channel is full, close it
					h.mu.Lock()
					close(client.Send)
					delete(h.clients, client.UserID)
					h.mu.Unlock()
				}
			}
		}
	}
}

// Broadcast sends a message to a specific user
func (h *Hub) Broadcast(message *Message) {
	h.broadcast <- message
}

// IsUserOnline checks if a user is currently connected
func (h *Hub) IsUserOnline(userID int) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.clients[userID]
	return ok
}

// Register enqueues a client to be registered with the hub
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// GetOnlineUsers returns a list of currently online user IDs
func (h *Hub) GetOnlineUsers() []int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users := make([]int, 0, len(h.clients))
	for userID := range h.clients {
		users = append(users, userID)
	}
	return users
}

// BroadcastToUsers sends the same message to multiple users
func (h *Hub) BroadcastToUsers(userIDs []int, msgType string, payload interface{}) {
	for _, userID := range userIDs {
		h.Broadcast(&Message{
			RecipientID: userID,
			Type:        msgType,
			Payload:     payload,
		})
	}
}

// broadcastUserStatus broadcasts user online/offline status to all connected users
func (h *Hub) broadcastUserStatus(userID int, isOnline bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	eventType := "user_offline"
	if isOnline {
		eventType = "user_online"
	}

	// Broadcast to all connected users except the user whose status changed
	for id, client := range h.clients {
		if id != userID {
			select {
			case client.Send <- &Message{
				RecipientID: id,
				Type:        eventType,
				Payload: map[string]interface{}{
					"user_id": userID,
				},
			}:
				// Message sent successfully
			default:
				// Client's send channel is full, skip
			}
		}
	}
}

// FeatureFlagUpdatedEvent represents a feature flag update event
type FeatureFlagUpdatedEvent struct {
	Type       string `json:"type"` // "feature_flag_updated"
	Key        string `json:"key"`
	Enabled    bool   `json:"enabled"`
	Percentage *int   `json:"percentage,omitempty"`
}

func (h *Hub) BroadcastFeatureFlagUpdate(key string, enabled bool, percentage *int) {
	event := FeatureFlagUpdatedEvent{
		Type:       "feature_flag_updated",
		Key:        key,
		Enabled:    enabled,
		Percentage: percentage,
	}
	h.Broadcast(&Message{
		RecipientID: 0, // Broadcast to all
		Type:        "feature_flag_updated",
		Payload:     event,
	})
}

// Shutdown signals all connected clients to disconnect and stops the Run() loop.
// It is safe to call exactly once during graceful server shutdown.
//
// Shutdown acquires the write lock, marks the hub as closing (so Run() will
// reject new registrations), sends a "server_shutdown" notification to every
// connected client, closes each client's Send channel so their writePump
// exits cleanly, and finally closes the done channel so Run() returns.
func (h *Hub) Shutdown() {
	h.mu.Lock()

	// Guard against double-Shutdown (e.g. called from a defer and explicitly).
	if h.closing {
		h.mu.Unlock()
		return
	}
	h.closing = true
	count := len(h.clients)

	for _, client := range h.clients {
		// Best-effort: notify the client before closing its channel.
		// Use a recover in case the writePump has already exited and the Send
		// channel was closed from another goroutine — sending on a closed
		// channel panics in Go.
		func() {
			defer func() { recover() }() //nolint:errcheck
			select {
			case client.Send <- &Message{
				RecipientID: client.UserID,
				Type:        "server_shutdown",
				Payload: map[string]interface{}{
					"code":   websocket.CloseGoingAway,
					"reason": "server shutting down",
				},
			}:
			default:
			}
		}()
		// Closing the channel triggers the writePump to send a WS CloseMessage
		// and exit. Use a recover in case it was already closed.
		func() {
			defer func() { recover() }() //nolint:errcheck
			close(client.Send)
		}()
		delete(h.clients, client.UserID)
	}

	h.mu.Unlock()

	// Signal Run() to exit its event loop.
	close(h.done)

	zlog.Info().Int("connections_closed", count).Msg("websocket hub shutdown complete")
}
