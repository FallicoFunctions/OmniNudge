package queue

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	zlog "github.com/rs/zerolog/log"

	"github.com/omninudge/backend/internal/services"
	"github.com/omninudge/backend/internal/utils"
)

// NewDataExportHandler creates a GDPR data export job handler
func NewDataExportHandler(db *pgxpool.Pool, storage services.StorageService, masterKey string, email *services.EmailService) JobHandler {
	return func(ctx context.Context, task *asynq.Task) error {
		var payload DataExportPayload
		if err := json.Unmarshal(task.Payload(), &payload); err != nil {
			return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
		}
		if payload.ExportID == "" {
			return fmt.Errorf("data export payload is missing export_id: %w", asynq.SkipRetry)
		}

		// Redis is a delivery mechanism, not an authorization source. Resolve all
		// sensitive fields from the server-created request row.
		if err := db.QueryRow(ctx, `
			SELECT user_id, data_types, include_deleted
			FROM data_export_requests
			WHERE export_id = $1
			  AND status IN ('pending', 'processing')
			  AND expires_at > NOW()
		`, payload.ExportID).Scan(&payload.UserID, &payload.DataTypes, &payload.IncludeDeleted); err != nil {
			return fmt.Errorf("data export request is unavailable: %v: %w", err, asynq.SkipRetry)
		}

		zlog.Info().Int("user_id", payload.UserID).Str("export_id", payload.ExportID).Strs("types", payload.DataTypes).Msg("data_export: starting")

		// Update status to processing
		_, err := db.Exec(ctx, `
			UPDATE data_export_requests
			SET status = 'processing'
			WHERE export_id = $1 AND user_id = $2
		`, payload.ExportID, payload.UserID)
		if err != nil {
			return fmt.Errorf("failed to update status: %w", err)
		}

		// Create temporary directory for export
		tempDir, err := os.MkdirTemp("", "omninudge-export-*")
		if err != nil {
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to create temp dir: %v", err))
		}
		defer os.RemoveAll(tempDir)

		// 1. Fetch encrypted session keys for E2E decryption
		// Map conversation_id -> list of keys (historic and current)
		sessionKeys := make(map[int][][]byte)
		rows, err := db.Query(ctx, `
			SELECT gek.conversation_id, esk.encrypted_key
			FROM export_session_keys esk
			JOIN group_encryption_keys gek ON esk.group_key_id = gek.id
			WHERE esk.export_id = $1 AND esk.user_id = $2
		`, payload.ExportID, payload.UserID)
		if err != nil {
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to load export keys: %v", err))
		}
		for rows.Next() {
			var convID int
			var encryptedKey string
			if err := rows.Scan(&convID, &encryptedKey); err != nil {
				rows.Close()
				return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to read export key: %v", err))
			}
			// Decrypt session key using the system master key. A partial key set
			// would produce an apparently successful but unreadable user export.
			rawKey, err := utils.DecryptWithSystemKey(encryptedKey, []byte(masterKey))
			if err != nil {
				rows.Close()
				return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to decrypt export key: %v", err))
			}
			sessionKeys[convID] = append(sessionKeys[convID], []byte(rawKey))
		}
		if rowsErr := rows.Err(); rowsErr != nil {
			rows.Close()
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to read export keys: %v", rowsErr))
		}
		rows.Close()

		// 2. Export each data type to its own JSON file
		for _, dataType := range payload.DataTypes {
			var data interface{}
			var err error

			switch dataType {
			case "profile":
				data, err = exportProfileData(ctx, db, payload.UserID)
			case "messages":
				data, err = exportMessagesData(ctx, db, payload.UserID, payload.IncludeDeleted, sessionKeys)
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
				return updateExportFailed(ctx, db, payload.ExportID, "Export request contains an unsupported data type")
			}

			if err != nil {
				zlog.Warn().Err(err).Str("data_type", dataType).Str("export_id", payload.ExportID).Msg("data_export: failed to export data type")
				data = map[string]string{"error": "data unavailable"}
			}

			// Save to JSON file
			filePath := filepath.Join(tempDir, dataType+".json")
			file, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
			if err != nil {
				return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to create export file: %v", err))
			}

			encoder := json.NewEncoder(file)
			encoder.SetIndent("", "  ")
			if err := encoder.Encode(data); err != nil {
				_ = file.Close()
				return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to encode export data: %v", err))
			}
			if err := file.Close(); err != nil {
				return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to close export file: %v", err))
			}
		}

		// 3. Create ZIP archive
		zipFile, err := os.CreateTemp("", "omninudge-export-*.zip")
		if err != nil {
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to create ZIP: %v", err))
		}
		zipPath := zipFile.Name()
		defer os.Remove(zipPath)

		zipWriter := zip.NewWriter(zipFile)
		files, err := os.ReadDir(tempDir)
		if err != nil {
			_ = zipWriter.Close()
			_ = zipFile.Close()
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to read export files: %v", err))
		}
		for _, f := range files {
			fPath := filepath.Join(tempDir, f.Name())
			fileToZip, err := os.Open(fPath)
			if err != nil {
				_ = zipWriter.Close()
				_ = zipFile.Close()
				return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to read export file: %v", err))
			}

			w, err := zipWriter.Create(f.Name())
			if err != nil {
				_ = fileToZip.Close()
				_ = zipWriter.Close()
				_ = zipFile.Close()
				return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to add ZIP entry: %v", err))
			}

			if _, err := io.Copy(w, fileToZip); err != nil {
				_ = fileToZip.Close()
				_ = zipWriter.Close()
				_ = zipFile.Close()
				return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to write ZIP entry: %v", err))
			}
			if err := fileToZip.Close(); err != nil {
				_ = zipWriter.Close()
				_ = zipFile.Close()
				return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to close export source: %v", err))
			}
		}
		if err := zipWriter.Close(); err != nil {
			_ = zipFile.Close()
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to finalize ZIP: %v", err))
		}
		if err := zipFile.Close(); err != nil {
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to close ZIP: %v", err))
		}

		// 4. Upload to storage
		finalZip, err := os.Open(zipPath)
		if err != nil {
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to open ZIP for upload: %v", err))
		}
		defer finalZip.Close()

		fileInfo, err := os.Stat(zipPath)
		if err != nil {
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to stat ZIP: %v", err))
		}
		fileSize := fileInfo.Size()

		storageKey := fmt.Sprintf("exports/%d/%s.zip", payload.UserID, payload.ExportID)
		if _, err := storage.Upload(ctx, storageKey, finalZip, "application/zip"); err != nil {
			return updateExportFailed(ctx, db, payload.ExportID, fmt.Sprintf("Failed to upload to storage: %v", err))
		}

		// 5. Update status to completed
		_, err = db.Exec(ctx, `
			UPDATE data_export_requests
			SET
				status = 'completed',
				completed_at = NOW(),
				file_size_bytes = $1
			WHERE export_id = $2
		`, fileSize, payload.ExportID)

		if err != nil {
			return fmt.Errorf("failed to update completion status: %w", err)
		}

		// 6. Purge temporary session keys.
		// Use a fresh context with a deadline — the job context may already be
		// cancelled, but session keys must always be cleaned up regardless.
		purgeCtx, purgeCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer purgeCancel()
		if _, purgeErr := db.Exec(purgeCtx, `
			DELETE FROM export_session_keys WHERE export_id = $1
		`, payload.ExportID); purgeErr != nil {
			zlog.Warn().Err(purgeErr).Str("export_id", payload.ExportID).Msg("data_export: failed to purge session keys")
		}

		// 7. Send email notification
		var storedEmail *string
		var emailEncrypted bool
		var userEmail string
		if err := db.QueryRow(ctx, "SELECT email, email_encrypted FROM users WHERE id = $1", payload.UserID).Scan(&storedEmail, &emailEncrypted); err == nil && storedEmail != nil {
			if emailEncrypted {
				if decrypted, decryptErr := utils.DecryptEmail(*storedEmail); decryptErr == nil {
					userEmail = decrypted
				}
			} else {
				userEmail = *storedEmail
			}
		}

		if userEmail != "" && email != nil {
			subject := "Your OmniNudge Data Export is Ready"
			body := fmt.Sprintf("Your data export request (%s) is complete.\nLog in to OmniNudge to download it from your account exports page.\n\nThe export will expire in 7 days.",
				payload.ExportID)

			_ = email.SendEmail([]string{userEmail}, subject, body, "")
		}

		zlog.Info().Int("user_id", payload.UserID).Str("export_id", payload.ExportID).Int64("size_bytes", fileSize).Msg("data_export: export complete")

		return nil
	}
}

func updateExportFailed(ctx context.Context, db *pgxpool.Pool, exportID, errorMsg string) error {
	_, dbErr := db.Exec(ctx, `
		UPDATE data_export_requests
		SET status = 'failed', completed_at = NOW(), error_message = $1
		WHERE export_id = $2
	`, errorMsg, exportID)
	if dbErr != nil {
		return fmt.Errorf("%s (also failed to update DB: %w)", errorMsg, dbErr)
	}
	return fmt.Errorf("%s", errorMsg)
}

func exportProfileData(ctx context.Context, db *pgxpool.Pool, userID int) (interface{}, error) {
	var profile struct {
		ID        int       `json:"id"`
		Username  string    `json:"username"`
		Email     *string   `json:"email"`
		Bio       *string   `json:"bio"`
		AvatarURL *string   `json:"avatar_url"`
		Role      string    `json:"role"`
		CreatedAt time.Time `json:"created_at"`
		LastSeen  time.Time `json:"last_seen"`
	}
	var storedEmail *string
	var emailEncrypted bool

	err := db.QueryRow(ctx, `
		SELECT id, username, email, email_encrypted, bio, avatar_url, role, created_at, last_seen
		FROM users
		WHERE id = $1
	`, userID).Scan(
		&profile.ID, &profile.Username, &storedEmail, &emailEncrypted,
		&profile.Bio, &profile.AvatarURL, &profile.Role, &profile.CreatedAt, &profile.LastSeen,
	)
	if err != nil {
		return profile, err
	}
	if storedEmail != nil {
		if emailEncrypted {
			decrypted, decryptErr := utils.DecryptEmail(*storedEmail)
			if decryptErr != nil {
				return profile, decryptErr
			}
			profile.Email = &decrypted
		} else {
			profile.Email = storedEmail
		}
	}

	return profile, nil
}

func exportMessagesData(ctx context.Context, db *pgxpool.Pool, userID int, includeDeleted bool, conversationKeys map[int][][]byte) (interface{}, error) {
	query := `
		SELECT id, conversation_id, sender_id, recipient_id, encrypted_content, 
		       sender_encrypted_content, shared_encryption_iv, created_at, deleted_for_sender, deleted_for_recipient
		FROM messages
		WHERE (sender_id = $1 OR recipient_id = $1)
	`
	if !includeDeleted {
		query += " AND (CASE WHEN sender_id = $1 THEN NOT deleted_for_sender ELSE NOT deleted_for_recipient END)"
	}
	query += " ORDER BY created_at DESC LIMIT 50000"

	rows, err := db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type Message struct {
		ID               int       `json:"id"`
		ConversationID   int       `json:"conversation_id"`
		SenderID         int       `json:"sender_id"`
		RecipientID      int       `json:"recipient_id"`
		Content          string    `json:"content"`
		ContentEncrypted string    `json:"content_encrypted_base64"`
		CreatedAt        time.Time `json:"created_at"`
	}

	messages := []Message{}
	for rows.Next() {
		var msg Message
		var encryptedContent, senderEncryptedContent, sharedIV string
		var deletedSender, deletedRecipient bool

		if err := rows.Scan(
			&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.RecipientID,
			&encryptedContent, &senderEncryptedContent, &sharedIV,
			&msg.CreatedAt, &deletedSender, &deletedRecipient,
		); err != nil {
			continue
		}

		msg.ContentEncrypted = encryptedContent
		if msg.SenderID == userID {
			msg.ContentEncrypted = senderEncryptedContent
		}

		// Try to decrypt if we have session keys
		decrypted := false
		if keys, ok := conversationKeys[msg.ConversationID]; ok {
			// Try all keys for this conversation (solving historic key decryption)
			for _, key := range keys {
				plaintext, err := utils.DecryptAESGCM(msg.ContentEncrypted, key, sharedIV)
				if err == nil {
					msg.Content = plaintext
					decrypted = true
					break // Stop on first successful decryption
				}
			}
		}

		if !decrypted {
			msg.Content = "[Encrypted Content - Key Unavailable]"
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
		PublicKey           *string `json:"public_key"`
		EncryptedPrivateKey *string `json:"encrypted_private_key"`
		Note                string  `json:"note"`
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
