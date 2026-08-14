package models_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func TestOmniChatGroupSchemaSupportsUsersCharactersAndInvites(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	for _, table := range []string{
		"omnichat_groups", "omnichat_group_members", "omnichat_group_personas",
		"omnichat_group_messages", "omnichat_group_message_attachments", "omnichat_group_invites",
	} {
		var exists bool
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&exists))
		require.Truef(t, exists, "expected %s to exist", table)
	}
}
