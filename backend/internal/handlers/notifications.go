package handlers

import (
	"github.com/omninudge/backend/internal/ports"
	"net/http"
	"strconv"

	"github.com/omninudge/backend/internal/models"
	"github.com/gin-gonic/gin"
)

// NotificationsHandler handles notification-related HTTP requests
type NotificationsHandler struct {
	notifRepo ports.NotificationRepository
}

// NewNotificationsHandler creates a new notifications handler
func NewNotificationsHandler(notifRepo ports.NotificationRepository) *NotificationsHandler {
	return &NotificationsHandler{notifRepo: notifRepo}
}

// GetNotifications returns notifications for the authenticated user.
// @Summary      Get notifications
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Param        limit       query  int   false  "Page size (default 20, max 100)"
// @Param        offset      query  int   false  "Offset"
// @Param        unread_only query  bool  false  "Filter unread only"
// @Param        cursor      query  string false "Pagination cursor"
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /notifications [get]
func (h *NotificationsHandler) GetNotifications(c *gin.Context) {
	userID := c.GetInt("user_id")

	// Parse query parameters
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	unreadOnly, _ := strconv.ParseBool(c.DefaultQuery("unread_only", "false"))
	cursorParam := c.Query("cursor")

	// Validate limit
	if limit < 1 || limit > 100 {
		limit = 20
	}

	var cursor *timeCursor
	if cursorParam != "" {
		decoded, err := decodeTimeCursor(cursorParam)
		if err != nil {
			RespondError(c, http.StatusBadRequest, "Invalid cursor")
			return
		}
		cursor = decoded
	}
	useCursorPagination := cursorParam != "" || offset == 0
	limitArg := limit
	if useCursorPagination {
		limitArg = limit + 1
		offset = 0
	}

	var notifications []*models.Notification
	var err error
	if useCursorPagination {
		var payload *models.TimeCursor
		if cursor != nil {
			payload = &models.TimeCursor{ID: cursor.ID, Timestamp: cursor.Timestamp}
		}
		notifications, err = h.notifRepo.GetByUserIDWithCursor(c.Request.Context(), userID, limitArg, unreadOnly, payload)
	} else {
		notifications, err = h.notifRepo.GetByUserID(c.Request.Context(), userID, limitArg, offset, unreadOnly)
	}
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch notifications")
		return
	}

	nextCursor := ""
	if useCursorPagination && len(notifications) > limit {
		notifications = notifications[:limit]
		if len(notifications) > 0 {
			last := notifications[len(notifications)-1]
			nextCursor = encodeTimeCursor(timeCursor{ID: last.ID, Timestamp: last.CreatedAt})
		}
	}

	response := gin.H{
		"notifications": notifications,
		"limit":         limit,
		"offset":        offset,
	}
	if nextCursor != "" {
		response["next_cursor"] = nextCursor
	}
	c.JSON(http.StatusOK, response)
}

// GetUnreadCount returns the count of unread notifications.
// @Summary      Get unread notification count
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /notifications/unread/count [get]
func (h *NotificationsHandler) GetUnreadCount(c *gin.Context) {
	userID := c.GetInt("user_id")

	count, err := h.notifRepo.GetUnreadCount(c.Request.Context(), userID)
	if err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to fetch unread count")
		return
	}

	c.JSON(http.StatusOK, gin.H{"unread_count": count})
}

// MarkAsRead marks a notification as read.
// @Summary      Mark notification as read
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Notification ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /notifications/{id}/read [post]
func (h *NotificationsHandler) MarkAsRead(c *gin.Context) {
	userID := c.GetInt("user_id")
	notificationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid notification ID")
		return
	}

	if err := h.notifRepo.MarkAsRead(c.Request.Context(), notificationID, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to mark notification as read")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification marked as read"})
}

// MarkAllAsRead marks all notifications as read for the user.
// @Summary      Mark all notifications as read
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Success      200  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /notifications/read-all [post]
func (h *NotificationsHandler) MarkAllAsRead(c *gin.Context) {
	userID := c.GetInt("user_id")

	if err := h.notifRepo.MarkAllAsRead(c.Request.Context(), userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to mark all notifications as read")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "All notifications marked as read"})
}

// DeleteNotification deletes a notification.
// @Summary      Delete notification
// @Tags         Notifications
// @Security     BearerAuth
// @Produce      json
// @Param        id  path  int  true  "Notification ID"
// @Success      200  {object}  gin.H
// @Failure      400  {object}  gin.H
// @Failure      401  {object}  gin.H
// @Failure      500  {object}  gin.H
// @Router       /notifications/{id} [delete]
func (h *NotificationsHandler) DeleteNotification(c *gin.Context) {
	userID := c.GetInt("user_id")
	notificationID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		RespondError(c, http.StatusBadRequest, "Invalid notification ID")
		return
	}

	if err := h.notifRepo.Delete(c.Request.Context(), notificationID, userID); err != nil {
		RespondError(c, http.StatusInternalServerError, "Failed to delete notification")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification deleted"})
}
