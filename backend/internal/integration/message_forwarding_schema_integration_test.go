//go:build integration

package integration

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestMessageForwardingSchema_DefaultsAndReferentialBehavior(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()

	sender := createUser(t, deps.UserRepo, "forward_schema_sender", "user")
	recipient := createUser(t, deps.UserRepo, "forward_schema_recipient", "user")
	conversation, err := deps.ConversationRepo.Create(context.Background(), sender.ID, recipient.ID)
	require.NoError(t, err)

	original := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          sender.ID,
		RecipientID:       recipient.ID,
		EncryptedContent:  "original-forwardable-content",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(context.Background(), original))

	var originalForwardCount int
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT forward_count
		FROM messages
		WHERE id = $1
	`, original.ID).Scan(&originalForwardCount)
	require.NoError(t, err)
	require.Equal(t, 0, originalForwardCount)

	var forwardedID int
	err = deps.DB.Pool.QueryRow(context.Background(), `
		INSERT INTO messages (
			conversation_id, sender_id, recipient_id, encrypted_content, message_type, encryption_version, forwarded_from
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, conversation.ID, sender.ID, recipient.ID, "forwarded-copy-content", "text", "v1", original.ID).Scan(&forwardedID)
	require.NoError(t, err)

	_, err = deps.DB.Pool.Exec(context.Background(), `
		UPDATE messages
		SET forward_count = forward_count + 1
		WHERE id = $1
	`, original.ID)
	require.NoError(t, err)

	_, err = deps.DB.Pool.Exec(context.Background(), `
		UPDATE messages
		SET forward_count = -1
		WHERE id = $1
	`, original.ID)
	require.Error(t, err, "forward_count must reject negative values")

	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT forward_count
		FROM messages
		WHERE id = $1
	`, original.ID).Scan(&originalForwardCount)
	require.NoError(t, err)
	require.Equal(t, 1, originalForwardCount)

	_, err = deps.DB.Pool.Exec(context.Background(), `DELETE FROM messages WHERE id = $1`, original.ID)
	require.NoError(t, err)

	var forwardedFrom *int
	err = deps.DB.Pool.QueryRow(context.Background(), `
		SELECT forwarded_from
		FROM messages
		WHERE id = $1
	`, forwardedID).Scan(&forwardedFrom)
	require.NoError(t, err)
	require.Nil(t, forwardedFrom)
}
