package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/domain"
	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresMessageRepository_Create(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("msg_u1")
	u2 := fx.CreateUniqueUser("msg_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)

	msg := &domain.Message{
		ConversationID:    conv.ID,
		SenderID:          u1.ID,
		RecipientID:       u2.ID,
		EncryptedContent:  "hello",
		MessageType:       "text",
		EncryptionVersion: "v1",
	}

	err := repo.Create(ctx, msg)
	require.NoError(t, err)
	assert.NotZero(t, msg.ID)
}

func TestPostgresMessageRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("mgbyid_u1")
	u2 := fx.CreateUniqueUser("mgbyid_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	msg := fx.CreateMessage(conv.ID, u1.ID, u2.ID, "test content")

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing message", msg.ID, false},
		{"non-existent message", 999999, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByID(ctx, tc.id)
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NotNil(t, got)
				assert.Equal(t, msg.ID, got.ID)
			}
		})
	}
}

func TestPostgresMessageRepository_GetByConversationID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("mconv_u1")
	u2 := fx.CreateUniqueUser("mconv_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	msg1 := fx.CreateMessage(conv.ID, u1.ID, u2.ID, "first")
	msg2 := fx.CreateMessage(conv.ID, u2.ID, u1.ID, "second")

	msgs, err := repo.GetByConversationID(ctx, conv.ID, u1.ID, 10, 0)
	require.NoError(t, err)
	ids := make([]int, len(msgs))
	for i, m := range msgs {
		ids[i] = m.ID
	}
	assert.Contains(t, ids, msg1.ID)
	assert.Contains(t, ids, msg2.ID)
}

func TestPostgresMessageRepository_MarkAsRead(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("mread_u1")
	u2 := fx.CreateUniqueUser("mread_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	msg := fx.CreateMessage(conv.ID, u1.ID, u2.ID, "mark me read")

	err := repo.MarkAsRead(ctx, msg.ID)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, msg.ID)
	require.NoError(t, err)
	assert.NotNil(t, got.ReadAt)
}

func TestPostgresMessageRepository_MarkAllAsRead(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("mar_u1")
	u2 := fx.CreateUniqueUser("mar_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	fx.CreateMessage(conv.ID, u1.ID, u2.ID, "msg1")
	fx.CreateMessage(conv.ID, u1.ID, u2.ID, "msg2")

	err := repo.MarkAllAsRead(ctx, conv.ID, u2.ID)
	assert.NoError(t, err)
}

func TestPostgresMessageRepository_MarkAsDelivered(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("mdel_u1")
	u2 := fx.CreateUniqueUser("mdel_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	msg := fx.CreateMessage(conv.ID, u1.ID, u2.ID, "deliver me")

	err := repo.MarkAsDelivered(ctx, msg.ID)
	require.NoError(t, err)

	got, err := repo.GetByID(ctx, msg.ID)
	require.NoError(t, err)
	assert.NotNil(t, got.DeliveredAt)
}

func TestPostgresMessageRepository_GetUnreadCount(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("unread_u1")
	u2 := fx.CreateUniqueUser("unread_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	fx.CreateMessage(conv.ID, u1.ID, u2.ID, "unread 1")
	fx.CreateMessage(conv.ID, u1.ID, u2.ID, "unread 2")

	count, err := repo.GetUnreadCount(ctx, conv.ID, u2.ID)
	require.NoError(t, err)
	assert.Equal(t, 2, count)
}

func TestPostgresMessageRepository_GetLatestMessage(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("latest_u1")
	u2 := fx.CreateUniqueUser("latest_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	fx.CreateMessage(conv.ID, u1.ID, u2.ID, "first msg")
	time.Sleep(2 * time.Millisecond)
	last := fx.CreateMessage(conv.ID, u2.ID, u1.ID, "last msg")

	got, err := repo.GetLatestMessage(ctx, conv.ID, u1.ID)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, last.ID, got.ID)
}

func TestPostgresMessageRepository_SoftDeleteForUser(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("sdel_mu1")
	u2 := fx.CreateUniqueUser("sdel_mu2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	msg := fx.CreateMessage(conv.ID, u1.ID, u2.ID, "soft delete me")

	err := repo.SoftDeleteForUser(ctx, msg.ID, u1.ID)
	assert.NoError(t, err)
}

func TestPostgresMessageRepository_HardDelete(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("hdel_mu1")
	u2 := fx.CreateUniqueUser("hdel_mu2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	msg := fx.CreateMessage(conv.ID, u1.ID, u2.ID, "hard delete me")

	// HardDelete tombstones the message (replaces content with '[deleted]'), does not remove the row.
	err := repo.HardDelete(ctx, msg.ID)
	require.NoError(t, err)
}
