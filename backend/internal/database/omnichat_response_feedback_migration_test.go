package database

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOmniChatResponseFeedbackMigrationKeepsSnapshotsServerSide(t *testing.T) {
	ctx := context.Background()
	db, err := NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))

	var snapshotType, stateType string
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT data_type FROM information_schema.columns
		WHERE table_name = 'omnichat_response_feedback' AND column_name = 'response_snapshot'
	`).Scan(&snapshotType))
	require.NoError(t, db.Pool.QueryRow(ctx, `
		SELECT data_type FROM information_schema.columns
		WHERE table_name = 'omnichat_response_feedback' AND column_name = 'scene_state_snapshot'
	`).Scan(&stateType))
	require.Equal(t, "text", snapshotType)
	require.Equal(t, "jsonb", stateType)
}
