package integration

import (
	"bytes"
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
	"github.com/chatreddit/backend/internal/handlers"
	"github.com/chatreddit/backend/internal/models"
	"github.com/chatreddit/backend/internal/services"
	"github.com/chatreddit/backend/internal/websocket"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupNotificationIntegrationTest(t *testing.T) (*gin.Engine, *database.Database, *services.NotificationService, func()) {
	gin.SetMode(gin.TestMode)

	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	// Initialize repositories
	hubRepo := models.NewHubRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)
	hubModRepo := models.NewHubModeratorRepository(db.Pool)
	notifRepo := models.NewNotificationRepository(db.Pool)
	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	batchRepo := models.NewNotificationBatchRepository(db.Pool)
	settingsRepo := models.NewUserSettingsRepository(db.Pool)

	// Initialize WebSocket hub
	hub := websocket.NewHub()

	// Initialize notification service
	notifService := services.NewNotificationService(
		db.Pool,
		notifRepo,
		baselineRepo,
		batchRepo,
		settingsRepo,
		postRepo,
		commentRepo,
		hub,
	)

	feedRepo := models.NewFeedRepository(db.Pool)

	// Initialize handlers
	postsHandler := handlers.NewPostsHandler(postRepo, hubRepo, hubModRepo, feedRepo)
	commentsHandler := handlers.NewCommentsHandler(commentRepo, postRepo, hubModRepo)
	notificationsHandler := handlers.NewNotificationsHandler(notifRepo)

	// Inject notification service
	postsHandler.SetNotificationService(notifService)
	commentsHandler.SetNotificationService(notifService)

	// Setup router
	router := gin.Default()

	api := router.Group("/api/v1")
	{
		// Post routes
		api.POST("/posts/:id/vote", func(c *gin.Context) {
			postsHandler.VotePost(c)
		})

		// Comment routes
		api.POST("/posts/:id/comments", func(c *gin.Context) {
			commentsHandler.CreateComment(c)
		})
		api.POST("/comments/:id/vote", func(c *gin.Context) {
			commentsHandler.VoteComment(c)
		})

		// Notification routes
		api.GET("/notifications", func(c *gin.Context) {
			notificationsHandler.GetNotifications(c)
		})
		api.GET("/notifications/unread/count", func(c *gin.Context) {
			notificationsHandler.GetUnreadCount(c)
		})
	}

	cleanup := func() {
		db.Close()
	}

	return router, db, notifService, cleanup
}

var uniqueCounter int64

func uniqueName(base string) string {
	id := atomic.AddInt64(&uniqueCounter, 1)
	return fmt.Sprintf("%s_%d", base, id)
}

func createIntegrationTestData(t *testing.T, db *database.Database) (authorID, voterID, hubID, postID int) {
	ctx := context.Background()

	userRepo := models.NewUserRepository(db.Pool)
	settingsRepo := models.NewUserSettingsRepository(db.Pool)

	// Create author
	author := &models.User{
		Username:     uniqueName("post_author"),
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(ctx, author)
	require.NoError(t, err)

	// Enable notifications for author
	settings, err := settingsRepo.GetByUserID(ctx, author.ID)
	require.NoError(t, err)
	if settings == nil {
		settings, err = settingsRepo.CreateDefault(ctx, author.ID)
		require.NoError(t, err)
	}
	settings.NotifyPostMilestone = true
	settings.NotifyCommentReplies = true
	_, err = settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	// Create voter
	voter := &models.User{
		Username:     uniqueName("voter"),
		PasswordHash: "test_hash",
	}
	err = userRepo.Create(ctx, voter)
	require.NoError(t, err)

	// Create hub
	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      uniqueName("test_hub"),
		CreatedBy: &author.ID,
	}
	err = hubRepo.Create(ctx, hub)
	require.NoError(t, err)

	// Create post
	postRepo := models.NewPlatformPostRepository(db.Pool)
	post := &models.PlatformPost{
		AuthorID: author.ID,
		HubID:    hub.ID,
		Title:    fmt.Sprintf("Test Post %s", uniqueName("post")),
	}
	err = postRepo.Create(ctx, post)
	require.NoError(t, err)

	return author.ID, voter.ID, hub.ID, post.ID
}

func TestEndToEndPostVoteNotification(t *testing.T) {
	_, db, notifService, cleanup := setupNotificationIntegrationTest(t)
	defer cleanup()

	ctx := context.Background()
	authorID, _, _, postID := createIntegrationTestData(t, db)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	hubRepo := models.NewHubRepository(db.Pool)
	userRepo := models.NewUserRepository(db.Pool)
	anotherFeedRepo := models.NewFeedRepository(db.Pool)
	postsHandler := handlers.NewPostsHandler(postRepo, hubRepo, nil, anotherFeedRepo)
	postsHandler.SetNotificationService(notifService)

	postIDStr := strconv.Itoa(postID)
	// Vote on the post multiple times to reach milestone
	for i := 0; i < 10; i++ {
		voter := &models.User{
			Username:     fmt.Sprintf("milestone_voter_%d", i),
			PasswordHash: "test_hash",
		}
		err := userRepo.Create(ctx, voter)
		require.NoError(t, err)

		// Vote
		reqBody := map[string]interface{}{"is_upvote": true}
		jsonBody, err := json.Marshal(reqBody)
		require.NoError(t, err)

		req := httptest.NewRequest("POST", "/api/v1/posts/"+postIDStr+"/vote", bytes.NewBuffer(jsonBody))
		req.Header.Set("Content-Type", "application/json")

		// Set user_id in context
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = req
		c.Set("user_id", voter.ID)
		c.Params = gin.Params{{Key: "id", Value: postIDStr}}

		postsHandler.VotePost(c)
		require.Equal(t, http.StatusOK, w.Code)
	}

	// Wait for background goroutine to create notification
	notifRepo := models.NewNotificationRepository(db.Pool)
	var queryErr error
	require.Eventually(t, func() bool {
		var notifications []*models.Notification
		notifications, queryErr = notifRepo.GetByUserID(ctx, authorID, 10, 0, false)
		if queryErr != nil {
			return false
		}
		for _, notif := range notifications {
			if notif.NotificationType == "post_milestone" {
				return true
			}
		}
		return false
	}, 2*time.Second, 50*time.Millisecond, "expected milestone notification to be created")
	require.NoError(t, queryErr)

	// Check if notification was created
	req := httptest.NewRequest("GET", "/api/v1/notifications", nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", authorID)
	notificationsHandler := handlers.NewNotificationsHandler(notifRepo)
	notificationsHandler.GetNotifications(c)
	require.Equal(t, http.StatusOK, w.Code)

	var response struct {
		Notifications []models.Notification `json:"notifications"`
	}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	foundMilestone := false
	for _, notif := range response.Notifications {
		if notif.NotificationType == "post_milestone" {
			foundMilestone = true
			break
		}
	}
	assert.True(t, foundMilestone, "Should have milestone notification")
}

func TestEndToEndCommentReplyNotification(t *testing.T) {
	_, db, notifService, cleanup := setupNotificationIntegrationTest(t)
	defer cleanup()

	ctx := context.Background()
	authorID, replyAuthorID, _, postID := createIntegrationTestData(t, db)

	// Create parent comment
	commentRepo := models.NewPostCommentRepository(db.Pool)
	parentComment := &models.PostComment{
		PostID: postID,
		UserID: authorID,
		Body:   "Parent comment",
	}
	err := commentRepo.Create(ctx, parentComment)
	require.NoError(t, err)

	// Create reply
	reqBody := map[string]interface{}{
		"body":              "This is a reply",
		"parent_comment_id": parentComment.ID,
	}
	jsonBody, err := json.Marshal(reqBody)
	require.NoError(t, err)
	req := httptest.NewRequest("POST", "/api/v1/posts/"+strconv.Itoa(postID)+"/comments", bytes.NewBuffer(jsonBody))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("user_id", replyAuthorID)
	c.Params = gin.Params{{Key: "id", Value: strconv.Itoa(postID)}}

	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentsHandler := handlers.NewCommentsHandler(commentRepo, postRepo, nil)
	commentsHandler.SetNotificationService(notifService)
	commentsHandler.CreateComment(c)
	require.Equal(t, http.StatusCreated, w.Code)

	// Wait for background goroutine
	notifRepo := models.NewNotificationRepository(db.Pool)
	var replyMessage string
	var queryErr error
	require.Eventually(t, func() bool {
		var notifications []*models.Notification
		notifications, queryErr = notifRepo.GetByUserID(ctx, authorID, 10, 0, false)
		if queryErr != nil {
			return false
		}
		for _, notif := range notifications {
			if notif.NotificationType == "comment_reply" {
				replyMessage = notif.Message
				return true
			}
		}
		return false
	}, 2*time.Second, 50*time.Millisecond, "Should have comment reply notification")
	require.NoError(t, queryErr)
	assert.Contains(t, replyMessage, "replied to your comment")
}

func TestVelocityNotificationWithBatching(t *testing.T) {
	_, db, notifService, cleanup := setupNotificationIntegrationTest(t)
	defer cleanup()

	ctx := context.Background()
	authorID, _, _, postID := createIntegrationTestData(t, db)

	// Enable velocity notifications
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	settings, err := settingsRepo.GetByUserID(ctx, authorID)
	require.NoError(t, err)
	settings.NotifyPostVelocity = true
	_, err = settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	postRepo := models.NewPlatformPostRepository(db.Pool)
	userRepo := models.NewUserRepository(db.Pool)
	isUpvote := true
	for i := 0; i < 15; i++ {
		voter := &models.User{
			Username:     fmt.Sprintf("velocity_voter_%d", i),
			PasswordHash: "test_hash",
		}
		err := userRepo.Create(ctx, voter)
		require.NoError(t, err)

		err = postRepo.Vote(ctx, postID, voter.ID, &isUpvote)
		require.NoError(t, err)
	}

	post, err := postRepo.GetByID(ctx, postID)
	require.NoError(t, err)
	require.NotNil(t, post)

	// Trigger velocity check (>=5 votes/hour when considering last 3 hours)
	err = notifService.CheckAndNotifyVote(ctx, "post", postID, authorID, post.Upvotes)
	require.NoError(t, err)

	// Check if batch was created
	batchRepo := models.NewNotificationBatchRepository(db.Pool)
	batches, err := batchRepo.GetPendingBatches(ctx, time.Now().Add(20*time.Minute))
	require.NoError(t, err)
	require.NotEmpty(t, batches, "Expected velocity notification batch to be created")
	assert.Equal(t, authorID, batches[0].UserID)
	assert.Equal(t, "post", batches[0].ContentType)
}

func TestNotificationDisabledBySettings(t *testing.T) {
	_, db, notifService, cleanup := setupNotificationIntegrationTest(t)
	defer cleanup()

	ctx := context.Background()
	authorID, _, _, postID := createIntegrationTestData(t, db)

	// Disable milestone notifications
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	settings, err := settingsRepo.GetByUserID(ctx, authorID)
	require.NoError(t, err)
	settings.NotifyPostMilestone = false
	_, err = settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	// Try to trigger notification at milestone
	err = notifService.CheckAndNotifyVote(ctx, "post", postID, authorID, 10)
	require.NoError(t, err)

	// Verify no notification was created
	notifRepo := models.NewNotificationRepository(db.Pool)
	notifications, err := notifRepo.GetByUserID(ctx, authorID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifications, 0, "Should not create notification when disabled")
}
