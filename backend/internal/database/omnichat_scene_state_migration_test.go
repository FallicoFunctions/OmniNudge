package database

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOmniChatSceneStateMigrationCreatesOwnerScopedStateTable(t *testing.T) {
	ctx := context.Background()
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))

	var ownerType, stateType string
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT data_type FROM information_schema.columns WHERE table_name='omnichat_conversation_scene_states' AND column_name='owner_user_id'`).Scan(&ownerType))
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT data_type FROM information_schema.columns WHERE table_name='omnichat_conversation_scene_states' AND column_name='state'`).Scan(&stateType))
	require.Equal(t, "integer", ownerType)
	require.Equal(t, "jsonb", stateType)
}
