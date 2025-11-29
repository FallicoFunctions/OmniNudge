package websocket

import (
	"log"
	"sync"
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
	}
}

// Run starts the hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.UserID] = client
			h.mu.Unlock()
			log.Printf("Client registered: user_id=%d", client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.UserID]; ok {
				delete(h.clients, client.UserID)
				close(client.Send)
				log.Printf("Client unregistered: user_id=%d", client.UserID)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
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
