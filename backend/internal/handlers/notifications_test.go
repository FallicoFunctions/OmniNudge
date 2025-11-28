package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/chatreddit/backend/internal/database"
	"github.com/chatreddit/backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	notifTestCounter   int64
	notifTestRunSuffix = time.Now().UnixNano()
)

func uniqueNotifUsername(base string) string {
	id := atomic.AddInt64(&notifTestCounter, 1)
	return fmt.Sprintf("%s_%d_%d", base, notifTestRunSuffix, id)
}

func setupNotificationsHandlerTest(t *testing.T) (*NotificationsHandler, *database.Database, int, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// Create test user
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     uniqueNotifUsername("testuser"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, user)
	require.NoError(t, err)

	notifRepo := models.NewNotificationRepository(db.Pool)
	handler := NewNotificationsHandler(notifRepo)

	cleanup := func() {
		db.Close()
	}

	return handler, db, user.ID, cleanup
}

func createTestNotification(t *testing.T, db *database.Database, userID int, notifType string) int {
	ctx := context.Background()
	notifRepo := models.NewNotificationRepository(db.Pool)

	notif := &models.Notification{
		UserID:           userID,
		NotificationType: notifType,
		Message:          "Test notification",
		ContentType:      testStrPtr("post"),
		ContentID:        testIntPtr(1),
		Read:             false,
	}

	err := notifRepo.Create(ctx, notif)
	require.NoError(t, err)
	return notif.ID
}

func testStrPtr(s string) *string { return &s }

func testIntPtr(i int) *int { return &i }

func TestGetNotifications(t *testing.T) {
	handler, db, userID, cleanup := setupNotificationsHandlerTest(t)
	defer cleanup()

	// Create some notifications
	createTestNotification(t, db, userID, "post_milestone")
	createTestNotification(t, db, userID, "comment_reply")

	// Create request
	router := gin.Default()
	router.GET("/notifications", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.GetNotifications(c)
	})

	req := httptest.NewRequest("GET", "/notifications?limit=10&offset=0", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	notifications := response["notifications"].([]interface{})
	assert.Len(t, notifications, 2)
}

func TestGetUnreadCount(t *testing.T) {
	handler, db, userID, cleanup := setupNotificationsHandlerTest(t)
	defer cleanup()

	// Create unread and read notifications
	createTestNotification(t, db, userID, "post_milestone")
	createTestNotification(t, db, userID, "comment_reply")

	notifID := createTestNotification(t, db, userID, "post_velocity")
	notifRepo := models.NewNotificationRepository(db.Pool)
	_ = notifRepo.MarkAsRead(context.Background(), notifID, userID)

	// Create request
	router := gin.Default()
	router.GET("/unread/count", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.GetUnreadCount(c)
	})

	req := httptest.NewRequest("GET", "/unread/count", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	unreadCount := int(response["unread_count"].(float64))
	assert.Equal(t, 2, unreadCount)
}

func TestMarkAsRead(t *testing.T) {
	handler, db, userID, cleanup := setupNotificationsHandlerTest(t)
	defer cleanup()

	notifID := createTestNotification(t, db, userID, "post_milestone")

	// Create request
	router := gin.Default()
	router.POST("/notifications/:id/read", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.MarkAsRead(c)
	})

	req := httptest.NewRequest("POST", "/notifications/"+strconv.Itoa(notifID)+"/read", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	// Verify notification was marked as read
	notifRepo := models.NewNotificationRepository(db.Pool)
	notif, err := notifRepo.GetByID(context.Background(), notifID, userID)
	require.NoError(t, err)
	require.NotNil(t, notif)
	assert.True(t, notif.Read)
}

func TestMarkAllAsRead(t *testing.T) {
	handler, db, userID, cleanup := setupNotificationsHandlerTest(t)
	defer cleanup()

	// Create multiple unread notifications
	createTestNotification(t, db, userID, "post_milestone")
	createTestNotification(t, db, userID, "comment_reply")
	createTestNotification(t, db, userID, "post_velocity")

	// Create request
	router := gin.Default()
	router.POST("/read-all", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.MarkAllAsRead(c)
	})

	req := httptest.NewRequest("POST", "/read-all", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	// Verify all notifications are read
	notifRepo := models.NewNotificationRepository(db.Pool)
	count, err := notifRepo.GetUnreadCount(context.Background(), userID)
	require.NoError(t, err)
	assert.Equal(t, 0, count)
}

func TestDeleteNotification(t *testing.T) {
	handler, db, userID, cleanup := setupNotificationsHandlerTest(t)
	defer cleanup()

	notifID := createTestNotification(t, db, userID, "post_milestone")

	// Create request
	router := gin.Default()
	router.DELETE("/notifications/:id", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.DeleteNotification(c)
	})

	req := httptest.NewRequest("DELETE", "/notifications/"+strconv.Itoa(notifID), nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	// Verify notification was deleted
	notifRepo := models.NewNotificationRepository(db.Pool)
	notif, err := notifRepo.GetByID(context.Background(), notifID, userID)
	require.NoError(t, err)
	assert.Nil(t, notif)
}

func TestGetNotificationsUnreadOnly(t *testing.T) {
	handler, db, userID, cleanup := setupNotificationsHandlerTest(t)
	defer cleanup()

	// Create unread and read notifications
	createTestNotification(t, db, userID, "post_milestone")
	readNotifID := createTestNotification(t, db, userID, "comment_reply")

	notifRepo := models.NewNotificationRepository(db.Pool)
	_ = notifRepo.MarkAsRead(context.Background(), readNotifID, userID)

	// Create request for unread only
	router := gin.Default()
	router.GET("/notifications", func(c *gin.Context) {
		c.Set("user_id", userID)
		handler.GetNotifications(c)
	})

	req := httptest.NewRequest("GET", "/notifications?unread_only=true", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	notifications := response["notifications"].([]interface{})
	assert.Len(t, notifications, 1, "Should only return unread notifications")
}
