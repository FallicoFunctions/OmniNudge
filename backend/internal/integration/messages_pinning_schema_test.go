package integration

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestMessagePinningSchema_ColumnsAndIndexExist(t *testing.T) {
	db := getTestDB(t)
	resetTables(t, db)

	ctx := context.Background()

	type columnRow struct {
		name       string
		isNullable string
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT column_name, is_nullable
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name = 'messages'
		  AND column_name IN ('pinned', 'pinned_by', 'pinned_at')
	`)
	require.NoError(t, err)
	defer rows.Close()

	found := map[string]columnRow{}
	for rows.Next() {
		var r columnRow
		require.NoError(t, rows.Scan(&r.name, &r.isNullable))
		found[r.name] = r
	}
	require.NoError(t, rows.Err())
	require.Len(t, found, 3, "expected pinned schema columns on messages table")
	require.Equal(t, "NO", found["pinned"].isNullable, "pinned should be NOT NULL")

	var indexDef string
	err = db.Pool.QueryRow(ctx, `
		SELECT indexdef
		FROM pg_indexes
		WHERE schemaname = 'public'
		  AND tablename = 'messages'
		  AND indexname = 'idx_messages_conversation_pinned'
	`).Scan(&indexDef)
	require.NoError(t, err)
	require.Contains(t, strings.ToLower(indexDef), "where (pinned = true)")
}

func TestMessagePinningSchema_MaxTenPinnedPerConversation(t *testing.T) {
	db := getTestDB(t)
	resetTables(t, db)

	ctx := context.Background()

	userRepo := models.NewUserRepository(db.Pool)
	user1 := createUser(t, userRepo, "pin_schema_u1", "user")
	user2 := createUser(t, userRepo, "pin_schema_u2", "user")

	conversationRepo := models.NewConversationRepository(db.Pool)
	conv, err := conversationRepo.Create(ctx, user1.ID, user2.ID)
	require.NoError(t, err)

	insertPinned := func(seq int) error {
		_, execErr := db.Pool.Exec(ctx, `
			INSERT INTO messages (
				conversation_id, sender_id, recipient_id, encrypted_content, message_type,
				pinned, pinned_by, pinned_at
			)
			VALUES ($1, $2, $3, $4, 'text', TRUE, $5, $6)
		`, conv.ID, user1.ID, user2.ID, fmt.Sprintf("msg-%d", seq), user1.ID, time.Now().UTC())
		return execErr
	}

	for i := 1; i <= 10; i++ {
		require.NoError(t, insertPinned(i), "insert %d should succeed", i)
	}

	err = insertPinned(11)
	require.Error(t, err, "11th pinned message should violate max-10 cap")

	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr)
	require.Equal(t, "messages_max_pinned_per_conversation", pgErr.ConstraintName)
}

