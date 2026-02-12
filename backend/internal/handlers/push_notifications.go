package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type PushNotificationHandler struct {
	db        *pgxpool.Pool
	tokenRepo *models.DeviceTokenRepository
	firebase  *services.FirebaseService
}

func NewPushNotificationHandler(db *pgxpool.Pool, tokenRepo *models.DeviceTokenRepository, firebase *services.FirebaseService) *PushNotificationHandler {
	return &PushNotificationHandler{
		db:        db,
		tokenRepo: tokenRepo,
		firebase:  firebase,
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

	dt := &models.DeviceToken{
		UserID:     userID,
		Token:      req.Token,
		DeviceType: req.DeviceType,
		DeviceName: req.DeviceName,
	}

	if err := h.tokenRepo.Upsert(c.Request.Context(), dt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to register device token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "registered", "device": dt})
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

	if err := h.tokenRepo.DeleteByUserAndToken(c.Request.Context(), userID, req.Token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unregister device token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "unregistered"})
}

// GetUserDevices returns all registered devices for the current user
// GET /api/v1/devices
func (h *PushNotificationHandler) GetUserDevices(c *gin.Context) {
	userID := c.GetInt("user_id")

	devices, err := h.tokenRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get devices"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"devices": devices})
}

// TestNotification sends a test notification to the current user (for testing)
// POST /api/v1/devices/test
func (h *PushNotificationHandler) TestNotification(c *gin.Context) {
	userID := c.GetInt("user_id")

	// Get all device tokens for this user
	tokens, err := h.tokenRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get device tokens"})
		return
	}

	if len(tokens) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No devices registered"})
		return
	}

	// Extract token strings
	tokenStrings := make([]string, len(tokens))
	for i, t := range tokens {
		tokenStrings[i] = t.Token
	}

	// Send test notification
	data := map[string]string{
		"type": "test",
	}

	if len(tokenStrings) == 1 {
		err = h.firebase.SendNotification(c.Request.Context(), tokenStrings[0], "Test Notification", "This is a test from OmniNudge!", data)
	} else {
		_, err = h.firebase.SendMulticast(c.Request.Context(), tokenStrings, "Test Notification", "This is a test from OmniNudge!", data)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send test notification"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "sent", "devices": len(tokens)})
}
