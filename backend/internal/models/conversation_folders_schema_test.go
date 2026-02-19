package models

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConversationFoldersSchemaConstraints(t *testing.T) {
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)

	ctx := context.Background()
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, database.ResetTestData(ctx, db))

	userRepo := NewUserRepository(db.Pool)
	conversationRepo := NewConversationRepository(db.Pool)

	userA := &User{
		Username:     fmt.Sprintf("folders_a_%d", time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "hash",
	}
	userB := &User{
		Username:     fmt.Sprintf("folders_b_%d", time.Now().UnixNano()%1_000_000_000),
		PasswordHash: "hash",
	}
	require.NoError(t, userRepo.Create(ctx, userA))
	require.NoError(t, userRepo.Create(ctx, userB))

	t.Run("folder limit per user is enforced", func(t *testing.T) {
		for i := 0; i < 50; i++ {
			_, err := db.Pool.Exec(ctx, `
				INSERT INTO conversation_folders (user_id, name, position)
				VALUES ($1, $2, $3)
			`, userA.ID, fmt.Sprintf("Folder %02d", i+1), i)
			require.NoError(t, err)
		}

		_, err := db.Pool.Exec(ctx, `
			INSERT INTO conversation_folders (user_id, name, position)
			VALUES ($1, $2, $3)
		`, userA.ID, "Folder 51", 51)
		require.Error(t, err)
		assert.Contains(t, strings.ToLower(err.Error()), "folder limit exceeded")
	})

	t.Run("folder name unique per user", func(t *testing.T) {
		_, err := db.Pool.Exec(ctx, `
			INSERT INTO conversation_folders (user_id, name, position)
			VALUES ($1, $2, $3)
		`, userB.ID, "Inbox", 1)
		require.NoError(t, err)

		_, err = db.Pool.Exec(ctx, `
			INSERT INTO conversation_folders (user_id, name, position)
			VALUES ($1, $2, $3)
		`, userB.ID, "Inbox", 2)
		require.Error(t, err)
		assert.Contains(t, strings.ToLower(err.Error()), "uq_conversation_folders_user_name")
	})

	t.Run("folder member unique on folder and conversation", func(t *testing.T) {
		var folderID int
		err := db.Pool.QueryRow(ctx, `
			INSERT INTO conversation_folders (user_id, name, position)
			VALUES ($1, $2, $3)
			RETURNING id
		`, userB.ID, "Pinned", 3).Scan(&folderID)
		require.NoError(t, err)

		conv, err := conversationRepo.Create(ctx, userA.ID, userB.ID)
		require.NoError(t, err)

		_, err = db.Pool.Exec(ctx, `
			INSERT INTO conversation_folder_members (folder_id, conversation_id)
			VALUES ($1, $2)
		`, folderID, conv.ID)
		require.NoError(t, err)

		_, err = db.Pool.Exec(ctx, `
			INSERT INTO conversation_folder_members (folder_id, conversation_id)
			VALUES ($1, $2)
		`, folderID, conv.ID)
		require.Error(t, err)
		assert.Contains(t, strings.ToLower(err.Error()), "uq_conversation_folder_members")
	})

	t.Run("folder membership limit trigger exists", func(t *testing.T) {
		var exists bool
		err := db.Pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM pg_trigger
				WHERE tgname = 'trg_folder_membership_limit'
			)
		`).Scan(&exists)
		require.NoError(t, err)
		assert.True(t, exists)
	})
}
