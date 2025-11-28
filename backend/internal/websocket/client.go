package websocket

import (
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 512 * 1024 // 512 KB
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
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
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
