package repository_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/repository"
	"github.com/omninudge/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPostgresMessageReactionRepository_AddAndRemove(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageReactionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("mr_u1")
	u2 := fx.CreateUniqueUser("mr_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	msg := fx.CreateMessage(conv.ID, u1.ID, u2.ID, "react to me")

	reaction, err := repo.AddReaction(ctx, msg.ID, u2.ID, "👍")
	require.NoError(t, err)
	require.NotNil(t, reaction)
	assert.NotZero(t, reaction.ID)

	err = repo.RemoveReaction(ctx, reaction.ID)
	require.NoError(t, err)
}

func TestPostgresMessageReactionRepository_GetByID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageReactionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("mr_byid_u1")
	u2 := fx.CreateUniqueUser("mr_byid_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	msg := fx.CreateMessage(conv.ID, u1.ID, u2.ID, "content")

	reaction, _ := repo.AddReaction(ctx, msg.ID, u2.ID, "❤️")

	tests := []struct {
		name    string
		id      int
		wantNil bool
	}{
		{"existing", reaction.ID, false},
		{"non-existent", 999999, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := repo.GetByID(ctx, tc.id)
			if tc.wantNil {
				assert.Nil(t, got)
			} else {
				require.NoError(t, err)
				require.NotNil(t, got)
				assert.Equal(t, reaction.ID, got.ID)
			}
		})
	}
}

func TestPostgresMessageReactionRepository_GetReactionsByMessageID(t *testing.T) {
	db := testutil.NewTestDatabase(t)
	repo := repository.NewPostgresMessageReactionRepository(db.Pool)
	fx := testutil.NewFixtures(t, db)
	ctx := context.Background()

	u1 := fx.CreateUniqueUser("mr_list_u1")
	u2 := fx.CreateUniqueUser("mr_list_u2")
	conv := fx.CreateConversation(u1.ID, u2.ID)
	msg := fx.CreateMessage(conv.ID, u1.ID, u2.ID, "reactions here")

	_, _ = repo.AddReaction(ctx, msg.ID, u2.ID, "🔥")

	summaries, hasMore, err := repo.GetReactionsByMessageID(ctx, msg.ID, u1.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, summaries)
	_ = hasMore
}
