package handlers

import (
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	ws "github.com/gorilla/websocket"
	"github.com/omninudge/backend/internal/api/middleware"
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
	"5177": {},
	"8080": {},
}

var allowedProdHosts = map[string]struct{}{
	"omninudge.com":     {},
	"www.omninudge.com": {},
	"api.omninudge.com": {},
}

var upgrader = ws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			// Browsers always send Origin for a cross-site WebSocket upgrade.
			// Keep origin-less tooling usable only against the explicit local
			// development listener; production hosts must fail closed.
			return isAllowedWebSocketDevelopmentHost(r.Host)
		}

		parsed, err := url.Parse(origin)
		if err != nil || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" ||
			(parsed.Path != "" && parsed.Path != "/") {
			return false
		}

		host := strings.ToLower(parsed.Hostname())
		if _, ok := allowedProdHosts[host]; ok {
			return parsed.Scheme == "https" && (parsed.Port() == "" || parsed.Port() == "443")
		}
		if isWebSocketDevelopmentHost(host) {
			if _, ok := allowedDevPorts[parsed.Port()]; ok {
				return parsed.Scheme == "http"
			}
		}

		return false
	},
}

func isWebSocketDevelopmentHost(host string) bool {
	switch strings.ToLower(strings.TrimSpace(host)) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}

func isAllowedWebSocketDevelopmentHost(host string) bool {
	parsed, err := url.Parse("//" + strings.TrimSpace(host))
	if err != nil || parsed.User != nil || !isWebSocketDevelopmentHost(parsed.Hostname()) {
		return false
	}
	_, ok := allowedDevPorts[parsed.Port()]
	return ok
}

// WebSocketHandler handles WebSocket connections
type WebSocketHandler struct {
	hub          *websocket.Hub
	authorizer   *websocket.Authorizer
	settingsRepo websocket.SettingsRepository
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler(hub *websocket.Hub, authorizer *websocket.Authorizer, settingsRepo websocket.SettingsRepository) *WebSocketHandler {
	return &WebSocketHandler{
		hub:          hub,
		authorizer:   authorizer,
		settingsRepo: settingsRepo,
	}
}

// HandleWebSocket handles WebSocket upgrade requests.
// @Summary      Establish WebSocket connection
// @Tags         WebSocket
// @Produce      json
// @Success      101  {object}  gin.H  "Switching Protocols"
// @Failure      401  {object}  gin.H
// @Security     BearerAuth
// @Router       /ws [get]
func (h *WebSocketHandler) HandleWebSocket(c *gin.Context) {
	log.Printf("WebSocket connection attempt from %s", c.ClientIP())

	// Get user ID from context (set by AuthRequired middleware)
	uid, ok := middleware.GetAuthenticatedUserID(c)
	if !ok {
		return
	}

	log.Printf("Upgrading WebSocket for user_id=%d", uid)
	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket for user_id=%d: %v", uid, err)
		// Check if error is due to already written response
		if strings.Contains(err.Error(), "response") || strings.Contains(err.Error(), "hijack") {
			log.Printf("Response already written or connection hijacked - this is expected in some scenarios")
		}
		return
	}
	log.Printf("WebSocket upgraded successfully for user_id=%d", uid)

	// Create new client with security metadata (P0-004) and authorization (P0-008b)
	client := websocket.NewClient(
		h.hub,
		conn,
		uid,
		c.ClientIP(),
		c.Request.UserAgent(),
		h.authorizer,
		h.settingsRepo,
	)

	// Audit log connection (P0-004)
	log.Printf("[AUDIT] WebSocket connected: user_id=%d, remote_addr=%s, user_agent=%s",
		uid, client.RemoteAddr, client.UserAgent)

	// Register client with hub
	h.hub.Register(client)

	// Start client goroutines
	client.Start()
}

// GetHub returns the WebSocket hub (for use in other handlers)
func (h *WebSocketHandler) GetHub() *websocket.Hub {
	return h.hub
}
