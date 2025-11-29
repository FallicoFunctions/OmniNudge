package handlers

import (
	"log"
	"net/http"

	"github.com/omninudge/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	ws "github.com/gorilla/websocket"
)

var upgrader = ws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow connections from localhost (development)
		// In production, you should check the origin more carefully
		origin := r.Header.Get("Origin")
		return origin == "http://localhost:3000" ||
			origin == "http://localhost:5173" ||
			origin == "http://localhost:8080"
	},
}

// WebSocketHandler handles WebSocket connections
type WebSocketHandler struct {
	hub *websocket.Hub
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler(hub *websocket.Hub) *WebSocketHandler {
	return &WebSocketHandler{
		hub: hub,
	}
}

// HandleWebSocket handles WebSocket upgrade requests
func (h *WebSocketHandler) HandleWebSocket(c *gin.Context) {
	// Get user ID from context (set by AuthRequired middleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket: %v", err)
		return
	}

	// Create new client
	client := &websocket.Client{
		UserID: userID.(int),
		Conn:   conn,
		Send:   make(chan *websocket.Message, 256),
		Hub:    h.hub,
	}

	// Register client with hub
	h.hub.Register(client)

	// Start client goroutines
	client.Start()
}

// GetHub returns the WebSocket hub (for use in other handlers)
func (h *WebSocketHandler) GetHub() *websocket.Hub {
	return h.hub
}
