//go:build integration

package integration

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestThreadingSchema_HardDeleteParent_PreservesTombstoneForChildren(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()
	ctx := context.Background()

	user1 := createUser(t, deps.UserRepo, uniqueMessagingUsername("thread_parent"), "user")
	user2 := createUser(t, deps.UserRepo, uniqueMessagingUsername("thread_child"), "user")

	conversation, err := deps.ConversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	parent := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user1.ID,
		RecipientID:       user2.ID,
		EncryptedContent:  "enc_parent",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(ctx, parent))

	child := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "enc_child",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(ctx, child))

	_, err = deps.DB.Pool.Exec(ctx, `
		UPDATE messages
		SET reply_to = $2,
		    thread_root = $2
		WHERE id = $1
	`, child.ID, parent.ID)
	require.NoError(t, err)

	require.NoError(t, deps.MessageRepo.SoftDeleteForBoth(ctx, parent.ID))
	require.NoError(t, deps.MessageRepo.HardDelete(ctx, parent.ID))

	tombstone, err := deps.MessageRepo.GetByID(ctx, parent.ID)
	require.NoError(t, err)
	require.NotNil(t, tombstone)
	require.Equal(t, "[deleted]", tombstone.EncryptedContent)

	var replyTo, threadRoot sql.NullInt32
	err = deps.DB.Pool.QueryRow(ctx, `
		SELECT reply_to, thread_root
		FROM messages
		WHERE id = $1
	`, child.ID).Scan(&replyTo, &threadRoot)
	require.NoError(t, err)
	require.True(t, replyTo.Valid, "reply_to should continue pointing at the preserved tombstone")
	require.True(t, threadRoot.Valid, "thread_root should continue pointing at the preserved tombstone")
	require.Equal(t, int32(parent.ID), replyTo.Int32)
	require.Equal(t, int32(parent.ID), threadRoot.Int32)
}

func TestThreadingSchema_HardDeleteMessagesBySender_SetsReferencesNull(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()
	ctx := context.Background()

	user1 := createUser(t, deps.UserRepo, uniqueMessagingUsername("thread_sender"), "user")
	user2 := createUser(t, deps.UserRepo, uniqueMessagingUsername("thread_recipient"), "user")

	conversation, err := deps.ConversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	parent := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user1.ID,
		RecipientID:       user2.ID,
		EncryptedContent:  "enc_parent_2",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(ctx, parent))

	child := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user2.ID,
		RecipientID:       user1.ID,
		EncryptedContent:  "enc_child_2",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(ctx, child))

	_, err = deps.DB.Pool.Exec(ctx, `
		UPDATE messages
		SET reply_to = $2,
		    thread_root = $2
		WHERE id = $1
	`, child.ID, parent.ID)
	require.NoError(t, err)

	require.NoError(t, deps.ConversationRepo.HardDeleteMessages(ctx, conversation.ID, user1.ID))

	var replyTo, threadRoot sql.NullInt32
	err = deps.DB.Pool.QueryRow(ctx, `
		SELECT reply_to, thread_root
		FROM messages
		WHERE id = $1
	`, child.ID).Scan(&replyTo, &threadRoot)
	require.NoError(t, err)
	require.False(t, replyTo.Valid, "reply_to should be NULL after sender hard delete")
	require.False(t, threadRoot.Valid, "thread_root should be NULL after sender hard delete")
}

func TestThreadingSchema_RejectsPartialThreadingState(t *testing.T) {
	deps := newTestDeps(t)
	defer deps.DB.Close()
	ctx := context.Background()

	user1 := createUser(t, deps.UserRepo, uniqueMessagingUsername("thread_partial_1"), "user")
	user2 := createUser(t, deps.UserRepo, uniqueMessagingUsername("thread_partial_2"), "user")

	conversation, err := deps.ConversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	message := &models.Message{
		ConversationID:    conversation.ID,
		SenderID:          user1.ID,
		RecipientID:       user2.ID,
		EncryptedContent:  "enc_partial",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}
	require.NoError(t, deps.MessageRepo.Create(ctx, message))

	_, err = deps.DB.Pool.Exec(ctx, `
		UPDATE messages
		SET thread_root = $2
		WHERE id = $1
	`, message.ID, message.ID)
	require.Error(t, err)
	require.True(t, strings.Contains(err.Error(), "messages_threading_consistency"), err.Error())
}
