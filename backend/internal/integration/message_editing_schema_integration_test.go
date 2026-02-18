package integration

import (
	"context"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestMessageEditingSchema_RetentionAndCascade(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "edit_schema_sender", "user")
	recipient := createUser(t, deps.UserRepo, "edit_schema_recipient", "user")

	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          sender.ID,
		RecipientID:       recipient.ID,
		EncryptedContent:  "initial-encrypted-content",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), message))

	// Seed a stale edit history row older than retention policy.
	_, err = deps.DB.Pool.Exec(context.Background(), `
		INSERT INTO message_edit_history (message_id, content, encrypted_content, edited_at, edited_by)
		VALUES ($1, $2, $3, $4, $5)
	`, message.ID, "old", "old-encrypted", time.Now().UTC().Add(-31*24*time.Hour), sender.ID)
	require.NoError(t, err)

	// Insert a new edit entry; trigger should clean stale rows first.
	_, err = deps.DB.Pool.Exec(context.Background(), `
		INSERT INTO message_edit_history (message_id, content, encrypted_content, edited_by)
		VALUES ($1, $2, $3, $4)
	`, message.ID, "new", "new-encrypted", sender.ID)
	require.NoError(t, err)

	var staleCount int
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT COUNT(*)
		FROM message_edit_history
		WHERE edited_at < now() - interval '30 days'
	`).Scan(&staleCount)
	require.NoError(t, err)
	require.Equal(t, 0, staleCount, "retention trigger should remove stale edit rows")

	var historyCount int
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT COUNT(*)
		FROM message_edit_history
		WHERE message_id = $1
	`, message.ID).Scan(&historyCount)
	require.NoError(t, err)
	require.Equal(t, 1, historyCount, "new history row should remain")

	// Verify ON DELETE CASCADE from messages.
	_, err = deps.DB.Pool.Exec(context.Background(), `DELETE FROM messages WHERE id = $1`, message.ID)
	require.NoError(t, err)

	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT COUNT(*)
		FROM message_edit_history
		WHERE message_id = $1
	`, message.ID).Scan(&historyCount)
	require.NoError(t, err)
	require.Equal(t, 0, historyCount, "edit history should be deleted when message is deleted")
}
