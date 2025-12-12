package services

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/omninudge/backend/internal/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	notificationTestSuffix  = time.Now().UnixNano()
	notificationTestCounter int64
)

func uniqueNotificationName(base string) string {
	id := atomic.AddInt64(&notificationTestCounter, 1)
	return fmt.Sprintf("%s_%d_%d", base, notificationTestSuffix, id)
}

func setupNotificationTest(t *testing.T) (*NotificationService, *database.Database, func()) {
	db, err := database.NewTest()
	require.NoError(t, err)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	notifRepo := models.NewNotificationRepository(db.Pool)
	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	batchRepo := models.NewNotificationBatchRepository(db.Pool)
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)
	hub := websocket.NewHub()

	service := NewNotificationService(
		db.Pool,
		notifRepo,
		baselineRepo,
		batchRepo,
		settingsRepo,
		postRepo,
		commentRepo,
		hub,
	)

	cleanup := func() {
		db.Close()
	}

	return service, db, cleanup
}

func createTestUser(t *testing.T, db *database.Database, username string) int {
	userRepo := models.NewUserRepository(db.Pool)
	user := &models.User{
		Username:     username,
		PasswordHash: "test_hash",
	}
	err := userRepo.Create(context.Background(), user)
	require.NoError(t, err)
	return user.ID
}

func createTestHub(t *testing.T, db *database.Database, name string, creatorID int) int {
	hubRepo := models.NewHubRepository(db.Pool)
	hub := &models.Hub{
		Name:      name,
		CreatedBy: &creatorID,
	}
	err := hubRepo.Create(context.Background(), hub)
	require.NoError(t, err)
	return hub.ID
}

func createTestPost(t *testing.T, db *database.Database, authorID, hubID int) int {
	postRepo := models.NewPlatformPostRepository(db.Pool)
	hubIDVal := hubID
	post := &models.PlatformPost{
		AuthorID: authorID,
		HubID:    &hubIDVal,
		Title:    "Test Post",
		Body:     strPtr("Test body"),
	}
	err := postRepo.Create(context.Background(), post)
	require.NoError(t, err)
	return post.ID
}

func createTestComment(t *testing.T, db *database.Database, postID, userID int, parentID *int) int {
	commentRepo := models.NewPostCommentRepository(db.Pool)
	comment := &models.PostComment{
		PostID:          postID,
		UserID:          userID,
		ParentCommentID: parentID,
		Body:            "Test comment",
	}
	err := commentRepo.Create(context.Background(), comment)
	require.NoError(t, err)
	return comment.ID
}

func strPtr(s string) *string {
	return &s
}

func TestMilestoneNotifications(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test users
	authorID := createTestUser(t, db, uniqueNotificationName("author"))
	creatorID := createTestUser(t, db, uniqueNotificationName("creator"))
	hubID := createTestHub(t, db, uniqueNotificationName("test_hub"), creatorID)
	postID := createTestPost(t, db, authorID, hubID)

	// Enable milestone notifications
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	settings, _ := settingsRepo.GetByUserID(ctx, authorID)
	if settings == nil {
		settings, _ = settingsRepo.CreateDefault(ctx, authorID)
	}
	settings.NotifyPostMilestone = true
	_, err := settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	// Test milestone notifications at 10 upvotes
	err = service.CheckAndNotifyVote(ctx, "post", postID, authorID, 10)
	require.NoError(t, err)

	// Verify notification was created
	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, authorID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifs, 1)
	assert.Equal(t, "post_milestone", notifs[0].NotificationType)
	assert.Contains(t, notifs[0].Message, "10 upvotes")

	// Test that duplicate milestone notification is not created
	err = service.CheckAndNotifyVote(ctx, "post", postID, authorID, 10)
	require.NoError(t, err)

	notifs, err = models.NewNotificationRepository(db.Pool).GetByUserID(ctx, authorID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifs, 1, "Should not create duplicate milestone notification")

	// Test next milestone at 50 upvotes
	err = service.CheckAndNotifyVote(ctx, "post", postID, authorID, 50)
	require.NoError(t, err)

	notifs, err = models.NewNotificationRepository(db.Pool).GetByUserID(ctx, authorID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifs, 2)
}

func TestCommentReplyNotification(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test users
	parentAuthorID := createTestUser(t, db, uniqueNotificationName("parent_author"))
	replyAuthorID := createTestUser(t, db, uniqueNotificationName("reply_author"))
	creatorID := createTestUser(t, db, uniqueNotificationName("creator"))
	hubID := createTestHub(t, db, uniqueNotificationName("test_hub"), creatorID)
	postID := createTestPost(t, db, parentAuthorID, hubID)

	// Create parent comment
	parentCommentID := createTestComment(t, db, postID, parentAuthorID, nil)

	// Enable reply notifications
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	settings, _ := settingsRepo.GetByUserID(ctx, parentAuthorID)
	if settings == nil {
		settings, _ = settingsRepo.CreateDefault(ctx, parentAuthorID)
	}
	settings.NotifyCommentReplies = true
	_, err := settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	// Create reply
	replyID := createTestComment(t, db, postID, replyAuthorID, &parentCommentID)

	// Trigger notification
	err = service.NotifyCommentReply(ctx, replyID, parentAuthorID, replyAuthorID)
	require.NoError(t, err)

	// Verify notification was created
	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, parentAuthorID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifs, 1)
	assert.Equal(t, "comment_reply", notifs[0].NotificationType)
	assert.Contains(t, notifs[0].Message, "replied to your comment")
}

func TestNotificationSettings(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test user with notifications disabled
	authorID := createTestUser(t, db, uniqueNotificationName("author"))
	creatorID := createTestUser(t, db, uniqueNotificationName("creator"))
	hubID := createTestHub(t, db, uniqueNotificationName("test_hub"), creatorID)
	postID := createTestPost(t, db, authorID, hubID)

	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	settings, _ := settingsRepo.GetByUserID(ctx, authorID)
	if settings == nil {
		settings, _ = settingsRepo.CreateDefault(ctx, authorID)
	}
	settings.NotifyPostMilestone = false // Disabled
	_, err := settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	// Try to create notification
	err = service.CheckAndNotifyVote(ctx, "post", postID, authorID, 10)
	require.NoError(t, err)

	// Verify no notification was created
	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, authorID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifs, 0, "Should not create notification when setting is disabled")
}

func TestBatchedNotifications(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test users
	authorID := createTestUser(t, db, uniqueNotificationName("author"))
	creatorID := createTestUser(t, db, uniqueNotificationName("creator"))
	hubID := createTestHub(t, db, uniqueNotificationName("test_hub"), creatorID)
	postID := createTestPost(t, db, authorID, hubID)

	// Enable velocity notifications
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	settings, _ := settingsRepo.GetByUserID(ctx, authorID)
	if settings == nil {
		settings, _ = settingsRepo.CreateDefault(ctx, authorID)
	}
	settings.NotifyPostVelocity = true
	_, err := settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	// Simulate votes that should trigger batching (not exponential)
	// For new users, 5 votes/hour triggers notification but should be batched
	err = service.CheckAndNotifyVote(ctx, "post", postID, authorID, 5)
	require.NoError(t, err)

	// Check if batch was created
	batchRepo := models.NewNotificationBatchRepository(db.Pool)
	batches, err := batchRepo.GetPendingBatches(ctx, time.Now().Add(20*time.Minute))
	require.NoError(t, err)

	// Should have created a batch for non-exponential growth
	if len(batches) > 0 {
		assert.Equal(t, authorID, batches[0].UserID)
		assert.Equal(t, "post", batches[0].ContentType)
	}
}

func TestSelfReplyNoNotification(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()

	// Create test user
	userID := createTestUser(t, db, uniqueNotificationName("user"))
	creatorID := createTestUser(t, db, uniqueNotificationName("creator"))
	hubID := createTestHub(t, db, uniqueNotificationName("test_hub"), creatorID)
	postID := createTestPost(t, db, userID, hubID)

	// Create parent comment
	parentCommentID := createTestComment(t, db, postID, userID, nil)

	// Enable reply notifications
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	settings, _ := settingsRepo.GetByUserID(ctx, userID)
	if settings == nil {
		settings, _ = settingsRepo.CreateDefault(ctx, userID)
	}
	settings.NotifyCommentReplies = true
	_, err := settingsRepo.Update(ctx, settings)
	require.NoError(t, err)

	// Create self-reply
	replyID := createTestComment(t, db, postID, userID, &parentCommentID)

	// Trigger notification (should not create one for self-reply)
	err = service.NotifyCommentReply(ctx, replyID, userID, userID)
	require.NoError(t, err)

	// Verify no notification was created
	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, userID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifs, 0, "Should not create notification for self-reply")
}
