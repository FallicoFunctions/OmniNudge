package services

import (
	"context"
	"fmt"
	"sync"
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
	t.Cleanup(db.Close)

	ctx := context.Background()
	err = db.Migrate(ctx)
	require.NoError(t, err)

	err = database.ResetTestData(ctx, db)
	require.NoError(t, err)

	notifRepo := models.NewNotificationRepository(db.Pool)
	baselineRepo := models.NewUserBaselineRepository(db.Pool)
	batchRepo := models.NewNotificationBatchRepository(db.Pool)
	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	postRepo := models.NewPlatformPostRepository(db.Pool)
	commentRepo := models.NewPostCommentRepository(db.Pool)
	tokenRepo := models.NewDeviceTokenRepository(db.Pool)
	hub := websocket.NewHub()

	service := NewNotificationService(
		db.Pool,
		notifRepo,
		baselineRepo,
		batchRepo,
		settingsRepo,
		postRepo,
		commentRepo,
		tokenRepo,
		nil, // firebase
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

func TestConversationMuteDetection(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	recipientID := createTestUser(t, db, uniqueNotificationName("muted_recipient"))
	senderID := createTestUser(t, db, uniqueNotificationName("muted_sender"))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, senderID, recipientID)
	require.NoError(t, err)

	assert.False(t, service.isConversationMutedForUser(ctx, conv.ID, recipientID))

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO conversation_notification_settings (conversation_id, user_id, muted)
		VALUES ($1, $2, TRUE)
	`, conv.ID, recipientID)
	require.NoError(t, err)

	assert.True(t, service.isConversationMutedForUser(ctx, conv.ID, recipientID))
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

func TestNotifyMessageEdited_CreatesNotificationForParticipant(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	editorID := createTestUser(t, db, uniqueNotificationName("editor"))
	recipientID := createTestUser(t, db, uniqueNotificationName("recipient"))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, editorID, recipientID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          editorID,
		RecipientID:       recipientID,
		EncryptedContent:  "ciphertext-before-edit",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, models.NewMessageRepository(db.Pool).Create(ctx, message))

	service.NotifyMessageEdited(ctx, message.ID, conv.ID, editorID, []int{editorID, recipientID})

	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, recipientID, 10, 0, false)
	require.NoError(t, err)
	require.Len(t, notifs, 1)
	assert.Equal(t, "message_edited", notifs[0].NotificationType)
	require.NotNil(t, notifs[0].ContentID)
	assert.Equal(t, message.ID, *notifs[0].ContentID)
	assert.Contains(t, notifs[0].Message, "edited a message")

	editorNotifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, editorID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, editorNotifs, 0)
}

func TestNotifyMessageEdited_DeduplicatesRapidEdits(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	editorID := createTestUser(t, db, uniqueNotificationName("editor"))
	recipientID := createTestUser(t, db, uniqueNotificationName("recipient"))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, editorID, recipientID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          editorID,
		RecipientID:       recipientID,
		EncryptedContent:  "ciphertext-before-edit",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, models.NewMessageRepository(db.Pool).Create(ctx, message))

	participants := []int{editorID, recipientID}
	service.NotifyMessageEdited(ctx, message.ID, conv.ID, editorID, participants)
	service.NotifyMessageEdited(ctx, message.ID, conv.ID, editorID, participants)

	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, recipientID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifs, 1)
}

func TestNotifyMessageEdited_DeduplicatesConcurrentBursts(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	editorID := createTestUser(t, db, uniqueNotificationName("editor"))
	recipientID := createTestUser(t, db, uniqueNotificationName("recipient"))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, editorID, recipientID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          editorID,
		RecipientID:       recipientID,
		EncryptedContent:  "ciphertext-before-edit",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, models.NewMessageRepository(db.Pool).Create(ctx, message))

	const goroutines = 8
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			service.NotifyMessageEdited(ctx, message.ID, conv.ID, editorID, []int{editorID, recipientID})
		}()
	}
	wg.Wait()

	var count int
	err = db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM notifications
		WHERE user_id = $1
		  AND notification_type = 'message_edited'
		  AND content_type = 'message'
		  AND content_id = $2
	`, recipientID, message.ID).Scan(&count)
	require.NoError(t, err)
	assert.Equal(t, 1, count)
}

func TestNotifyMessageEdited_SkipsMutedConversation(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	editorID := createTestUser(t, db, uniqueNotificationName("editor"))
	recipientID := createTestUser(t, db, uniqueNotificationName("recipient"))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, editorID, recipientID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO conversation_notification_settings (conversation_id, user_id, muted)
		VALUES ($1, $2, TRUE)
	`, conv.ID, recipientID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          editorID,
		RecipientID:       recipientID,
		EncryptedContent:  "ciphertext-before-edit",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, models.NewMessageRepository(db.Pool).Create(ctx, message))

	service.NotifyMessageEdited(ctx, message.ID, conv.ID, editorID, []int{editorID, recipientID})

	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, recipientID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifs, 0)
}

func TestNotifyThreadReply_CreatesAndDeduplicates(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	rootAuthorID := createTestUser(t, db, uniqueNotificationName("thread_root_author"))
	replyAuthorID := createTestUser(t, db, uniqueNotificationName("thread_reply_author"))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, rootAuthorID, replyAuthorID)
	require.NoError(t, err)

	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	rootSettings, _ := settingsRepo.GetByUserID(ctx, rootAuthorID)
	if rootSettings == nil {
		rootSettings, _ = settingsRepo.CreateDefault(ctx, rootAuthorID)
	}
	rootSettings.NotifyCommentReplies = true
	rootSettings.BatchNotifications = true
	_, err = settingsRepo.Update(ctx, rootSettings)
	require.NoError(t, err)

	msgRepo := models.NewMessageRepository(db.Pool)
	rootMessage := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          rootAuthorID,
		RecipientID:       replyAuthorID,
		EncryptedContent:  "root",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, msgRepo.Create(ctx, rootMessage))

	replyMessage1 := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          replyAuthorID,
		RecipientID:       rootAuthorID,
		EncryptedContent:  "reply-1",
		MessageType:       "text",
		ReplyTo:           &rootMessage.ID,
		ThreadRoot:        &rootMessage.ID,
		EncryptionVersion: "v1",
	}
	require.NoError(t, msgRepo.Create(ctx, replyMessage1))

	service.NotifyThreadReply(ctx, conv.ID, rootMessage.ID, replyMessage1.ID, replyAuthorID)

	replyMessage2 := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          replyAuthorID,
		RecipientID:       rootAuthorID,
		EncryptedContent:  "reply-2",
		MessageType:       "text",
		ReplyTo:           &rootMessage.ID,
		ThreadRoot:        &rootMessage.ID,
		EncryptionVersion: "v1",
	}
	require.NoError(t, msgRepo.Create(ctx, replyMessage2))
	service.NotifyThreadReply(ctx, conv.ID, rootMessage.ID, replyMessage2.ID, replyAuthorID)

	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, rootAuthorID, 10, 0, false)
	require.NoError(t, err)
	require.Len(t, notifs, 1)
	assert.Equal(t, "thread_reply", notifs[0].NotificationType)
	require.NotNil(t, notifs[0].ContentID)
	assert.Equal(t, rootMessage.ID, *notifs[0].ContentID)
	assert.Contains(t, notifs[0].Message, "replied to your thread")
}

func TestNotifyThreadReply_UsesSummaryMessageAfterFiveReplies(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	rootAuthorID := createTestUser(t, db, uniqueNotificationName("thread_root_author"))
	replyAuthorID := createTestUser(t, db, uniqueNotificationName("thread_reply_author"))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, rootAuthorID, replyAuthorID)
	require.NoError(t, err)

	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	rootSettings, _ := settingsRepo.GetByUserID(ctx, rootAuthorID)
	if rootSettings == nil {
		rootSettings, _ = settingsRepo.CreateDefault(ctx, rootAuthorID)
	}
	rootSettings.NotifyCommentReplies = true
	rootSettings.BatchNotifications = true
	_, err = settingsRepo.Update(ctx, rootSettings)
	require.NoError(t, err)

	msgRepo := models.NewMessageRepository(db.Pool)
	rootMessage := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          rootAuthorID,
		RecipientID:       replyAuthorID,
		EncryptedContent:  "root",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, msgRepo.Create(ctx, rootMessage))

	for i := 0; i < 5; i++ {
		reply := &models.Message{
			ConversationID:    conv.ID,
			SenderID:          replyAuthorID,
			RecipientID:       rootAuthorID,
			EncryptedContent:  fmt.Sprintf("reply-%d", i+1),
			MessageType:       "text",
			ReplyTo:           &rootMessage.ID,
			ThreadRoot:        &rootMessage.ID,
			EncryptionVersion: "v1",
		}
		require.NoError(t, msgRepo.Create(ctx, reply))
		service.NotifyThreadReply(ctx, conv.ID, rootMessage.ID, reply.ID, replyAuthorID)
	}

	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, rootAuthorID, 10, 0, false)
	require.NoError(t, err)
	require.Len(t, notifs, 1)
	assert.Equal(t, "thread_reply", notifs[0].NotificationType)
	assert.Equal(t, "5 new replies in thread", notifs[0].Message)
}

func TestNotifyThreadReply_DisabledBatchingCreatesOnePerReply(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	rootAuthorID := createTestUser(t, db, uniqueNotificationName("thread_root_author"))
	replyAuthorID := createTestUser(t, db, uniqueNotificationName("thread_reply_author"))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, rootAuthorID, replyAuthorID)
	require.NoError(t, err)

	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	rootSettings, _ := settingsRepo.GetByUserID(ctx, rootAuthorID)
	if rootSettings == nil {
		rootSettings, _ = settingsRepo.CreateDefault(ctx, rootAuthorID)
	}
	rootSettings.NotifyCommentReplies = true
	rootSettings.BatchNotifications = false
	_, err = settingsRepo.Update(ctx, rootSettings)
	require.NoError(t, err)

	msgRepo := models.NewMessageRepository(db.Pool)
	rootMessage := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          rootAuthorID,
		RecipientID:       replyAuthorID,
		EncryptedContent:  "root",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, msgRepo.Create(ctx, rootMessage))

	for i := 0; i < 2; i++ {
		reply := &models.Message{
			ConversationID:    conv.ID,
			SenderID:          replyAuthorID,
			RecipientID:       rootAuthorID,
			EncryptedContent:  fmt.Sprintf("reply-%d", i+1),
			MessageType:       "text",
			ReplyTo:           &rootMessage.ID,
			ThreadRoot:        &rootMessage.ID,
			EncryptionVersion: "v1",
		}
		require.NoError(t, msgRepo.Create(ctx, reply))
		service.NotifyThreadReply(ctx, conv.ID, rootMessage.ID, reply.ID, replyAuthorID)
	}

	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, rootAuthorID, 10, 0, false)
	require.NoError(t, err)
	require.Len(t, notifs, 2)
	assert.Equal(t, "thread_reply", notifs[0].NotificationType)
	assert.Equal(t, "thread_reply", notifs[1].NotificationType)
}

func TestNotifyThreadReply_SkipsMutedThread(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	rootAuthorID := createTestUser(t, db, uniqueNotificationName("thread_root_author"))
	replyAuthorID := createTestUser(t, db, uniqueNotificationName("thread_reply_author"))

	convRepo := models.NewConversationRepository(db.Pool)
	conv, err := convRepo.Create(ctx, rootAuthorID, replyAuthorID)
	require.NoError(t, err)

	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	rootSettings, _ := settingsRepo.GetByUserID(ctx, rootAuthorID)
	if rootSettings == nil {
		rootSettings, _ = settingsRepo.CreateDefault(ctx, rootAuthorID)
	}
	rootSettings.NotifyCommentReplies = true
	_, err = settingsRepo.Update(ctx, rootSettings)
	require.NoError(t, err)

	msgRepo := models.NewMessageRepository(db.Pool)
	rootMessage := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          rootAuthorID,
		RecipientID:       replyAuthorID,
		EncryptedContent:  "root",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, msgRepo.Create(ctx, rootMessage))

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO thread_notification_settings (thread_root_id, user_id, muted)
		VALUES ($1, $2, TRUE)
	`, rootMessage.ID, rootAuthorID)
	require.NoError(t, err)

	replyMessage := &models.Message{
		ConversationID:    conv.ID,
		SenderID:          replyAuthorID,
		RecipientID:       rootAuthorID,
		EncryptedContent:  "reply-1",
		MessageType:       "text",
		ReplyTo:           &rootMessage.ID,
		ThreadRoot:        &rootMessage.ID,
		EncryptionVersion: "v1",
	}
	require.NoError(t, msgRepo.Create(ctx, replyMessage))

	service.NotifyThreadReply(ctx, conv.ID, rootMessage.ID, replyMessage.ID, replyAuthorID)

	notifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, rootAuthorID, 10, 0, false)
	require.NoError(t, err)
	assert.Len(t, notifs, 0)
}

func TestNotifyThreadReply_IncludesModMailParticipantsWithoutThreadMessages(t *testing.T) {
	service, db, cleanup := setupNotificationTest(t)
	defer cleanup()

	ctx := context.Background()
	rootAuthorID := createTestUser(t, db, uniqueNotificationName("thread_root_author"))
	replyAuthorID := createTestUser(t, db, uniqueNotificationName("thread_reply_author"))
	lurkerID := createTestUser(t, db, uniqueNotificationName("thread_lurker"))

	var conversationID int
	err := db.Pool.QueryRow(ctx, `
		INSERT INTO conversations (conversation_type, status)
		VALUES ('mod_mail', 'open')
		RETURNING id
	`).Scan(&conversationID)
	require.NoError(t, err)

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO conversation_participants (conversation_id, user_id, is_moderator)
		VALUES
			($1, $2, true),
			($1, $3, true),
			($1, $4, true)
	`, conversationID, rootAuthorID, replyAuthorID, lurkerID)
	require.NoError(t, err)

	settingsRepo := models.NewUserSettingsRepository(db.Pool)
	for _, uid := range []int{rootAuthorID, lurkerID} {
		settings, _ := settingsRepo.GetByUserID(ctx, uid)
		if settings == nil {
			settings, _ = settingsRepo.CreateDefault(ctx, uid)
		}
		settings.NotifyCommentReplies = true
		_, err = settingsRepo.Update(ctx, settings)
		require.NoError(t, err)
	}

	msgRepo := models.NewMessageRepository(db.Pool)
	rootMessage := &models.Message{
		ConversationID:    conversationID,
		SenderID:          rootAuthorID,
		RecipientID:       rootAuthorID,
		EncryptedContent:  "mod-mail-root",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, msgRepo.Create(ctx, rootMessage))

	replyMessage := &models.Message{
		ConversationID:    conversationID,
		SenderID:          replyAuthorID,
		RecipientID:       replyAuthorID,
		EncryptedContent:  "mod-mail-reply",
		MessageType:       "text",
		ReplyTo:           &rootMessage.ID,
		ThreadRoot:        &rootMessage.ID,
		EncryptionVersion: "v1",
	}
	require.NoError(t, msgRepo.Create(ctx, replyMessage))

	service.NotifyThreadReply(ctx, conversationID, rootMessage.ID, replyMessage.ID, replyAuthorID)

	rootNotifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, rootAuthorID, 10, 0, false)
	require.NoError(t, err)
	require.Len(t, rootNotifs, 1)
	assert.Equal(t, "thread_reply", rootNotifs[0].NotificationType)

	lurkerNotifs, err := models.NewNotificationRepository(db.Pool).GetByUserID(ctx, lurkerID, 10, 0, false)
	require.NoError(t, err)
	require.Len(t, lurkerNotifs, 1)
	assert.Equal(t, "thread_reply", lurkerNotifs[0].NotificationType)
}

func TestIsWithinQuietHours(t *testing.T) {
	tz := "UTC"
	makeTime := func(hour, minute int) time.Time {
		return time.Date(2026, time.January, 1, hour, minute, 0, 0, time.UTC)
	}

	testCases := []struct {
		name         string
		now          time.Time
		startMinutes int
		endMinutes   int
		expected     bool
	}{
		{
			name:         "normal window inside",
			now:          makeTime(10, 0),
			startMinutes: 9 * 60,
			endMinutes:   17 * 60,
			expected:     true,
		},
		{
			name:         "normal window outside",
			now:          makeTime(18, 0),
			startMinutes: 9 * 60,
			endMinutes:   17 * 60,
			expected:     false,
		},
		{
			name:         "overnight window inside before midnight",
			now:          makeTime(23, 30),
			startMinutes: 22 * 60,
			endMinutes:   7 * 60,
			expected:     true,
		},
		{
			name:         "overnight window inside after midnight",
			now:          makeTime(6, 30),
			startMinutes: 22 * 60,
			endMinutes:   7 * 60,
			expected:     true,
		},
		{
			name:         "overnight window outside",
			now:          makeTime(12, 0),
			startMinutes: 22 * 60,
			endMinutes:   7 * 60,
			expected:     false,
		},
		{
			name:         "equal start end means no quiet hours",
			now:          makeTime(12, 0),
			startMinutes: 8 * 60,
			endMinutes:   8 * 60,
			expected:     false,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			actual := isWithinQuietHours(tc.now, tz, tc.startMinutes, tc.endMinutes)
			assert.Equal(t, tc.expected, actual)
		})
	}
}
