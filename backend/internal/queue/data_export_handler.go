package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NewDataExportHandler creates a GDPR data export job handler
func NewDataExportHandler(db *pgxpool.Pool) JobHandler {
	return func(ctx context.Context, task *asynq.Task) error {
		var payload DataExportPayload
		if err := json.Unmarshal(task.Payload(), &payload); err != nil {
			return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
		}

		log.Printf("[DATA EXPORT] Starting export for user_id=%d export_id=%s types=%v",
			payload.UserID, payload.ExportID, payload.DataTypes)

		// Update status to processing
		_, err := db.Exec(ctx, `
			UPDATE data_export_requests
			SET status = 'processing'
			WHERE export_id = $1
		`, payload.ExportID)
		if err != nil {
			return fmt.Errorf("failed to update status: %w", err)
		}

		// Collect all requested data
		exportData := make(map[string]interface{})
		exportData["export_id"] = payload.ExportID
		exportData["user_id"] = payload.UserID
		exportData["exported_at"] = time.Now().Format(time.RFC3339)
		exportData["data_types"] = payload.DataTypes

		for _, dataType := range payload.DataTypes {
			var data interface{}
			var err error

			switch dataType {
			case "profile":
				data, err = exportProfileData(ctx, db, payload.UserID)
			case "messages":
				data, err = exportMessagesData(ctx, db, payload.UserID, payload.IncludeDeleted)
			case "posts":
				data, err = exportPostsData(ctx, db, payload.UserID, payload.IncludeDeleted)
			case "comments":
				data, err = exportCommentsData(ctx, db, payload.UserID, payload.IncludeDeleted)
			case "votes":
				data, err = exportVotesData(ctx, db, payload.UserID)
			case "saved":
				data, err = exportSavedData(ctx, db, payload.UserID)
			case "hubs":
				data, err = exportHubsData(ctx, db, payload.UserID)
			case "settings":
				data, err = exportSettingsData(ctx, db, payload.UserID)
			case "encryption_keys":
				data, err = exportEncryptionKeysData(ctx, db, payload.UserID)
			default:
				log.Printf("[DATA EXPORT] Unknown data type: %s", dataType)
				continue
			}

			if err != nil {
				log.Printf("[DATA EXPORT] Failed to export %s: %v", dataType, err)
				// Continue with other data types
				exportData[dataType] = map[string]string{"error": err.Error()}
			} else {
				exportData[dataType] = data
			}
		}

		// Convert to JSON
		jsonData, err := json.MarshalIndent(exportData, "", "  ")
		if err != nil {
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to marshal JSON: %v", err))
		}

		fileSize := int64(len(jsonData))

		// TODO: Upload to S3 and get download URL
		// For now, we'll just log the data size and mark as completed
		log.Printf("[DATA EXPORT] Export complete: user_id=%d export_id=%s size=%d bytes",
			payload.UserID, payload.ExportID, fileSize)

		// Update status to completed
		_, err = db.Exec(ctx, `
			UPDATE data_export_requests
			SET
				status = 'completed',
				completed_at = NOW(),
				file_size_bytes = $1,
				download_url = $2
			WHERE export_id = $3
		`, fileSize, fmt.Sprintf("TODO: S3 URL for export_%s.json", payload.ExportID), payload.ExportID)

		if err != nil {
			return fmt.Errorf("failed to update completion status: %w", err)
		}

		// TODO: Send email notification with download link

		return nil
	}
}

func updateExportFailed(ctx context.Context, db *pgxpool.Pool, exportID, errorMsg string) error {
	_, err := db.Exec(ctx, `
		UPDATE data_export_requests
		SET status = 'failed', completed_at = NOW(), error_message = $1
		WHERE export_id = $2
	`, errorMsg, exportID)
	return fmt.Errorf("%s: %w", errorMsg, err)
}

func exportProfileData(ctx context.Context, db *pgxpool.Pool, userID int) (interface{}, error) {
	var profile struct {
		ID        int       `json:"id"`
		Username  string    `json:"username"`
		Email     *string   `json:"email"`
		RedditID  *string   `json:"reddit_id"`
		Bio       *string   `json:"bio"`
		AvatarURL *string   `json:"avatar_url"`
		Role      string    `json:"role"`
		CreatedAt time.Time `json:"created_at"`
		LastSeen  time.Time `json:"last_seen"`
	}

	err := db.QueryRow(ctx, `
		SELECT id, username, email, reddit_id, bio, avatar_url, role, created_at, last_seen
		FROM users
		WHERE id = $1
	`, userID).Scan(
		&profile.ID, &profile.Username, &profile.Email, &profile.RedditID,
		&profile.Bio, &profile.AvatarURL, &profile.Role, &profile.CreatedAt, &profile.LastSeen,
	)

	return profile, err
}

func exportMessagesData(ctx context.Context, db *pgxpool.Pool, userID int, includeDeleted bool) (interface{}, error) {
	query := `
		SELECT id, sender_id, recipient_id, content_encrypted, created_at, deleted_at
		FROM messages
		WHERE (sender_id = $1 OR recipient_id = $1)
	`
	if !includeDeleted {
		query += " AND deleted_at IS NULL"
	}
	query += " ORDER BY created_at DESC LIMIT 10000"

	rows, err := db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type Message struct {
		ID              int        `json:"id"`
		SenderID        int        `json:"sender_id"`
		RecipientID     int        `json:"recipient_id"`
		ContentEncrypted string    `json:"content_encrypted"`
		CreatedAt       time.Time  `json:"created_at"`
		DeletedAt       *time.Time `json:"deleted_at,omitempty"`
	}

	messages := []Message{}
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.SenderID, &msg.RecipientID, &msg.ContentEncrypted, &msg.CreatedAt, &msg.DeletedAt); err != nil {
			continue
		}
		messages = append(messages, msg)
	}

	return map[string]interface{}{
		"total":    len(messages),
		"messages": messages,
	}, nil
}

func exportPostsData(ctx context.Context, db *pgxpool.Pool, userID int, includeDeleted bool) (interface{}, error) {
	query := `
		SELECT id, title, content, created_at, deleted_at
		FROM platform_posts
		WHERE user_id = $1
	`
	if !includeDeleted {
		query += " AND deleted_at IS NULL"
	}
	query += " ORDER BY created_at DESC LIMIT 10000"

	rows, err := db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type Post struct {
		ID        int        `json:"id"`
		Title     string     `json:"title"`
		Content   *string    `json:"content"`
		CreatedAt time.Time  `json:"created_at"`
		DeletedAt *time.Time `json:"deleted_at,omitempty"`
	}

	posts := []Post{}
	for rows.Next() {
		var post Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Content, &post.CreatedAt, &post.DeletedAt); err != nil {
			continue
		}
		posts = append(posts, post)
	}

	return map[string]interface{}{
		"total": len(posts),
		"posts": posts,
	}, nil
}

func exportCommentsData(ctx context.Context, db *pgxpool.Pool, userID int, includeDeleted bool) (interface{}, error) {
	query := `
		SELECT id, post_id, content, created_at, deleted_at
		FROM post_comments
		WHERE user_id = $1
	`
	if !includeDeleted {
		query += " AND deleted_at IS NULL"
	}
	query += " ORDER BY created_at DESC LIMIT 10000"

	rows, err := db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type Comment struct {
		ID        int        `json:"id"`
		PostID    int        `json:"post_id"`
		Content   string     `json:"content"`
		CreatedAt time.Time  `json:"created_at"`
		DeletedAt *time.Time `json:"deleted_at,omitempty"`
	}

	comments := []Comment{}
	for rows.Next() {
		var comment Comment
		if err := rows.Scan(&comment.ID, &comment.PostID, &comment.Content, &comment.CreatedAt, &comment.DeletedAt); err != nil {
			continue
		}
		comments = append(comments, comment)
	}

	return map[string]interface{}{
		"total":    len(comments),
		"comments": comments,
	}, nil
}

func exportVotesData(ctx context.Context, db *pgxpool.Pool, userID int) (interface{}, error) {
	// Post votes
	postVotes, err := db.Query(ctx, `
		SELECT post_id, vote_type, created_at
		FROM post_votes
		WHERE user_id = $1
		ORDER BY created_at DESC LIMIT 10000
	`, userID)
	if err != nil {
		return nil, err
	}
	defer postVotes.Close()

	type PostVote struct {
		PostID    int       `json:"post_id"`
		VoteType  int       `json:"vote_type"`
		CreatedAt time.Time `json:"created_at"`
	}

	pVotes := []PostVote{}
	for postVotes.Next() {
		var vote PostVote
		if err := postVotes.Scan(&vote.PostID, &vote.VoteType, &vote.CreatedAt); err != nil {
			continue
		}
		pVotes = append(pVotes, vote)
	}

	// Comment votes
	commentVotes, err := db.Query(ctx, `
		SELECT comment_id, vote_type, created_at
		FROM comment_votes
		WHERE user_id = $1
		ORDER BY created_at DESC LIMIT 10000
	`, userID)
	if err != nil {
		return nil, err
	}
	defer commentVotes.Close()

	type CommentVote struct {
		CommentID int       `json:"comment_id"`
		VoteType  int       `json:"vote_type"`
		CreatedAt time.Time `json:"created_at"`
	}

	cVotes := []CommentVote{}
	for commentVotes.Next() {
		var vote CommentVote
		if err := commentVotes.Scan(&vote.CommentID, &vote.VoteType, &vote.CreatedAt); err != nil {
			continue
		}
		cVotes = append(cVotes, vote)
	}

	return map[string]interface{}{
		"post_votes":    pVotes,
		"comment_votes": cVotes,
	}, nil
}

func exportSavedData(ctx context.Context, db *pgxpool.Pool, userID int) (interface{}, error) {
	// Saved posts
	savedPosts, err := db.Query(ctx, `
		SELECT post_id, saved_at
		FROM saved_posts
		WHERE user_id = $1
		ORDER BY saved_at DESC LIMIT 10000
	`, userID)
	if err != nil {
		return nil, err
	}
	defer savedPosts.Close()

	type SavedPost struct {
		PostID  int       `json:"post_id"`
		SavedAt time.Time `json:"saved_at"`
	}

	sPosts := []SavedPost{}
	for savedPosts.Next() {
		var saved SavedPost
		if err := savedPosts.Scan(&saved.PostID, &saved.SavedAt); err != nil {
			continue
		}
		sPosts = append(sPosts, saved)
	}

	return map[string]interface{}{
		"saved_posts": sPosts,
	}, nil
}

func exportHubsData(ctx context.Context, db *pgxpool.Pool, userID int) (interface{}, error) {
	// Hub subscriptions
	subs, err := db.Query(ctx, `
		SELECT hub_id, subscribed_at
		FROM hub_subscriptions
		WHERE user_id = $1
		ORDER BY subscribed_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer subs.Close()

	type HubSubscription struct {
		HubID        int       `json:"hub_id"`
		SubscribedAt time.Time `json:"subscribed_at"`
	}

	subscriptions := []HubSubscription{}
	for subs.Next() {
		var sub HubSubscription
		if err := subs.Scan(&sub.HubID, &sub.SubscribedAt); err != nil {
			continue
		}
		subscriptions = append(subscriptions, sub)
	}

	// Hubs created by user
	hubs, err := db.Query(ctx, `
		SELECT id, name, description, created_at
		FROM hubs
		WHERE creator_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer hubs.Close()

	type Hub struct {
		ID          int       `json:"id"`
		Name        string    `json:"name"`
		Description *string   `json:"description"`
		CreatedAt   time.Time `json:"created_at"`
	}

	createdHubs := []Hub{}
	for hubs.Next() {
		var hub Hub
		if err := hubs.Scan(&hub.ID, &hub.Name, &hub.Description, &hub.CreatedAt); err != nil {
			continue
		}
		createdHubs = append(createdHubs, hub)
	}

	return map[string]interface{}{
		"subscriptions": subscriptions,
		"created_hubs":  createdHubs,
	}, nil
}

func exportSettingsData(ctx context.Context, db *pgxpool.Pool, userID int) (interface{}, error) {
	var settings struct {
		ThemePreference      *string `json:"theme_preference"`
		NotificationsEnabled bool    `json:"notifications_enabled"`
		EmailNotifications   bool    `json:"email_notifications"`
	}

	err := db.QueryRow(ctx, `
		SELECT theme_preference, notifications_enabled, email_notifications
		FROM user_settings
		WHERE user_id = $1
	`, userID).Scan(&settings.ThemePreference, &settings.NotificationsEnabled, &settings.EmailNotifications)

	if err != nil {
		return nil, err
	}

	return settings, nil
}

func exportEncryptionKeysData(ctx context.Context, db *pgxpool.Pool, userID int) (interface{}, error) {
	var keys struct {
		PublicKey            *string `json:"public_key"`
		EncryptedPrivateKey  *string `json:"encrypted_private_key"`
		Note                 string  `json:"note"`
	}

	err := db.QueryRow(ctx, `
		SELECT public_key, encrypted_private_key
		FROM users
		WHERE id = $1
	`, userID).Scan(&keys.PublicKey, &keys.EncryptedPrivateKey)

	if err != nil {
		return nil, err
	}

	keys.Note = "These are your E2E encryption keys. Private key is encrypted with your password."

	return keys, nil
}
