package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/services"
)

type PushNotificationHandler struct {
	db        *pgxpool.Pool
	tokenRepo ports.DeviceTokenRepository
	firebase  *services.FirebaseService
}

func NewPushNotificationHandler(db *pgxpool.Pool, tokenRepo ports.DeviceTokenRepository, firebase *services.FirebaseService) *PushNotificationHandler {
	return &PushNotificationHandler{
		db:        db,
		tokenRepo: tokenRepo,
		firebase:  firebase,
	}
}

// RegisterDeviceToken registers a device token for push notifications.
// @Summary      Register device token
// @Tags         PushNotifications
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /devices/register [post]
func (h *PushNotificationHandler) RegisterDeviceToken(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Token      string `json:"token" binding:"required"`
		DeviceType string `json:"device_type" binding:"required,oneof=web ios android"`
		DeviceName string `json:"device_name"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	dt := &models.DeviceToken{
		UserID:     userID,
		Token:      req.Token,
		DeviceType: req.DeviceType,
		DeviceName: req.DeviceName,
	}

	if err := h.tokenRepo.Upsert(c.Request.Context(), dt); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to register device token")
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "registered", "device": dt})
}

// UnregisterDeviceToken removes a device push token.
// @Summary      Unregister device token
// @Tags         PushNotifications
// @Security     BearerAuth
// @Accept       json
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /devices/unregister [delete]
func (h *PushNotificationHandler) UnregisterDeviceToken(c *gin.Context) {
	userID := c.GetInt("user_id")

	var req struct {
		Token string `json:"token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid request")
		return
	}

	if err := h.tokenRepo.DeleteByUserAndToken(c.Request.Context(), userID, req.Token); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to unregister device token")
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "unregistered"})
}

// GetUserDevices returns all registered push devices for the current user.
// @Summary      Get registered devices
// @Tags         PushNotifications
// @Security     BearerAuth
// @Produce      json
// @Success      200  {array}   gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /devices [get]
func (h *PushNotificationHandler) GetUserDevices(c *gin.Context) {
	userID := c.GetInt("user_id")

	devices, err := h.tokenRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get devices")
		return
	}

	c.JSON(http.StatusOK, gin.H{"devices": devices})
}

// TestNotification sends a test push notification to the current user.
// @Summary      Send test notification
// @Tags         PushNotifications
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /devices/test [post]
func (h *PushNotificationHandler) TestNotification(c *gin.Context) {
	userID := c.GetInt("user_id")

	// Get all device tokens for this user
	tokens, err := h.tokenRepo.GetByUserID(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to get device tokens")
		return
	}

	if len(tokens) == 0 {
		RespondError(c, http.StatusBadRequest, "No devices registered")
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
		RespondError(c, http.StatusInternalServerError, "Failed to send test notification")
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "sent", "devices": len(tokens)})
}
