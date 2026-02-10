package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/services"
)

type PushNotificationHandler struct {
	db       *pgxpool.Pool
	firebase *services.FirebaseService
}

func NewPushNotificationHandler(db *pgxpool.Pool, firebase *services.FirebaseService) *PushNotificationHandler {
	return &PushNotificationHandler{
		db:       db,
		firebase: firebase,
	}
}

// RegisterDeviceToken registers a device token for push notifications
// POST /api/v1/devices/register
func (h *PushNotificationHandler) RegisterDeviceToken(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Token      string `json:"token" binding:"required"`
		DeviceType string `json:"device_type" binding:"required,oneof=web ios android"`
		DeviceName string `json:"device_name"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Upsert device token (update if exists, insert if new)
	_, err := h.db.Exec(c.Request.Context(), `
		INSERT INTO device_tokens (user_id, token, device_type, device_name, last_used_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (token) DO UPDATE
		SET user_id = EXCLUDED.user_id,
		    device_type = EXCLUDED.device_type,
		    device_name = EXCLUDED.device_name,
		    last_used_at = NOW()
	`, userID, req.Token, req.DeviceType, req.DeviceName)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register device token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "registered"})
}

// UnregisterDeviceToken removes a device token
// DELETE /api/v1/devices/unregister
func (h *PushNotificationHandler) UnregisterDeviceToken(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Token string `json:"token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Delete the device token
	_, err := h.db.Exec(c.Request.Context(), `
		DELETE FROM device_tokens
		WHERE user_id = $1 AND token = $2
	`, userID, req.Token)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unregister device token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "unregistered"})
}

// GetUserDevices returns all registered devices for the current user
// GET /api/v1/devices
func (h *PushNotificationHandler) GetUserDevices(c *gin.Context) {
	userID := c.GetInt("user_id")

	rows, err := h.db.Query(c.Request.Context(), `
		SELECT id, device_type, device_name, last_used_at, created_at
		FROM device_tokens
		WHERE user_id = $1
		ORDER BY last_used_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get devices"})
		return
	}
	defer rows.Close()

	type Device struct {
		ID         int    `json:"id"`
		DeviceType string `json:"device_type"`
		DeviceName string `json:"device_name"`
		LastUsedAt string `json:"last_used_at"`
		CreatedAt  string `json:"created_at"`
	}

	var devices []Device
	for rows.Next() {
		var device Device
		if err := rows.Scan(&device.ID, &device.DeviceType, &device.DeviceName, &device.LastUsedAt, &device.CreatedAt); err != nil {
			continue
		}
		devices = append(devices, device)
	}

	c.JSON(http.StatusOK, gin.H{"devices": devices})
}

// TestNotification sends a test notification to the current user (for testing)
// POST /api/v1/devices/test
func (h *PushNotificationHandler) TestNotification(c *gin.Context) {
	userID := c.GetInt("user_id")

	// Get all device tokens for this user
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT token FROM device_tokens WHERE user_id = $1
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get device tokens"})
		return
	}
	defer rows.Close()

	var tokens []string
	for rows.Next() {
		var token string
		if err := rows.Scan(&token); err != nil {
			continue
		}
		tokens = append(tokens, token)
	}

	if len(tokens) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No devices registered"})
		return
	}

	// Send test notification
	data := map[string]string{
		"type": "test",
	}

	if len(tokens) == 1 {
		err = h.firebase.SendNotification(c.Request.Context(), tokens[0], "Test Notification", "This is a test from OmniNudge!", data)
	} else {
		_, err = h.firebase.SendMulticast(c.Request.Context(), tokens, "Test Notification", "This is a test from OmniNudge!", data)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send test notification"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "sent", "devices": len(tokens)})
}
