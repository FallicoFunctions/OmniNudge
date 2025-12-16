package handlers

import (
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	ws "github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/websocket"
)

var allowedDevPorts = map[string]struct{}{
	"":     {},
	"80":   {},
	"3000": {},
	"5173": {},
	"5174": {},
	"5175": {},
	"5176": {},
	"8080": {},
}

var upgrader = ws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}

		parsed, err := url.Parse(origin)
		if err != nil {
			return false
		}

		host := strings.ToLower(parsed.Hostname())
		if host == "localhost" || host == "127.0.0.1" || host == "::1" {
			if _, ok := allowedDevPorts[parsed.Port()]; ok {
				return true
			}
		}

		return false
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
