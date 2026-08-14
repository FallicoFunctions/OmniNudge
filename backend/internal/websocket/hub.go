package websocket

import (
	"sync"

	"github.com/gorilla/websocket"
	zlog "github.com/rs/zerolog/log"
)

// Hub maintains the set of active clients and broadcasts messages
type Hub struct {
	// Registered clients grouped by user ID. A user may have more than one
	// active connection (for example, multiple tabs or devices).
	clients map[int]map[*Client]struct{}

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
		clients:    make(map[int]map[*Client]struct{}),
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
			connections, userWasOnline := h.clients[client.UserID]
			if !userWasOnline {
				connections = make(map[*Client]struct{})
				h.clients[client.UserID] = connections
			}
			connections[client] = struct{}{}
			connectionCount := len(connections)
			h.mu.Unlock()
			zlog.Info().Int("user_id", client.UserID).Int("connection_count", connectionCount).Msg("websocket: client registered")

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

			// Presence is user-scoped, so only announce the transition from zero
			// connections to one connection.
			if !userWasOnline {
				h.broadcastUserStatus(client.UserID, true)
			}

		case client := <-h.unregister:
			h.mu.Lock()
			connections, userExists := h.clients[client.UserID]
			_, connectionExists := connections[client]
			if userExists && connectionExists {
				delete(connections, client)
				close(client.Send)
				userWentOffline := len(connections) == 0
				if userWentOffline {
					delete(h.clients, client.UserID)
				}
				remainingConnections := len(connections)
				h.mu.Unlock()
				zlog.Info().Int("user_id", client.UserID).Int("connection_count", remainingConnections).Msg("websocket: client unregistered")

				if userWentOffline {
					h.broadcastUserStatus(client.UserID, false)
				}
				continue
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			// RecipientID 0 is a reserved internal "broadcast to all clients" target.
			if message.RecipientID == 0 {
				h.mu.RLock()
				for _, connections := range h.clients {
					for client := range connections {
						select {
						case client.Send <- message:
						default:
							// Client's send buffer is full — drop this message for this client.
							// The writePump will detect the dead connection on the next write
							// and unregister via the unregister channel. We must never close
							// client.Send here: closing outside the unregister path causes
							// double-close panics.
							zlog.Warn().Int("user_id", client.UserID).Msg("websocket: broadcast dropped (send buffer full)")
						}
					}
				}
				h.mu.RUnlock()
				continue
			}

			h.mu.RLock()
			connections := h.clients[message.RecipientID]
			for client := range connections {
				select {
				case client.Send <- message:
				default:
					// Same rationale: drop, never close Send outside unregister.
					zlog.Warn().Int("user_id", client.UserID).Msg("websocket: message dropped (send buffer full)")
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Broadcast enqueues a message for delivery. It is non-blocking: if the hub's
// internal broadcast channel is full the message is dropped and a warning is
// logged. This prevents callers (e.g. the WebSocket readPump) from blocking
// indefinitely when the hub is under load.
func (h *Hub) Broadcast(message *Message) {
	select {
	case h.broadcast <- message:
	default:
		zlog.Warn().Msg("websocket: hub broadcast channel full — message dropped")
	}
}

// IsUserOnline checks if a user is currently connected
func (h *Hub) IsUserOnline(userID int) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients[userID]) > 0
}

// Register enqueues a client to be registered with the hub
func (h *Hub) Register(client *Client) {
	select {
	case h.register <- client:
	case <-h.done:
	}
}

// Unregister removes one connection without affecting the user's other tabs
// or devices. It returns immediately when the hub is shutting down.
func (h *Hub) Unregister(client *Client) {
	select {
	case h.unregister <- client:
	case <-h.done:
	}
}

// GetOnlineUsers returns a list of currently online user IDs
func (h *Hub) GetOnlineUsers() []int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users := make([]int, 0, len(h.clients))
	for userID, connections := range h.clients {
		if len(connections) == 0 {
			continue
		}
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
	for id, connections := range h.clients {
		if id != userID {
			for client := range connections {
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
	connectionCount := 0

	for userID, connections := range h.clients {
		for client := range connections {
			connectionCount++
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
		}
		delete(h.clients, userID)
	}

	h.mu.Unlock()

	// Signal Run() to exit its event loop.
	close(h.done)

	zlog.Info().Int("connections_closed", connectionCount).Msg("websocket hub shutdown complete")
}
