package models_test

import (
	"context"
	"testing"

	"github.com/omninudge/backend/internal/database"
	"github.com/stretchr/testify/require"
)

func TestOmniChatVoiceSchemaPersistsCharacterVoicesAudioAndCalls(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))
	for _, table := range []string{"omnichat_persona_voices", "omnichat_speech_audio", "omnichat_call_sessions"} {
		var exists bool
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&exists))
		require.Truef(t, exists, "expected %s to exist", table)
	}
}
