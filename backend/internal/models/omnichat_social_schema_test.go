package models_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/omninudge/backend/internal/database"
	"github.com/omninudge/backend/internal/models"
	"github.com/stretchr/testify/require"
)

func TestOmniChatPublicMediaAssetJSONOmitsPrivateChatProvenance(t *testing.T) {
	encoded, err := json.Marshal(models.OmniChatPublicMediaAsset{
		ID:         uuid.New(),
		Kind:       models.OmniChatMediaKindImage,
		Visibility: models.OmniChatAssetVisibilityPublic,
		FileType:   "image/webp",
		ContentURL: "/api/v1/omnichat/explore/media/example/content",
		CreatedAt:  time.Now(),
	})
	require.NoError(t, err)

	serialized := string(encoded)
	for _, privateField := range []string{
		"owner_user_id", "conversation_id", "source_message_id",
		"generation_job_id", "prompt", "scene",
	} {
		require.Falsef(t, strings.Contains(serialized, privateField), "public media JSON exposed %s", privateField)
	}
}

func TestOmniChatSocialSchemaSupportsImmutableSharingAndEngagement(t *testing.T) {
	ctx := context.Background()
	db, err := database.NewTest()
	require.NoError(t, err)
	t.Cleanup(db.Close)
	require.NoError(t, db.Migrate(ctx))

	for _, table := range []string{
		"omnichat_chat_snapshots",
		"omnichat_chat_snapshot_messages",
		"omnichat_chat_snapshot_attachments",
		"omnichat_publications",
		"omnichat_publication_comments",
		"omnichat_publication_reactions",
		"omnichat_publication_shares",
		"omnichat_publication_bookmarks",
		"omnichat_follows",
		"omnichat_publication_reports",
	} {
		var exists bool
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT to_regclass('public.' || $1) IS NOT NULL`, table).Scan(&exists))
		require.Truef(t, exists, "expected %s to exist", table)
	}

	for _, trigger := range []string{
		"trg_omnichat_publication_reaction_counts",
		"trg_omnichat_publication_comment_counts",
		"trg_omnichat_publication_share_counts",
	} {
		var exists bool
		require.NoError(t, db.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = $1)`, trigger).Scan(&exists))
		require.Truef(t, exists, "expected %s to exist", trigger)
	}
}
